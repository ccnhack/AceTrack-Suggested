import express from 'express';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppState, AuditLog, SupportInvite, Player, SupportTicket, PlayerSession } from '../../models/index.mjs';
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
  syncMutex
}) {
  const router = express.Router();

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.get('/debug/active-sessions', async (req, res) => {
  try {
    const liveDocs = await Player.find({ "data.isLive": true }).lean();
    const sessions = liveDocs.map(doc => {
      const s = doc.data;
      return {
        socketId: s.liveSocketId,
        userId: s.id,
        startTime: s.liveSessionStart,
        deviceName: s.liveDeviceName,
        userAgent: s.liveUserAgent,
        durationMs: Date.now() - (s.liveSessionStart || Date.now())
      };
    });
    const connectedSockets = io.sockets.sockets ? io.sockets.sockets.size : 'unknown';
    res.json({ sessions, 
      totalConnectedSockets: connectedSockets,
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.get('/support/session-status/:userId', apiKeyGuard, async (req, res) => {
  const { userId } = req.params;
  try {
    const playerDoc = await Player.findOne({ id: userId }).lean();
    const sessions = [];
    if (playerDoc?.data?.isLive) {
      const sess = playerDoc.data;
      const ua = sess.liveUserAgent || 'Unknown';
      let browserName = 'Browser';
      if (ua.includes('Edg/')) browserName = 'Microsoft Edge';
      else if (ua.includes('OPR/') || ua.includes('Opera')) browserName = 'Opera';
      else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browserName = 'Google Chrome';
      else if (ua.includes('Firefox/')) browserName = 'Firefox';
      else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browserName = 'Safari';
      else if (ua.includes('MSIE') || ua.includes('Trident/')) browserName = 'Internet Explorer';

      sessions.push({
        socketId: sess.liveSocketId,
        startTime: new Date(sess.liveSessionStart).toISOString(),
        durationMs: Date.now() - sess.liveSessionStart,
        deviceName: sess.liveDeviceName || 'Browser',
        browserName,
        userAgent: ua,
        ipAddress: sess.liveIpAddress || 'Unknown',
        isLive: true
      });
    }
    res.json({ userId, sessions, isOnline: sessions.length > 0, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/support/attendance', apiKeyGuard, authGuard, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection
    const playerDocs = await Player.find({ "data.role": "support" }).lean();
    const agents = playerDocs.map(d => d.data);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    // 🛡️ [SESSION TRACKER] (v2.6.620+): Read from PlayerSession collection
    const agentIds = agents.map(a => a.id);
    const allSessionsDb = await PlayerSession.find({ userId: { $in: agentIds } }).lean();
    const sessionsByAgent = {};
    allSessionsDb.forEach(s => {
      if (!sessionsByAgent[s.userId]) sessionsByAgent[s.userId] = [];
      sessionsByAgent[s.userId].push(s);
    });

    // Build per-agent attendance data
    const attendance = agents.map(agent => {
      let sessions = agent.sessionHistory || [];
      const dbSessions = sessionsByAgent[agent.id] || [];
      if (dbSessions.length > 0) {
         sessions = [...sessions, ...dbSessions];
         sessions.sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
      }
      
      // Check if currently online via DB
      const activeSessions = [];
      if (agent.isLive && agent.liveSessionStart) {
        activeSessions.push({
          startTime: new Date(agent.liveSessionStart).toISOString(),
          durationMs: Date.now() - agent.liveSessionStart,
          device: agent.liveDeviceName || 'Browser',
          isLive: true
        });
      }
      const isCurrentlyOnline = activeSessions.length > 0;

      // Today's total hours
      const todaySessions = sessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0)
        + activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);

      // Weekly hours (per day)
      const weeklyDays = [];
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(weekStart);
        dayStart.setDate(dayStart.getDate() + i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const daySessions = sessions.filter(s => {
          const st = new Date(s.startTime);
          return st >= dayStart && st < dayEnd;
        });
        let dayMs = daySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        // Add live session time for today
        if (dayStart <= now && dayEnd > now) {
          dayMs += activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        }
        weeklyDays.push({
          date: dayStart.toISOString().split('T')[0],
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayStart.getDay()],
          totalMs: dayMs
        });
      }

      // Last 20 session entries
      const recentSessions = sessions.slice(-20).reverse();

      // Last seen
      const lastSession = sessions[sessions.length - 1];
      const lastSeen = isCurrentlyOnline ? 'Now' : (lastSession?.endTime || null);

      return {
        id: agent.id,
        name: agent.name,
        isCurrentlyOnline,
        activeSessions,
        todayMs,
        weeklyDays,
        allSessions: sessions, // For client-side date filtering
        recentSessions,
        lastSeen,
        totalSessionCount: sessions.length
      };
    });

    res.json({ attendance, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 🕐 [SESSION HEARTBEAT] (v2.6.345): HTTP-based session fallback for when WebSocket fails
// Called every 2 minutes by the frontend to ensure session is tracked even without WS.
router.post('/support/heartbeat', apiKeyGuard, authGuard, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ error: 'Authentication required' });

  try {
    const now = Date.now();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // 1. Find an open (no endTime) session for this user today
    let openSession = await PlayerSession.findOne({
      userId,
      startTime: { $gte: todayStart },
      endTime: { $exists: false }
    });

    if (openSession) {
      // Extend the existing open session
      openSession.endTime = new Date();
      openSession.durationMs = now - new Date(openSession.startTime).getTime();
      openSession.device = req.headers['user-agent']?.includes('Mobile') ? 'Mobile' : 'Browser';
      await openSession.save();
    } else {
      // Check if WS already started a session (has endTime set by disconnect)
      // If not, create a new HTTP-seeded session
      openSession = await PlayerSession.create({
        userId,
        startTime: new Date(now - 120000), // Assume started ~2min ago (first heartbeat)
        endTime: new Date(),
        durationMs: 120000,
        device: 'Browser (HTTP)',
        userAgent: req.headers['user-agent'] || 'Unknown'
      });
    }

    // 2. Keep Player marked as live (fallback for WS failure)
    await Player.updateOne(
      { id: userId },
      { $set: { "data.isLive": true, "data.lastActive": now, "data.liveSessionStart": openSession.startTime.getTime() } }
    );

    res.json({ success: true, sessionId: openSession._id, durationMs: openSession.durationMs });
  } catch (e) {
    console.error('[HEARTBEAT] Error:', e.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/support/analytics', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Use verified role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    // 🕐 TIME FILTER: Push timestamp filter to MongoDB instead of in-memory JS filter
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    const ticketQuery = {};
    if (fromDate || toDate) {
      ticketQuery["data.createdAt"] = {};
      if (fromDate) ticketQuery["data.createdAt"].$gte = fromDate.toISOString();
      if (toDate) ticketQuery["data.createdAt"].$lte = toDate.toISOString();
    }

    // 🛡️ SCALABILITY FIX (v2.6.316): O(K) Scoped Web Hydration
    const [playerDocs, ticketDocs] = await Promise.all([
      Player.find({ "data.role": "support" }).lean(),
      SupportTicket.find(ticketQuery).lean()
    ]);
    const allPlayers = playerDocs.map(d => d.data);
    const agents = allPlayers;
    const tickets = ticketDocs.map(d => d.data);

    // 🛡️ [SESSION TRACKER] (v2.6.620+): Read from PlayerSession collection
    const agentIds = agents.map(a => a.id);
    const allSessionsDb = await PlayerSession.find({ userId: { $in: agentIds } }).lean();
    const sessionsByAgent = {};
    allSessionsDb.forEach(s => {
      if (!sessionsByAgent[s.userId]) sessionsByAgent[s.userId] = [];
      sessionsByAgent[s.userId].push(s);
    });

    // 📊 Compute detailed per-agent metrics from actual ticket data
    const agentMetrics = agents.map(agent => {
      const agentId = agent.id;
      const agentTickets = tickets.filter(t => t && (String(t.assignedTo) === String(agentId) || String(t.assignedTo) === String(agent.username)));

      // Active caseload (open tickets)
      const activeTickets = agentTickets.filter(t => 
        ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)
      ).length;

      // Closed/Resolved tickets
      const closedResolved = agentTickets.filter(t => 
        t.status === 'Closed' || t.status === 'Resolved'
      );
      const closedResolvedCount = closedResolved.length;

      // Avg Resolution Time (assignedAt → closedAt/resolvedAt)
      const resolutionTimes = closedResolved
        .filter(t => t.assignedAt && (t.closedAt || t.resolvedAt))
        .map(t => {
          const end = new Date(t.closedAt || t.resolvedAt);
          const start = new Date(t.assignedAt);
          return end - start;
        })
        .filter(ms => ms > 0);
      const avgResolutionMs = resolutionTimes.length > 0 
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length 
        : 0;

      // Avg First Response Time (assignedAt → firstResponseAt)
      const frtTimes = agentTickets
        .filter(t => t.assignedAt && t.firstResponseAt)
        .map(t => new Date(t.firstResponseAt) - new Date(t.assignedAt))
        .filter(ms => ms > 0);
      const avgFirstResponseMs = frtTimes.length > 0 
        ? frtTimes.reduce((a, b) => a + b, 0) / frtTimes.length 
        : 0;

      // Tickets Reopened (count tickets that have reopenCount > 0 or were moved from Closed/Resolved back to In Progress)
      const reopenedCount = agentTickets.filter(t => (t.reopenCount || 0) > 0).length;

      // CSAT / User Feedback
      const ratedTickets = agentTickets.filter(t => t.rating && t.rating > 0);
      const csatScore = ratedTickets.length > 0
        ? (ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length).toFixed(1)
        : null;

      // SLA Compliance (resolved within 24h of creation)
      const slaTarget = 24 * 60 * 60 * 1000; // 24 hours
      const slaEligible = closedResolved.filter(t => t.createdAt && (t.closedAt || t.resolvedAt));
      const slaCompliant = slaEligible.filter(t => {
        const resTime = new Date(t.closedAt || t.resolvedAt) - new Date(t.createdAt);
        return resTime <= slaTarget;
      }).length;
      const slaPercent = slaEligible.length > 0 
        ? Math.round((slaCompliant / slaEligible.length) * 100) 
        : null;

      // Escalation Rate (tickets that were reassigned to someone else)
      const escalatedCount = agentTickets.filter(t => t.escalated || t.reassignedFrom === agentId).length;
      const escalationRate = agentTickets.length > 0
        ? Math.round((escalatedCount / agentTickets.length) * 100)
        : 0;

      // 🕒 Agent Activity Timeline (Last 15 Actions)
      let activities = [];
      agentTickets.forEach(t => {
        if (t.assignedAt) activities.push({ type: 'assignment', time: t.assignedAt, ticketId: t.id, title: t.title });
        if (t.closedAt) activities.push({ type: 'closure', time: t.closedAt, ticketId: t.id, title: t.title });
        if (t.resolvedAt) activities.push({ type: 'resolved', time: t.resolvedAt, ticketId: t.id, title: t.title });
        if (t.ratedAt && t.rating) activities.push({ type: 'csat_received', time: t.ratedAt, ticketId: t.id, rating: t.rating });
        if (t.messages) {
          t.messages.forEach(m => {
            if (m.senderId === agentId) {
              activities.push({ type: 'reply', time: m.timestamp, ticketId: t.id, text: m.text });
            }
          });
        }
      });
      activities.sort((a,b) => new Date(b.time) - new Date(a.time));
      const activityTimeline = activities.slice(0, 15);

      // 🕐 [SESSION DATA] (v2.6.267): Include attendance summary in analytics
      let agentSessions = agent.sessionHistory || [];
      const dbSessions = sessionsByAgent[agentId] || [];
      if (dbSessions.length > 0) {
         agentSessions = [...agentSessions, ...dbSessions];
         agentSessions.sort((a,b) => new Date(a.startTime) - new Date(b.startTime));
      }
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySessions = agentSessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayActiveMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
      
      // Check if currently online
      let isCurrentlyOnline = !!agent.isLive;

      return {
        id: agentId,
        name: agent.name || `${agent.firstName} ${agent.lastName}`,
        email: agent.email,
        status: agent.supportStatus,
        level: agent.supportLevel || 'Trainee',
        score: SupportMetricsService.calculateWeightedScore(agent.metrics || {}),
        stats: {
          ...(agent.metrics || {}),
          activeTickets,
          closedResolvedCount,
          avgResolutionMs,
          avgFirstResponseMs,
          reopenedCount,
          csatScore: csatScore ? parseFloat(csatScore) : null,
          slaPercent,
          escalationRate,
          totalHandled: agentTickets.length,
          manualPicks: agent.metrics?.manualPicks || 0
        },
        activityTimeline,
        attendance: {
          isCurrentlyOnline,
          todayActiveMs,
          totalSessions: agentSessions.length,
          lastSeen: isCurrentlyOnline ? 'Now' : (agentSessions[agentSessions.length - 1]?.endTime || null)
        }
      };
    });

    // Sort leaderboard by score desc
    agentMetrics.sort((a, b) => b.score - a.score);

    // Global stats
    const allRatings = agents.map(a => a.metrics?.avgRating || 0).filter(r => r > 0);
    const globalAvgRating = allRatings.length > 0 ? (allRatings.reduce((a,b) => a+b, 0) / allRatings.length) : 4.5;

    // Ticket Type Breakdown
    const ticketTypesBreakdown = {};
    tickets.forEach(t => {
      const type = t.type || 'Other';
      ticketTypesBreakdown[type] = (ticketTypesBreakdown[type] || 0) + 1;
    });

    // Automated Admin Alerts
    const adminAlerts = [];
    agentMetrics.forEach(a => {
      if (a.stats.activeTickets > 10) {
        adminAlerts.push({ type: 'warning', message: `${a.name} is overwhelmed with ${a.stats.activeTickets} active tickets. Consider pausing distribution.` });
      }
      if (a.stats.csatScore && a.stats.csatScore <= 3.5) {
         adminAlerts.push({ type: 'danger', message: `${a.name} has a low CSAT score (${a.stats.csatScore}★). Quality review recommended.` });
      }
    });

    const overdueCount = tickets.filter(t => {
      const status = (t.status || 'Open').toLowerCase();
      if (status === 'closed' || status === 'resolved') return false;
      if (!t.createdAt) return false;
      const created = new Date(t.createdAt);
      return (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
    }).length;
    
    if (overdueCount > 0) {
      adminAlerts.push({ type: 'danger', message: `${overdueCount} tickets are overdue (open for > 48h).` });
    }

    tickets.filter(t => (t.reopenCount || 0) >= 3).forEach(t => {
      adminAlerts.push({ type: 'warning', message: `Ticket #${t.id.slice(-4)} has been reopened ${t.reopenCount} times.` });
    });

    // Team-wide summary  
    const teamSummary = {
      totalOpenTickets: tickets.filter(t => ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)).length,
      totalClosedResolved: tickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length,
      unassignedQueue: tickets.filter(t => !t.assignedTo && t.status === 'Open').length,
      ticketsToday: tickets.filter(t => {
        const created = new Date(t.createdAt);
        const today = new Date();
        return created.toDateString() === today.toDateString();
      }).length,
      overdueTickets: overdueCount,
      ticketTypesBreakdown,
      adminAlerts
    };

    res.json({
      leaderboard: agentMetrics,
      globalAvgRating,
      teamSummary,
      filteredTicketCount: tickets.length,
      totalTicketCount: tickets.length,
      tickets: tickets.map(t => ({
        id: t.id,
        type: t.type || 'Other',
        status: t.status,
        title: t.title,
        assignedTo: t.assignedTo,
        rating: t.rating,
        createdAt: t.createdAt,
        closedAt: t.closedAt
      })),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/support/export', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Enforce verified admin role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  try {
    const ticketDocs = await SupportTicket.find().lean();
    const tickets = ticketDocs.map(d => d.data);
    const fields = ['id', 'type', 'status', 'assignedTo', 'createdAt', 'resolvedAt', 'closedAt', 'rating'];
    let csv = fields.join(',') + '\n';
    
    tickets.forEach(t => {
       const row = fields.map(f => {
         let value = t[f] || '';
         if (typeof value === 'string') {
           value = value.replace(/"/g, '""');
           if (value.includes(',') || value.includes('\n') || value.includes('"')) {
             value = `"${value}"`;
           }
         }
         return value;
       });
       csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="support_tickets.csv"');
    res.send(csv);
  } catch(e) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/support/manage-user', apiKeyGuard, authGuard, async (req, res) => {
  const { targetUserId, status, level } = req.body;
  console.log(`[API] POST /support/manage-user: target=${targetUserId}, status=${status}, level=${level}`);
  
  // 🛡️ SECURITY HARDENING (v2.6.419): Enforce verified admin role from token
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const playerDoc = await Player.findOne({ id: targetUserId }).select('+data.password');
    if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: "User not found" });
    const user = playerDoc.data;

    // Apply updates
    if (status) {
      user.supportStatus = status;
      if (status === 'terminated') {
        user.terminatedAt = new Date().toISOString();
        if (io) {
          console.log(`[TERMINATE] Emitting auth_invalidated to user ${targetUserId}`);
          io.emit('auth_invalidated', { userId: targetUserId, reason: 'account_terminated' });
        }
      } else if (status === 'suspended') {
        // 🔒 SUSPEND: Freeze account without full termination
        user.suspendedAt = new Date().toISOString();
        console.log(`[SUSPEND] ${user.email} suspended by admin`);
        
        // 📧 Trigger Suspension Email (v2.6.419)
        await sendSuspensionEmail(user.email, user.name);
        
        // 🛑 Force Logout (v2.6.565): Instantly invalidate the user's session
        if (io) {
          console.log(`[SUSPEND] Emitting auth_invalidated to user ${targetUserId}`);
          io.emit('auth_invalidated', { userId: targetUserId, reason: 'account_suspended' });
        }
      } else if (status === 'active') {
        // Re-onboarding or unsuspend: clear metadata
        delete user.terminatedAt;
        delete user.suspendedAt;
        user.reOnboardedAt = new Date().toISOString();
        
        // 🔑 Generate fresh credentials for re-onboarded employee
        const newPassword = crypto.randomBytes(6).toString('hex'); // 12 chars
        user.password = bcrypt.hashSync(newPassword, 10);
        console.log(`[RE-ONBOARD] Generated new credentials for ${user.email}`);
        
        // 📧 Send Welcome Back email with new access key
        await sendReOnboardingEmail(user.email, user.name, newPassword);
      }
    }
    if (level) {
      const oldLevel = user.supportLevel || 'Trainee';
      user.supportLevel = level;
      user.designation = level; // 🔄 Sync designation with support level

      // 📧 Trigger Promotion/Demotion Email if level changed (v2.6.148)
      if (oldLevel !== level) {
         const LEVEL_RANKS = { 'Intern': 1, 'Junior': 2, 'Grade-3': 3, 'Grade-5': 4, 'Grade-7': 5, 'Senior': 6, 'Team Lead': 7, 'Manager': 8 };
         const oldRank = LEVEL_RANKS[oldLevel] || 0;
         const newRank = LEVEL_RANKS[level] || 0;

         if (newRank < oldRank) {
            // Demotion: Use the supportive, growth-focused template
            console.log(`[LEVEL] Demoting ${user.email} from ${oldLevel} to ${level}`);
            await sendDemotionEmail(user.email, user.name, level);
         } else {
            // Promotion: Use the celebratory template
            console.log(`[LEVEL] Promoting ${user.email} from ${oldLevel} to ${level}`);
            await sendPromotionEmail(user.email, user.name, level);
         }
      }
    }

    
    // Automated Unassign Trigger: If terminated or suspended, free up their tickets
    if (status === 'terminated' || status === 'suspended') {
       // 🛡️ SECURITY LOCKDOWN (v2.6.238): Immediately invalidate all active JWTs
       user.lastForceLogoutAt = Date.now();
       user.activeSessions = [];
       console.log(`[AUTH_LOCK] Invalidated all sessions for ${user.email} due to ${status}`);

       // Update all assigned tickets directly in DB
       const releaseTickets = syncMutex ? await syncMutex.acquire() : null;
       try {
         await SupportTicket.updateMany(
           { "data.assignedTo": targetUserId },
           { $set: { "data.assignedTo": null, "data.assignedAt": null, lastUpdated: new Date() } }
         );
       } finally {
         if (releaseTickets) releaseTickets();
       }

       if (status === 'terminated') {
         // 📧 Trigger Termination Email
         await sendTerminationEmail(user.email, user.name);
       }
    }

    const releaseUser = syncMutex ? await syncMutex.acquire() : null;
    let finalVersion = null;
    try {
      playerDoc.data = user;
      playerDoc.lastUpdated = new Date();
      playerDoc.markModified('data');
      await playerDoc.save();

      // 🛡️ [v2.6.617] Removed AppState dual-write — player data lives in Player collection
    } finally {
      if (releaseUser) releaseUser();
    }
    
    // 📡 Notify clients via targeted entity_updated events
    if (io) {
       io.emit('entity_updated', { entity: 'players', data: user, source: 'api', timestamp: Date.now() });
       io.emit('entity_updated', { entity: 'supportTickets', source: 'api', timestamp: Date.now() });
    }

    logServerEvent('SUPPORT_USER_MANAGED', { admin: req.headers['x-user-id'] || 'admin', targetUserId, status, level });
    res.json({ success: true, user: user });
  } catch (e) {
    console.error(`[API] POST /support/manage-user Error:`, e);
    res.status(500).json({ error: `Internal server error: ${e.message}` });
  }
});

router.post('/support/force-reset', apiKeyGuard, authGuard, async (req, res) => {
  console.log(`[API] POST /support/force-reset requested for ${req.body.targetUserId}`);
  
  // 🛡️ SECURITY HARDENING (v2.6.419): Enforce verified admin role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Target user ID required' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read/write from distinct collections
    const playerDoc = await Player.findOne({ id: targetUserId }).select('+data.password');
    if (!playerDoc || !playerDoc.data) return res.status(404).json({ error: 'User account not found' });
    
    const user = playerDoc.data;
    if (user.role !== 'support') {
      return res.status(400).json({ error: 'Can only force-reset support accounts via this portal.' });
    }

    // Generate Random Alphanumeric Password (10 chars)
    const newPassword = crypto.randomBytes(5).toString('hex'); // 10 chars
    console.log(`[FORCE-RESET] Generated new password for ${user.email}`);
    
    // Assign Plaintext to match local frontend authentication model
    user.password = bcrypt.hashSync(newPassword, 10);
    
    // Security Guard: Invalidate all existing sessions
    user.devices = [];

    const releaseReset = syncMutex ? await syncMutex.acquire() : null;
    let finalVersion = null;
    try {
      playerDoc.data = user;
      playerDoc.lastUpdated = new Date();
      playerDoc.markModified('data');
      await playerDoc.save();
      console.log(`[FORCE-RESET] Database updated for ${user.email}`);

      // 🛡️ [v2.6.617] Removed AppState dual-write — player data lives in Player collection
    } finally {
      if (releaseReset) releaseReset();
    }

    // 📡 Notify clients via targeted entity_updated event
    const io = req.app.get('io');
    if (io) {
      io.emit('entity_updated', { entity: 'players', data: user, source: 'api', timestamp: Date.now() });
    }

    // Log Event
    await logServerEvent('SUPPORT_FORCE_PASSWORD_RESET', { 
      adminId: req.headers['x-user-id'] || 'admin', 
      targetEmail: user.email 
    });

    // Send Notification Email
    console.log(`[FORCE-RESET] Sending reset email to ${user.email}...`);
    await sendAdminResetPasswordEmail(user.email, user.name, newPassword);
    console.log(`[FORCE-RESET] Email dispatch triggered and confirmed for ${user.email}`);
    res.json({ 
      success: true, 
      message: `Password reset successfully for ${user.name}. Credentials sent to ${user.email}.`
    });
  } catch (e) {
    console.error(`[FORCE-RESET] CRITICAL ERROR: ${e.message}`, e.stack);
    res.status(500).json({ error: 'Internal server error' });
  }
});


  return router;
}
