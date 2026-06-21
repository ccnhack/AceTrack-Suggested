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
  SupportMetricsService, syncMutex
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
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/ai-summary', apiKeyGuard, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "Messages array required" });
  
  try {
    const groqKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set" });

    // 🛡️ [AI_ROUTER_V2] (v2.6.617): Use hardened router with retry/failover and 10s timeout for user-facing summaries
    const aiRes = await fetchWithAIFallback({
      messages: messages,
      apiKey: groqKey,
      temperature: 0.5,
      max_tokens: 512,
      timeoutMs: 10000
    });
    const data = await aiRes.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      res.json({ success: true, text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: data.error?.message || "AI Error" });
    }
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/reassign-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId, targetAgentId } = req.body;
  // 🛡️ [VAPT-F05] (v2.6.556): Use JWT-verified identity instead of spoofable header
  const requesterId = req.user?.id;
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
    // 🛡️ [AI_TIMEOUT_GUARD] (v2.6.617): 3s timeout to prevent request stalling on slow AI providers
    try {
      const AI_TIMEOUT_MS = 3000;
      const aiPromise = (async () => {
        const groqKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
        if (!groqKey || !issueContext) return null;
        const aiRes = await fetchWithAIFallback({
          messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
          apiKey: groqKey,
          temperature: 0.3, 
          max_tokens: 50,
          timeoutMs: AI_TIMEOUT_MS
        });
        const aiData = await aiRes.json();
        return aiData?.choices?.[0]?.message?.content?.trim() || null;
      })();
      const timeoutPromise = new Promise(r => setTimeout(() => r(null), AI_TIMEOUT_MS));
      const aiText = await Promise.race([aiPromise, timeoutPromise]);
      if (aiText) issueDescription = aiText;
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed (reassign):', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    // 🛡️ [REASSIGN_MSG] (v2.6.650): Differentiate intro message for reassignment vs first assignment
    const isReassignment = oldAgentId && oldAgentId !== 'Unassigned' && oldAgentId !== '' && oldAgentId !== targetAgentId;
    const introText = isReassignment
      ? `To ensure faster resolution, this ticket has been reassigned and will now be handled by ${targetAgent.name}. We're committed to resolving your issue related to ${issueDescription} as quickly as possible.`
      : `Hi ${userName}, I am ${targetAgent.name} and I will be working on resolving the issue related to ${issueDescription}.`;
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: targetAgentId,
      text: introText,
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

    // 🛡️ [v2.6.617] Removed AppState dual-write — data lives in SupportTicket collection

    // 📡 Notify clients via targeted entity_updated event
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticket,
        source: 'api',
        timestamp: Date.now()
      });
    }

    logServerEvent('SUPPORT_TICKET_REASSIGNED', { ticketId, fromAgentId: oldAgentId, toAgentId: targetAgentId });
    res.json({ 
      success: true, 
      message: `Ticket #${ticketId.slice(-4)} reassigned to ${targetAgent.name}`,
      ticket: ticket
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🛡️ [ESCALATION ENDPOINT] (v2.6.345): Allow support staff to escalate tickets to Manager/Team Lead
// Ownership (assignedTo) stays with the original agent. Only escalation metadata is updated.
router.post('/support/escalate-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId, escalationType } = req.body; // escalationType: 'Manager' or 'Team Lead'
  const requesterId = req.user?.id;
  console.log(`[API] POST /support/escalate-ticket: ticket=${ticketId}, type=${escalationType}, requester=${requesterId}`);

  if (!ticketId || !escalationType) {
    return res.status(400).json({ error: 'ticketId and escalationType (Manager or Team Lead) are required' });
  }
  if (!['Manager', 'Team Lead'].includes(escalationType)) {
    return res.status(400).json({ error: 'escalationType must be either "Manager" or "Team Lead"' });
  }

  try {
    // 1. Validate requester is a support employee
    const requesterDoc = await Player.findOne({ id: requesterId }).lean();
    const requester = requesterDoc?.data;
    if (!requester || requester.role !== 'support') {
      return res.status(403).json({ error: 'Only support employees can escalate tickets' });
    }

    // 2. Find the escalation target based on the requester's hierarchy
    const targetField = escalationType === 'Manager' ? 'managerId' : 'teamLeadId';
    const targetId = requester[targetField];
    if (!targetId) {
      return res.status(400).json({ error: `No ${escalationType} configured for your profile. Contact admin to set up your reporting hierarchy.` });
    }

    const targetDoc = await Player.findOne({ id: targetId }).lean();
    const target = targetDoc?.data;
    if (!target) {
      return res.status(404).json({ error: `${escalationType} (ID: ${targetId}) not found in the system` });
    }

    // 3. Load the ticket
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const ticket = ticketDoc.data;

    // 4. Prevent duplicate escalation
    if (ticket.escalatedTo) {
      return res.status(409).json({ error: `Ticket already escalated to ${ticket.escalationType}: ${ticket.escalatedToName}` });
    }

    // 5. Stamp escalation metadata (ownership stays unchanged)
    ticket.escalatedTo = targetId;
    ticket.escalatedToName = target.name || escalationType;
    ticket.escalationType = escalationType;
    ticket.escalatedAt = new Date().toISOString();
    ticket.escalatedBy = requesterId;
    ticket.escalatedByName = requester.name || 'Support Agent';

    // 6. Add system event message
    const eventMsg = {
      id: `escalation-${Date.now()}`,
      senderId: 'system',
      text: `-------- ESCALATED TO ${escalationType.toUpperCase()}: ${target.name || targetId} --------`,
      timestamp: new Date().toISOString(),
      type: 'event'
    };
    ticket.messages = [...(ticket.messages || []), eventMsg];
    ticket.updatedAt = new Date().toISOString();

    // 7. Save
    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    // 8. Notify the escalation target
    if (target.pushTokens?.length > 0) {
      const { sendPushNotification } = await import('../../utils/pushNotifications.mjs').catch(() => ({ sendPushNotification: null }));
      if (sendPushNotification) {
        sendPushNotification(
          target.pushTokens,
          'Ticket Escalated to You ⬆️',
          `${requester.name || 'A support agent'} escalated ticket: "${ticket.title}"`,
          { ticketId: ticket.id, type: 'TICKET_ESCALATED' }
        );
      }
    }

    // 9. Broadcast via Socket.IO
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticket,
        source: 'api',
        timestamp: Date.now()
      });
    }

    logServerEvent('TICKET_ESCALATED', { ticketId, escalationType, targetId, targetName: target.name, requesterId });
    logAudit(req, 'TICKET_ESCALATED', ['supportTickets'], { ticketId, escalationType, targetId }).catch(() => {});

    res.json({
      success: true,
      message: `Ticket escalated to ${escalationType}: ${target.name}`,
      ticket: ticket
    });
  } catch (e) {
    console.error('[API] /support/escalate-ticket error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/rate-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId, rating, feedback } = req.body;
  // 🛡️ [VAPT-F05] (v2.6.556): Use JWT-verified identity
  const userId = req.user?.id;
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

    // 🛡️ [v2.6.617] Removed AppState dual-write — ticket and player data live in distinct collections

    // 📡 Notify clients via targeted entity_updated events
    const io = req.app.get('io');
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticket,
        source: 'api',
        timestamp: Date.now()
      });
    }

    logServerEvent('TICKET_RATED', { ticketId, rating, agentId });
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/claim-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId } = req.body;
  // 🛡️ [VAPT-F05] (v2.6.556): Use JWT-verified identity
  const agentId = req.user?.id;
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
    // 🛡️ [AI_TIMEOUT_GUARD] (v2.6.617): 3s timeout to prevent request stalling on slow AI providers
    try {
      const AI_TIMEOUT_MS = 3000;
      const aiPromise = (async () => {
        const groqKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
        if (!groqKey || !issueContext) return null;
        const aiRes = await fetchWithAIFallback({
          messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
          apiKey: groqKey,
          temperature: 0.3,
          max_tokens: 50,
          timeoutMs: AI_TIMEOUT_MS
        });
        const aiData = await aiRes.json();
        return aiData?.choices?.[0]?.message?.content?.trim() || null;
      })();
      const timeoutPromise = new Promise(r => setTimeout(() => r(null), AI_TIMEOUT_MS));
      const aiText = await Promise.race([aiPromise, timeoutPromise]);
      if (aiText) issueDescription = aiText;
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed (claim):', aiErr.message);
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

    // 🛡️ [v2.6.617] Removed AppState dual-write — data lives in SupportTicket collection

    // 📡 Notify clients via targeted entity_updated event
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticket,
        source: 'api',
        timestamp: Date.now()
      });
    }

    logAudit(req, 'TICKET_CLAIMED', ['supportTickets'], { ticketId, agentId });

    res.json({ success: true, ticket: ticket });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🛡️ [MARK-SEEN ENDPOINT] (v2.6.557): Persist message read-receipts to the database
// Previously, onMarkSeen was local-only (Zustand state), so any sync event would overwrite
// the 'seen' status and cause the blue unread highlight to reappear permanently.
router.post('/support/mark-seen', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId } = req.body;
  const viewerId = req.user?.id || req.headers['x-user-id'];

  if (!ticketId) return res.status(400).json({ error: 'ticketId is required' });
  if (!viewerId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketDoc.data;
    
    // 🛡️ [PER-AGENT READ STATE] (v2.6.558)
    if (!ticket.lastReadBy) ticket.lastReadBy = {};
    ticket.lastReadBy[viewerId] = new Date().toISOString();

    // 🛡️ [GLOBAL READ RECEIPT GUARD] (v2.6.558)
    // Only the assigned agent (or anyone if unassigned) triggers the global 'seen' receipt for the end user.
    // This prevents other agents from clearing the user's unread indicator or marking messages read on behalf of the owner.
    const isAssignedAgent = ticket.assignedTo === viewerId;
    const isUnassigned = !ticket.assignedTo || ticket.assignedTo === 'Unassigned';

    if (isAssignedAgent || isUnassigned) {
      if (ticket.messages) {
        ticket.messages = ticket.messages.map(m => {
          if (m.senderId !== viewerId && m.status !== 'seen' && m.type !== 'event' && m.senderId !== 'system') {
            return { ...m, status: 'seen' };
          }
          return m;
        });
      }
    }

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    // 📡 Broadcast so other clients also see the updated read-receipts
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticketDoc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    res.json({ success: true, changed: true, ticket: ticketDoc.data });
  } catch (e) {
    console.error('[API] /support/mark-seen error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/support/reply-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId, text, image, replyToMsg } = req.body;
  // 🛡️ [VAPT-F05] (v2.6.556): Use JWT-verified identity
  const userId = req.user?.id;
  
  if (!ticketId || (!text && !image)) {
    return res.status(400).json({ error: 'ticketId and text/image are required' });
  }

  try {
    // 🛡️ [RACE_CONDITION_FIX] (v2.6.617): Use atomic $push instead of read-modify-write
    // This prevents two simultaneous replies from overwriting each other.

    // 1. Build the new message object
    const msgText = typeof text === 'string' ? text : (text?.text || String(text || ''));
    const msg = { 
      id: `m-${Date.now()}`, 
      senderId: userId || 'admin', 
      text: msgText, 
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    if (image) msg.image = image;
    if (replyToMsg) {
      msg.replyTo = { 
        id: replyToMsg.id, 
        timestamp: replyToMsg.timestamp, 
        text: replyToMsg.text || '', 
        senderId: replyToMsg.senderId || '' 
      };
    }

    // 2. Determine role for status/assignment logic
    const userDoc = await Player.findOne({ id: userId }).lean();
    const currentUser = userDoc ? userDoc.data : null;
    const isStaff = currentUser && (currentUser.role === 'support' || currentUser.role === 'admin');

    // 3. Read current ticket state for conditional logic
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) {
      return res.status(404).json({ error: 'Ticket not found' });
    }
    const currentTicket = ticketDoc.data;

    // 4. Build atomic update
    const updateOps = {
      $push: { 'data.messages': msg },
      $set: {
        'data.updatedAt': new Date().toISOString(),
        lastUpdated: new Date()
      }
    };

    // Status transitions
    if (!isStaff && currentTicket.status === 'Awaiting Response') {
      updateOps.$set['data.status'] = 'In Progress';
    }

    // Auto-assign if staff replies to unassigned ticket
    if (isStaff && (!currentTicket.assignedTo || currentTicket.assignedTo === 'Unassigned')) {
      updateOps.$set['data.assignedTo'] = userId;
      updateOps.$set['data.assignedAt'] = new Date().toISOString();
    }

    // 5. Atomic update — message is appended without race condition risk
    const updatedDoc = await SupportTicket.findOneAndUpdate(
      { id: ticketId },
      updateOps,
      { new: true }
    );

    if (!updatedDoc) {
      return res.status(404).json({ error: 'Ticket not found during update' });
    }

    // 6. Mark prior messages as seen (best-effort, non-critical)
    // Done as a separate update to avoid complex arrayFilters in the critical path
    await SupportTicket.updateOne(
      { id: ticketId },
      { $set: { 'data.messages.$[elem].status': 'seen' } },
      { arrayFilters: [{ 'elem.senderId': { $ne: userId }, 'elem.status': { $ne: 'seen' }, 'elem.type': { $ne: 'event' }, 'elem.senderId': { $ne: 'system' } }] }
    ).catch(err => console.warn('[REPLY] Mark-seen update failed (non-critical):', err.message));

    // Broadcast
    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: updatedDoc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    res.json({ success: true, ticket: updatedDoc.data });
  } catch (e) {
    console.error('[API] /support/reply-ticket error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});


router.post('/support/update-ticket-status', apiKeyGuard, authGuard, async (req, res) => {
  const { ticketId, status, summary, justification } = req.body;
  // 🛡️ [VAPT-F05] (v2.6.556): Use JWT-verified identity
  const userId = req.user?.id;
  
  if (!ticketId || !status) {
    return res.status(400).json({ error: 'ticketId and status are required' });
  }

  try {
    const ticketDoc = await SupportTicket.findOne({ id: ticketId });
    if (!ticketDoc || !ticketDoc.data) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = ticketDoc.data;
    const oldStatus = ticket.status || 'Open';
    
    ticket.status = status;
    ticket.updatedAt = new Date().toISOString();
    if (summary) ticket.closureSummary = summary;

    const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
    if (activeStates.includes(status)) {
      if (oldStatus === 'Resolved' || oldStatus === 'Closed') {
        ticket.closureSummary = null;
        ticket.closedAt = null;
      }
    } else if (status === 'Resolved' || status === 'Closed') {
      ticket.closedAt = new Date().toISOString();
    }

    const messages = [...(ticket.messages || [])];
    if (justification) {
      messages.push({
        id: `justification-${Date.now()}`,
        senderId: 'system',
        text: `REOPEN JUSTIFICATION: ${justification}`,
        timestamp: new Date().toISOString(),
        type: 'internal'
      });
    }

    if (status !== oldStatus) {
      messages.push({
        id: `system-${Date.now()}`,
        senderId: 'system',
        text: `-------- ${status.toUpperCase()} WAS ${oldStatus.toUpperCase()} --------`,
        timestamp: new Date().toISOString(),
        type: 'event'
      });
    }
    
    ticket.messages = messages;

    ticketDoc.data = ticket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticketDoc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    logAudit(req, 'TICKET_STATUS_CHANGE', ['supportTickets'], { ticketId, oldStatus, newStatus: status });
    res.json({ success: true, ticket: ticketDoc.data });
  } catch (e) {
    console.error('[API] /support/update-ticket-status error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/save-ticket', apiKeyGuard, authGuard, async (req, res) => {
  const { ticket, deviceInfo } = req.body;
  if (!ticket) return res.status(400).json({ error: 'Ticket object required' });

  try {
    // 🛡️ [BUG FIX] (v2.6.345): userDoc was previously undeclared in this scope
    const userId = req.user?.id;
    const userDoc = await Player.findOne({ id: userId }).lean();

    const generatedId = ticket.id || `${Math.floor(1000000 + Math.random() * 9000000)}`;
    
    let ticketDoc = await SupportTicket.findOne({ id: generatedId });
    const isNewInDb = !ticketDoc;
    if (isNewInDb) {
      ticketDoc = new SupportTicket({ id: generatedId, data: {} });
    }

    const enrichmentTicket = { 
      id: generatedId,
      status: ticket.status || 'Open',
      createdAt: ticket.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creatorRole: userDoc?.data?.role || 'user',
      ...ticket, 
      deviceInfo: ticket.deviceInfo || deviceInfo
    };

    if (isNewInDb) {
      // 🛡️ [HIERARCHICAL ASSIGNMENT] (v2.6.345): Route support-staff tickets up the chain
      if (userDoc && userDoc.data && userDoc.data.role === 'support') {
        const creatorLevel = (userDoc.data.supportLevel || '').toLowerCase();
        const isManagerOrLead = ['manager', 'team lead', 'teamlead'].includes(creatorLevel);
        const technicalTypes = ['technical issue', 'bug'];
        const ticketType = (enrichmentTicket.type || '').toLowerCase();

        if (isManagerOrLead) {
          // Manager/Team Lead tickets → assign directly to admin
          enrichmentTicket.assignedTo = 'admin';
        } else if (technicalTypes.includes(ticketType) && userDoc.data.teamLeadId) {
          // Technical issues from lower staff → assign to Team Lead
          enrichmentTicket.assignedTo = userDoc.data.teamLeadId;
        } else if (userDoc.data.managerId) {
          // Process/concern issues from lower staff → assign to Manager
          enrichmentTicket.assignedTo = userDoc.data.managerId;
        } else {
          // Fallback: assign to admin if no hierarchy configured
          enrichmentTicket.assignedTo = 'admin';
        }

        // Look up assigned person's name
        if (enrichmentTicket.assignedTo !== 'admin') {
          const assigneeDoc = await Player.findOne({ id: enrichmentTicket.assignedTo }).lean();
          enrichmentTicket.assignedAgentName = assigneeDoc?.data?.name || 'Support';
        } else {
          enrichmentTicket.assignedAgentName = 'Admin';
        }

        enrichmentTicket.assignedAt = new Date().toISOString();
        enrichmentTicket.assignmentSource = 'hierarchy';
        
        const autoResponse = {
          id: `auto-${Date.now()}`,
          senderId: enrichmentTicket.assignedTo,
          text: 'Thanks for reaching out to AceTrack Support Team, Our team will look into the issue and provide an update shortly',
          timestamp: new Date(Date.now() + 1000).toISOString(),
          status: 'delivered'
        };
        enrichmentTicket.messages = [...(enrichmentTicket.messages || []), autoResponse];
      } else {
        // 🚀 NEW: Automatic Load Balancing for User Tickets (Attendance-Based)
        try {
          const { Attendance } = await import('../../models/HRModels.mjs');
          const { getISTDate } = await import('../../helpers/utils.mjs');
          
          // 1. Get all active support agents
          const agentsDoc = await Player.find({ 
            "data.role": "support", 
            "data.supportStatus": { $nin: ['leave', 'on_leave', 'terminated', 'suspended', 'inactive', 'ex-employee'] } 
          }).lean();
          
          // 2. Query today's attendance to see who is formally checked-in
          const today = getISTDate().split('T')[0];
          const activeAttendance = await Attendance.find({
            date: today,
            checkIn: { $exists: true, $ne: null },
            $or: [
              { checkOut: { $exists: false } },
              { checkOut: null }
            ]
          }).lean();
          
          const checkedInAgentIds = new Set(activeAttendance.map(a => String(a.userId)));
          let availableAgents = agentsDoc.filter(d => d.data && checkedInAgentIds.has(String(d.data.id))).map(d => d.data);

          // Fallback if no one is formally checked in: pick among all active agents
          if (availableAgents.length === 0 && agentsDoc.length > 0) {
             availableAgents = agentsDoc.map(d => d.data);
          }

          if (availableAgents.length > 0) {
            // 3. Find active ticket counts for these agents
            const agentIds = availableAgents.map(a => a.id);
            const activeTickets = await SupportTicket.aggregate([
              { $match: { "data.assignedTo": { $in: agentIds }, "data.status": { $in: ['Open', 'In Progress', 'Awaiting Response'] } } },
              { $group: { _id: "$data.assignedTo", count: { $sum: 1 } } }
            ]);
            
            const loadMap = {};
            agentIds.forEach(id => loadMap[id] = 0);
            activeTickets.forEach(t => loadMap[t._id] = t.count);

            // 4. Pick agent with lowest load
            let selectedAgent = availableAgents[0];
            let minLoad = loadMap[selectedAgent.id];

            for (let i = 1; i < availableAgents.length; i++) {
              const agent = availableAgents[i];
              const load = loadMap[agent.id];
              if (load < minLoad) {
                minLoad = load;
                selectedAgent = agent;
              }
            }

            // 5. Assign ticket
            enrichmentTicket.assignedTo = selectedAgent.id;
            enrichmentTicket.assignedAt = new Date().toISOString();
            enrichmentTicket.assignmentSource = 'auto_load_balancer';
            enrichmentTicket.assignedAgentName = selectedAgent.name || 'Support Agent';

            const ticketTitle = enrichmentTicket.title || '';
            const ticketType = enrichmentTicket.type || '';
            const issueDescription = `${ticketType}: ${ticketTitle}`;
            const userName = (userDoc && userDoc.data && userDoc.data.name) ? userDoc.data.name : 'User';

            const autoResponse = {
              id: `auto-${Date.now()}`,
              senderId: 'system',
              text: 'Thanks for reaching out to AceTrack Support Team, Our team will look into the issue and provide an update shortly',
              timestamp: new Date(Date.now() + 500).toISOString(),
              status: 'delivered'
            };
            const introMsg = {
              id: `intro-${Date.now()}`,
              senderId: selectedAgent.id,
              text: `Hi ${userName}, I am ${selectedAgent.name} and I will be working on resolving your issue.`,
              timestamp: new Date(Date.now() + 1000).toISOString(),
              status: 'delivered'
            };
            
            enrichmentTicket.messages = [...(enrichmentTicket.messages || []), autoResponse, introMsg];
            
            // Update agent metrics
            await Player.updateOne(
              { id: selectedAgent.id },
              { $inc: { "data.metrics.autoAssigned": 1, "data.metrics.totalHandled": 1 }, lastUpdated: new Date() }
            );
          } else {
             // Fallback: No one is checked in and no agents found
             enrichmentTicket.assignedTo = 'admin';
             enrichmentTicket.assignedAt = new Date().toISOString();
             enrichmentTicket.assignmentSource = 'fallback';
             enrichmentTicket.assignedAgentName = 'Admin';
             const autoResponse = {
              id: `auto-${Date.now()}`,
              senderId: 'admin',
              text: 'Thanks for reaching out to AceTrack Support Team, Our team will look into the issue and provide an update shortly',
              timestamp: new Date(Date.now() + 1000).toISOString(),
              status: 'delivered'
            };
            enrichmentTicket.messages = [...(enrichmentTicket.messages || []), autoResponse];
          }
        } catch (assignError) {
          console.error('[API] Auto-assign failed:', assignError);
          // Fallback if load balancer crashes
          enrichmentTicket.assignedTo = 'admin';
          enrichmentTicket.assignedAt = new Date().toISOString();
          enrichmentTicket.assignmentSource = 'fallback_error';
          enrichmentTicket.assignedAgentName = 'Admin';
          const autoResponse = {
            id: `auto-${Date.now()}`,
            senderId: 'admin',
            text: 'Thanks for reaching out to AceTrack Support Team, Our team will look into the issue and provide an update shortly',
            timestamp: new Date(Date.now() + 1000).toISOString(),
            status: 'delivered'
          };
          enrichmentTicket.messages = [...(enrichmentTicket.messages || []), autoResponse];
        }
      }
    }

    ticketDoc.data = enrichmentTicket;
    ticketDoc.lastUpdated = new Date();
    ticketDoc.markModified('data');
    await ticketDoc.save();

    if (io) {
      io.emit('entity_updated', {
        entity: 'supportTickets',
        data: ticketDoc.data,
        source: 'api',
        timestamp: Date.now()
      });
    }

    res.json({ success: true, ticket: ticketDoc.data });
  } catch (e) {
    console.error('[API] /support/save-ticket error:', e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🕐 SHIFT MANAGEMENT SYSTEM (v2.6.673)
// Check-in/Check-out with time rounding, overtime tracking, and
// auto-checkout after 8h 15m grace period.
// ═══════════════════════════════════════════════════════════════

/**
 * Rounds a Date to the nearest 30 minutes.
 * < 15 min → round down to :00
 * 15–44 min → round to :30
 * >= 45 min → round up to next hour :00
 */
function roundToNearest30(date) {
  const d = new Date(date);
  const minutes = d.getMinutes();
  if (minutes < 15) {
    d.setMinutes(0, 0, 0);
  } else if (minutes < 45) {
    d.setMinutes(30, 0, 0);
  } else {
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
  }
  return d;
}

// 🕐 POST /support/check-in — Start shift
router.post('/support/check-in', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (!['support', 'admin', 'superadmin'].includes(playerDoc.data.role)) return res.status(403).json({ error: 'Only support employees and admins can check in' });

  // Prevent double check-in
  const todayStr = new Date().toISOString().split('T')[0];
  const existingCheckin = playerDoc.data.shiftCheckinAt;
  if (existingCheckin && existingCheckin.startsWith(todayStr) && playerDoc.data.shiftStatus === 'on_shift') {
    return res.status(409).json({ 
      error: 'Already checked in today',
      checkinTime: playerDoc.data.shiftCheckinRounded,
      checkoutDue: playerDoc.data.shiftCheckoutDue
    });
  }

  const now = new Date();
  const rounded = roundToNearest30(now);
  const SHIFT_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
  const checkoutDue = new Date(rounded.getTime() + SHIFT_DURATION_MS);

  await Player.updateOne(
    { id: userId },
    { $set: {
      'data.shiftStatus': 'on_shift',
      'data.shiftCheckinAt': now.toISOString(),
      'data.shiftCheckinRounded': rounded.toISOString(),
      'data.shiftCheckoutDue': checkoutDue.toISOString(),
      'data.shiftCheckoutAt': null,
      lastUpdated: new Date()
    }}
  );

  logAudit(req, 'SUPPORT_SHIFT_CHECKIN', ['players'], {
    userId,
    name: playerDoc.data.name,
    email: playerDoc.data.email,
    username: playerDoc.data.username,
    actualTime: now.toISOString(),
    roundedTime: rounded.toISOString(),
    checkoutDue: checkoutDue.toISOString()
  }).catch(() => {});

  console.log(`🕐 [SHIFT] ${userId} checked in at ${now.toLocaleTimeString()} → rounded to ${rounded.toLocaleTimeString()}, checkout due at ${checkoutDue.toLocaleTimeString()}`);

  // 📡 Notify all clients that this agent's shift status changed
  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { 
        id: userId, 
        shiftStatus: 'on_shift',
        shiftCheckinAt: now.toISOString(),
        shiftCheckinRounded: rounded.toISOString(),
        shiftCheckoutDue: checkoutDue.toISOString(),
        shiftCheckoutAt: null
      },
      source: 'shift_checkin',
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    checkinTime: rounded.toISOString(),
    checkinTimeActual: now.toISOString(),
    checkoutDue: checkoutDue.toISOString(),
    shiftStatus: 'on_shift'
  });
}));

// 🕐 POST /support/check-out — End shift
router.post('/support/check-out', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { isAutoCheckout, justification } = req.body || {};
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (!['support', 'admin', 'superadmin'].includes(playerDoc.data.role)) return res.status(403).json({ error: 'Only support employees and admins can check out' });

  const checkinTime = playerDoc.data.shiftCheckinRounded;
  if (!checkinTime) {
    return res.status(400).json({ error: 'No active check-in found' });
  }

  const now = new Date();
  const checkinDate = new Date(checkinTime);
  const totalShiftMs = now.getTime() - checkinDate.getTime();
  
  if (totalShiftMs < 7 * 60 * 60 * 1000 && !isAutoCheckout) {
    if (!justification || justification.trim().length === 0) {
      return res.status(400).json({ error: 'Early checkout justification is required.' });
    }
  }

  const SHIFT_LIMIT_MS = 8 * 60 * 60 * 1000;
  const overtimeMs = Math.max(0, totalShiftMs - SHIFT_LIMIT_MS);

  const updateSet = {
      'data.shiftStatus': 'off_shift',
      'data.shiftCheckoutAt': now.toISOString(),
      lastUpdated: new Date()
  };
  if (justification && justification.trim().length > 0) {
      updateSet['data.shiftCheckoutJustification'] = justification.trim();
  } else {
      updateSet['data.shiftCheckoutJustification'] = null;
  }

  await Player.updateOne(
    { id: userId },
    { $set: updateSet }
  );

  logAudit(req, 'SUPPORT_SHIFT_CHECKOUT', ['players'], {
    userId,
    name: playerDoc.data.name,
    email: playerDoc.data.email,
    username: playerDoc.data.username,
    checkoutTime: now.toISOString(),
    checkinRounded: checkinTime,
    totalShiftMs,
    overtimeMs,
    isAutoCheckout: !!isAutoCheckout,
    justification: justification || null
  }).catch(() => {});

  console.log(`🕐 [SHIFT] ${userId} checked out at ${now.toLocaleTimeString()}. Total: ${Math.floor(totalShiftMs / 3600000)}h ${Math.floor((totalShiftMs % 3600000) / 60000)}m. Overtime: ${Math.floor(overtimeMs / 60000)}m`);

  // 📡 Notify manager if overtime or early checkout occurred
  const isEarly = totalShiftMs < 7 * 60 * 60 * 1000 && !isAutoCheckout;
  if (overtimeMs > 0 || isEarly) {
    try {
      let managerId = playerDoc.data.managerId;
      if (!managerId && playerDoc.data.supportLevel?.toLowerCase() === 'manager') {
        managerId = 'admin';
      }
      if (managerId) {
        const managerDoc = await Player.findOne({ id: managerId }).lean();
        const managerData = managerDoc?.data;
        if (managerData?.pushTokens?.length > 0) {
          const { sendPushNotification } = await import('../../utils/pushNotifications.mjs').catch(() => ({ sendPushNotification: null }));
          if (sendPushNotification) {
            if (overtimeMs > 0) {
              const overtimeMinutes = Math.floor(overtimeMs / 60000);
              sendPushNotification(
                managerData.pushTokens,
                '⏰ Employee Overtime Alert',
                `${playerDoc.data.name || userId} worked ${overtimeMinutes} min overtime${isAutoCheckout ? ' (auto-checkout)' : ''}.`,
                { type: 'OVERTIME_ALERT', userId, overtimeMs }
              );
            } else if (isEarly) {
              sendPushNotification(
                managerData.pushTokens,
                '⚠️ Early Checkout Alert',
                `${playerDoc.data.name || userId} checked out early. Reason: ${justification}`,
                { type: 'EARLY_CHECKOUT_ALERT', userId, justification }
              );
            }
          }
        }
      }
    } catch (e) {
      console.warn('[SHIFT] Manager notification failed:', e.message);
    }

    if (overtimeMs > 0) {
      logAudit(req, 'SUPPORT_OVERTIME_DETECTED', ['players'], {
        userId,
        overtimeMs,
        overtimeMinutes: Math.floor(overtimeMs / 60000),
        isAutoCheckout: !!isAutoCheckout
      }).catch(() => {});
    }
  }

  // 📡 Notify all clients
  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { 
        id: userId, 
        shiftStatus: 'off_shift',
        shiftCheckoutAt: now.toISOString(),
        supportStatus: playerDoc.data.supportStatus || 'active'
      },
      source: 'shift_checkout',
      timestamp: Date.now()
    });
  }

  res.json({
    success: true,
    checkoutTime: now.toISOString(),
    totalShiftMs,
    overtimeMs,
    shiftStatus: 'off_shift'
  });
}));

// 🕐 GET /support/shift-status — Query current shift state
router.get('/support/shift-status', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });

  const d = playerDoc.data;
  res.json({
    success: true,
    shiftStatus: d.shiftStatus || 'off_shift',
    shiftCheckinAt: d.shiftCheckinAt || null,
    shiftCheckinRounded: d.shiftCheckinRounded || null,
    shiftCheckoutAt: d.shiftCheckoutAt || null,
    shiftCheckoutDue: d.shiftCheckoutDue || null,
    shortLeaves: d.shortLeaves || []
  });
}));

// 🕐 POST /support/request-short-leave
router.post('/support/request-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { date, startTime, endTime, reason } = req.body;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });
  if (playerDoc.data.shiftStatus !== 'on_shift') {
    return res.status(400).json({ error: 'You must be on shift to request short leave.' });
  }

  const leaveId = Date.now().toString() + Math.random().toString(36).substring(2, 7);
  const newLeave = {
    id: leaveId,
    date,
    startTime,
    endTime,
    reason,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  await Player.updateOne(
    { id: userId },
    { 
      $push: { 'data.shortLeaves': newLeave },
      $set: { lastUpdated: new Date() }
    }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: userId, shortLeaves: [...(playerDoc.data.shortLeaves || []), newLeave] },
      source: 'request_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true });
}));

// 🕐 POST /support/cancel-short-leave
router.post('/support/cancel-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const userId = req.user?.id;
  const { leaveId } = req.body;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User not found' });

  const shortLeaves = playerDoc.data.shortLeaves || [];
  const targetLeaveIndex = shortLeaves.findIndex(l => l.id === leaveId);
  const targetLeave = shortLeaves[targetLeaveIndex];

  if (!targetLeave || (targetLeave.status !== 'pending' && targetLeave.status !== 'approved')) {
    return res.status(400).json({ error: 'Leave request cannot be cancelled or completed.' });
  }

  const now = new Date();
  
  if (targetLeave.status === 'approved') {
    // Agent is resuming shift after approved leave
    targetLeave.status = 'completed';
    
    // Shift now to IST (UTC + 5.5 hours)
    const nowIstMs = now.getTime() + (5.5 * 60 * 60 * 1000);
    const nowIst = new Date(nowIstMs);
    
    targetLeave.actualReturnTime = `${String(nowIst.getUTCHours()).padStart(2, '0')}:${String(nowIst.getUTCMinutes()).padStart(2, '0')}`;
    
    // Check if late or early by comparing minutes from midnight
    const [endH, endM] = targetLeave.endTime.split(':').map(Number);
    const currentIstMinutes = nowIst.getUTCHours() * 60 + nowIst.getUTCMinutes();
    const endMinutes = endH * 60 + endM;
    
    if (currentIstMinutes > endMinutes) {
      targetLeave.isLateReturn = true;
      targetLeave.lateDurationMinutes = currentIstMinutes - endMinutes;
      targetLeave.isEarlyReturn = false;
      targetLeave.earlyDurationMinutes = 0;
    } else {
      targetLeave.isLateReturn = false;
      targetLeave.lateDurationMinutes = 0;
      targetLeave.isEarlyReturn = true;
      targetLeave.earlyDurationMinutes = endMinutes - currentIstMinutes;
    }
  } else if (targetLeave.status === 'pending') {
    // Agent is cancelling an unapproved request
    targetLeave.status = 'cancelled';
    targetLeave.cancellationNote = 'Cancelled by employee';
    targetLeave.cancelledAt = now.toISOString();
  }

  shortLeaves[targetLeaveIndex] = targetLeave;

  await Player.updateOne(
    { id: userId },
    { 
      $set: { 'data.shortLeaves': shortLeaves, lastUpdated: now }
    }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: userId, shortLeaves: shortLeaves },
      source: 'cancel_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true, updatedLeave: targetLeave });
}));

// 🕐 POST /support/resolve-short-leave
router.post('/support/resolve-short-leave', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const adminId = req.user?.id;
  const { agentId, leaveId, action } = req.body; // action: 'approve' or 'reject'
  
  if (!adminId) return res.status(401).json({ error: 'Authentication required' });

  const adminDoc = await Player.findOne({ id: adminId }).lean();
  if (!adminDoc || !['admin', 'superadmin', 'support'].includes(adminDoc.data?.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (adminId === agentId && adminDoc.data?.role !== 'admin' && adminDoc.data?.role !== 'superadmin') {
    return res.status(403).json({ error: 'You cannot approve your own leave request. Please wait for an Admin.' });
  }

  const agentDoc = await Player.findOne({ id: agentId }).lean();
  if (!agentDoc || !agentDoc.data) return res.status(404).json({ error: 'Agent not found' });

  const shortLeaves = agentDoc.data.shortLeaves || [];
  const targetLeave = shortLeaves.find(l => l.id === leaveId);
  if (!targetLeave) {
    return res.status(400).json({ error: 'Leave request not found' });
  }

  const updatedLeaves = shortLeaves.map(l => {
    if (l.id === leaveId) {
      return { 
        ...l, 
        status: action === 'approve' ? 'approved' : 'rejected',
        resolvedByName: adminDoc.data?.name || 'Admin',
        resolvedByRole: adminDoc.data?.role === 'admin' || adminDoc.data?.role === 'superadmin' ? 'Admin' : 'Manager'
      };
    }
    return l;
  });

  await Player.updateOne(
    { id: agentId },
    { $set: { 'data.shortLeaves': updatedLeaves, lastUpdated: new Date() } }
  );

  if (io) {
    io.emit('entity_updated', {
      entity: 'players',
      data: { id: agentId, shortLeaves: updatedLeaves },
      source: 'resolve_short_leave',
      timestamp: Date.now()
    });
  }

  res.json({ success: true, status: action === 'approve' ? 'approved' : 'rejected' });
}));

  return router;
}
