import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { AppState, AuditLog, SupportInvite, Player, SupportTicket } from '../../models/index.mjs';
import { asyncHandler, getISTTimestamp, getISTDate } from '../../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../../middleware/security.mjs';
import {
  sendOnboardingEmail,
  buildOnboardingHtml,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail,
  sendSuspensionEmail
} from '../../emailService.mjs';
import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';

// 🏗️ PHASE 1 (DATABASE) MIGRATION HELPER
// Ensures that direct backend state mutations are immediately synced to distinct collections
async function syncCollectionsFromState(state) {
    const upsertEntities = async (Model, entities) => {
       if (!entities || entities.length === 0) return;
       const bulkOps = entities.map(entity => {
          const entityId = String(entity.id || entity._id || Math.random().toString(36).substring(7));
          return {
             updateOne: { filter: { id: entityId }, update: { $set: { id: entityId, data: entity, lastUpdated: new Date() } }, upsert: true }
          };
       });
       if (bulkOps.length > 0) await Model.bulkWrite(bulkOps);
    };
    await Promise.all([
      upsertEntities(Player, state?.data?.players),
      upsertEntities(SupportTicket, state?.data?.supportTickets)
    ]);
}

export default function ({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions,
  syncMutex
}) {
  const router = express.Router();

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/support/transfer-tickets', apiKeyGuard, authGuard, async (req, res) => {
  const { fromAgentId, toAgentId } = req.body;
  console.log(`[API] POST /support/transfer-tickets: from=${fromAgentId}, to=${toAgentId}`);
  // 🛡️ [RBAC HARDENING] (v2.6.475): Use JWT-verified role instead of spoofable header
  if (req.userRole !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
  if (!fromAgentId || !toAgentId) return res.status(400).json({ error: 'Both fromAgentId and toAgentId are required' });
  if (fromAgentId === toAgentId) return res.status(400).json({ error: 'Source and target agent cannot be the same' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const [fromDoc, toDoc] = await Promise.all([
      Player.findOne({ id: fromAgentId }).lean(),
      Player.findOne({ id: toAgentId }).lean()
    ]);
    const fromAgent = fromDoc?.data;
    const toAgent = toDoc?.data;
    
    if (!fromAgent) return res.status(404).json({ error: "Source agent not found" });
    if (!toAgent || toAgent.role !== 'support' || toAgent.supportStatus !== 'active') {
      return res.status(404).json({ error: "Target agent not found or not active" });
    }

    // Bulk update tickets assigned to the source agent
    const result = await SupportTicket.updateMany(
      { 
        "data.assignedTo": fromAgentId,
        "data.status": { $in: ['Open', 'In Progress', 'Awaiting Response'] }
      },
      { 
        $set: { 
          "data.assignedTo": toAgentId,
          "data.assignedAt": new Date().toISOString(),
          "data.reassignedFrom": fromAgentId,
          lastUpdated: new Date()
        } 
      }
    );

    const transferCount = result.modifiedCount || 0;

    // 📡 [REAL-TIME SYNC FIX] Ensure clients pull the updated assignedTo status
    if (io && transferCount > 0) {
      io.emit('data_updated', { 
         keys: ['supportTickets'], 
         version: null 
      });
    }

    logServerEvent('SUPPORT_TICKETS_TRANSFERRED', { fromAgentId, toAgentId, count: transferCount });
    res.json({ success: true, transferred: transferCount, message: `${transferCount} ticket(s) transferred to ${toAgent.name}` });
  } catch (e) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});

router.post('/support/ai-summary', apiKeyGuard, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "Messages array required" });
  
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set" });

    const aiRes = await fetchWithAIFallback({
      messages: messages,
      apiKey: groqKey,
      temperature: 0.5,
      max_tokens: 512
    });
    const data = await aiRes.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      res.json({ success: true, text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: data.error?.message || "AI Error" });
    }
  } catch (e) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});

router.post('/support/reassign-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, targetAgentId } = req.body;
  const requesterId = req.headers['x-user-id'];
  console.log(`[API] POST /support/reassign-ticket: ticket=${ticketId}, to=${targetAgentId}, requester=${requesterId}`);
  
  if (!ticketId || !targetAgentId) return res.status(400).json({ error: 'Both ticketId and targetAgentId are required' });

  try {
    // 🛡️ [AUTH HARDENING] (v2.6.438): Allow Admin, Team Lead, and Manager to reassign
    const requesterDoc = await Player.findOne({ id: requesterId }).lean();
    const requester = requesterDoc ? requesterDoc.data : null;
    const requesterLevel = requester ? (requester.supportLevel || '') : '';
    const requesterRole = requester ? (requester.role || '').toLowerCase() : '';
    
    const isAuthorizedRequester = requesterId === 'admin' || requesterRole === 'admin' || ['Team Lead', 'Manager'].includes(requesterLevel);
    if (!isAuthorizedRequester) return res.status(403).json({ error: 'System Administrator or Support Management privileges required' });

    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections scoped efficiently
    const [targetAgentDoc, ticketDoc] = await Promise.all([
      Player.findOne({ id: String(targetAgentId) }).lean(),
      SupportTicket.findOne({ id: String(ticketId) })
    ]);
    const targetAgent = targetAgentDoc ? targetAgentDoc.data : null;
    
    let isAuthorized = false;
    if (targetAgent) {
      const role = (targetAgent.role || '').toLowerCase();
      const status = (targetAgent.supportStatus || '').toLowerCase();
      const level = (targetAgent.supportLevel || '').toLowerCase();
      
      // 🛡️ [SMART LIFECYCLE GUARD] (v2.6.249)
      const hasActiveTermination = !!targetAgent.terminatedAt && (!targetAgent.reOnboardedAt || new Date(targetAgent.terminatedAt) > new Date(targetAgent.reOnboardedAt));

      const isExplicitlyInactive = 
        ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || 
        ['ex-employee', 'terminated'].includes(level) ||
        hasActiveTermination;
      
      const isActiveSupport = role === 'support' && !isExplicitlyInactive;
      const isActiveAdmin = role === 'admin' && !isExplicitlyInactive;

      isAuthorized = isActiveSupport || isActiveAdmin;
    }
    
    if (!targetAgent || !isAuthorized) {
      console.error(`[API] Reassign Ticket 404 - targetAgent found: ${!!targetAgent}, isAuthorized: ${isAuthorized}, role: ${targetAgent?.role}, status: ${targetAgent?.supportStatus}`);
      return res.status(404).json({ error: "Target agent not found, inactive, or unauthorized" });
    }

    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketDoc.data;

    const oldAgentId = ticket.assignedTo;
    
    // Perform reassignment
    ticket.assignedTo = targetAgentId;
    ticket.assignedAt = new Date().toISOString();
    ticket.reassignedFrom = oldAgentId;
    ticket.assignedAgentName = targetAgent.name;

    // 🛡️ [AUTO-INTRO MESSAGE] Generate personalized greeting on reassign
    const ticketUserId = ticket.userId;
    const userDoc = await Player.findOne({ id: ticketUserId }).lean();
    const userData = userDoc ? userDoc.data : null;
    const userName = (userData && userData.name) ? userData.name : 'User';

    // 🛡️ [AUTO-INTRO MESSAGE] Generate personalized greeting on reassign
    const ticketTitle = ticket.title || '';
    const ticketType = ticket.type || '';
    const firstUserMsg = (ticket.messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetchWithAIFallback({
          messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
          apiKey: groqKey,
          temperature: 0.3, 
          max_tokens: 50
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: targetAgentId,
      text: `Hi ${userName}, I am ${targetAgent.name} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    ticket.messages = [...(ticket.messages || []), introMsg];
    ticket.status = 'In Progress';
    ticket.updatedAt = new Date().toISOString();

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    // 🛡️ [DUAL-PERSISTENCE SYNC] (v2.6.438)
    // Update the monolithic AppState blob to ensure immediate visibility for all clients
    const latestState = await AppState.findOne().sort({ version: -1 });
    if (latestState && latestState.data && latestState.data.supportTickets) {
      const tickets = latestState.data.supportTickets;
      const idx = tickets.findIndex(t => t.id === ticketId);
      if (idx !== -1) {
        tickets[idx] = ticket;
        latestState.markModified('data');
        latestState.version += 1;
        await latestState.save();
        console.log(`[SYNC] Ticket ${ticketId} synced to AppState v${latestState.version} (Reassign)`);
      }
    }

    // 📡 [REAL-TIME SYNC FIX] Ensure clients pull the updated In Progress status
    if (io) {
      io.emit('data_updated', { 
         keys: ['supportTickets'], 
         version: latestState ? latestState.version : null 
      });
    }

    logServerEvent('SUPPORT_TICKET_REASSIGNED', { ticketId, fromAgentId: oldAgentId, toAgentId: targetAgentId });
    res.json({ 
      success: true, 
      message: `Ticket #${ticketId.slice(-4)} reassigned to ${targetAgent.name}`,
      ticket: ticket
    });
  } catch (e) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});

router.post('/support/rate-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, rating, feedback } = req.body;
  const userId = req.headers['x-user-id'];
  console.log(`[API] POST /support/rate-ticket: ticket=${ticketId}, user=${userId}, rating=${rating}`);
  
  if (!ticketId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Valid ticketId and rating (1-5) required' });
  }

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });

    const ticket = ticketDoc.data;
    if (ticket.userId !== userId) {
      return res.status(403).json({ error: "You can only rate your own tickets" });
    }
    if (ticket.status !== 'Closed' && ticket.status !== 'Resolved') {
      return res.status(400).json({ error: "Only closed or resolved tickets can be rated" });
    }
    if (ticket.rating) {
      return res.status(400).json({ error: "This ticket has already been rated" });
    }

    ticket.rating = rating;
    if (feedback) ticket.ratingFeedback = feedback;
    ticket.ratedAt = new Date().toISOString();

    // Update agent's overall metrics
    const agentId = ticket.assignedTo;
    if (agentId) {
      const playerDoc = await Player.findOne({ id: agentId });
      if (playerDoc && playerDoc.data) {
        const p = playerDoc.data;
        if (!p.metrics) p.metrics = {};
        const oldRatedCount = p.metrics.ratedTickets || 0;
        const oldAvg = p.metrics.avgRating || 0;
        
        p.metrics.avgRating = ((oldAvg * oldRatedCount) + rating) / (oldRatedCount + 1);
        p.metrics.ratedTickets = oldRatedCount + 1;
        
        await Player.updateOne(
          { id: agentId },
          { $set: { "data.metrics": p.metrics }, lastUpdated: new Date() }
        );
      }
    }

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    // 📡 [REAL-TIME SYNC FIX] Sync ticket and player metrics to AppState
    const latestState = await AppState.findOne().sort({ version: -1 });
    if (latestState && latestState.data) {
      let stateUpdated = false;
      const stateData = latestState.data;

      // Update Support Ticket
      if (Array.isArray(stateData.supportTickets)) {
        const ticketIdx = stateData.supportTickets.findIndex(t => t.id === ticketId);
        if (ticketIdx !== -1) {
          stateData.supportTickets[ticketIdx] = ticket;
          stateUpdated = true;
        }
      }

      // Update Agent Metrics
      if (agentId && Array.isArray(stateData.players)) {
        const agentIdx = stateData.players.findIndex(p => p.id === agentId);
        if (agentIdx !== -1) {
          const playerDoc = await Player.findOne({ id: agentId }).lean();
          if (playerDoc && playerDoc.data) {
            stateData.players[agentIdx] = playerDoc.data;
            stateUpdated = true;
          }
        }
      }

      if (stateUpdated) {
        latestState.version += 1;
        latestState.markModified('data');
        await latestState.save();
        
        const io = req.app.get('io');
        if (io) {
          io.emit('data_updated', {
            version: latestState.version,
            keys: ['supportTickets', 'players']
          });
          console.log(`[SYNC] Ticket ${ticketId} and Agent ${agentId} metrics synced to AppState v${latestState.version}`);
        }
      }
    }

    logServerEvent('TICKET_RATED', { ticketId, rating, agentId });
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});

router.post('/support/claim-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId } = req.body;
  const agentId = req.headers['x-user-id'];
  console.log(`[API] POST /support/claim-ticket: ticketID=${ticketId}, agentID=${agentId}`);
  if (!agentId) return res.status(400).json({ error: "Agent ID required in headers" });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Targeted read/write from distinct collections
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) return res.status(404).json({ error: "Ticket not found" });
    const ticket = ticketDoc.data;

    const [agentDoc, userDoc] = await Promise.all([
      Player.findOne({ id: agentId }).lean(),
      Player.findOne({ id: ticket.userId }).lean()
    ]);
    
    const agentData = agentDoc ? agentDoc.data : null;
    const userData = userDoc ? userDoc.data : null;

    if (ticket.assignedTo) return res.status(409).json({ error: "Ticket already assigned" });

    // Assign to agent
    ticket.assignedTo = agentId;
    ticket.assignedAt = new Date().toISOString();
    ticket.assignmentSource = 'manual_pool';

    const agentName = (agentData && agentData.name) ? agentData.name : 'Support Agent';
    ticket.assignedAgentName = agentName;

    // 🛡️ [AUTO-INTRO MESSAGE] (v2.6.295): Generate personalized greeting on claim
    const userName = (userData && userData.name) ? userData.name : 'User';

    // Build AI issue description from ticket title + first user message
    const ticketTitle = ticket.title || '';
    const ticketType = ticket.type || '';
    const firstUserMsg = (ticket.messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetchWithAIFallback({
          messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
          apiKey: groqKey,
          temperature: 0.3,
          max_tokens: 50
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: agentId,
      text: `Hi ${userName}, I am ${agentName} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    ticket.messages = [...(ticket.messages || []), introMsg];
    ticket.status = 'In Progress';
    ticket.updatedAt = new Date().toISOString();

    if (agentId) {
      await Player.updateOne(
        { id: agentId },
        { $inc: { "data.metrics.manualPicks": 1, "data.metrics.totalHandled": 1 }, lastUpdated: new Date() }
      );
    }

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    // 🛡️ [DUAL-PERSISTENCE SYNC] (v2.6.438)
    // Update the monolithic AppState blob to ensure immediate visibility for all clients
    const latestState = await AppState.findOne().sort({ version: -1 });
    if (latestState && latestState.data && latestState.data.supportTickets) {
      const tickets = latestState.data.supportTickets;
      const idx = tickets.findIndex(t => t.id === ticketId);
      if (idx !== -1) {
        tickets[idx] = ticket;
        latestState.markModified('data');
        latestState.version += 1;
        await latestState.save();
        console.log(`[SYNC] Ticket ${ticketId} synced to AppState v${latestState.version} (Claim)`);
      }
    }

    // 📡 [REAL-TIME SYNC FIX] Ensure clients pull the updated In Progress status
    if (io) {
      io.emit('data_updated', { 
         keys: ['supportTickets'], 
         version: latestState ? latestState.version : null 
      });
    }

    logAudit(req, 'TICKET_CLAIMED', ['supportTickets'], { ticketId, agentId });

    res.json({ success: true, ticket: ticket });
  } catch (e) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : e.message });
  }
});


  return router;
}
