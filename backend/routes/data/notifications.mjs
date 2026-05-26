import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { AppState, AuditLog, Player, Tournament, Match, MatchVideo, SupportTicket, Evaluation, Matchmaking, ChatbotThread } from '../../models/index.mjs';
import { asyncHandler, getISTTimestamp } from '../../helpers/utils.mjs';
import { processTournamentWaitlist } from '../../promotion_logic.mjs';
import { apiKeyGuard, authGuard, sensitiveCacheGuard, validate, SaveDataSchema, DiagnosticsSchema, AutoFlushSchema, getSanitizedState } from '../../middleware/security.mjs';

export default function ({
  APP_VERSION,
  io,
  logServerEvent,
  logAudit,
  syncMutex,
  cloudinary,
  DIAGNOSTICS_DIR,
  upload,
  SupportMetricsService,
  sendPushNotification,
  addInAppNotification,
  activeSupportSessions
}) {
  const router = express.Router();

router.post('/register-push-token', apiKeyGuard, async (req, res) => {
  const { userId, pushToken } = req.body;
  if (!userId || !pushToken) return res.status(400).json({ error: 'Missing userId or pushToken' });

  try {
    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection instead of AppState
    const playerDoc = await Player.findOne({ id: userId });
    if (!playerDoc || !playerDoc.data) {
      console.warn(`🛑 [NOTIFY_DEBUG] Registration failed: User ${userId} not found`);
      return res.status(404).json({ error: 'User not found' });
    }

    // 🛡️ SECURITY: Verify that users only register tokens for themselves (v2.6.257)
    if (req.userRole !== 'admin' && req.userId !== userId) {
      return res.status(403).json({ error: 'Unauthorized: Cannot register push token for another user.' });
    }

    const player = playerDoc.data;
    // 🛡️ [NOTIFY_DEBUG] Sanitize tokens (remove nulls/empty)
    let tokens = (player.pushTokens || []).filter(t => !!t && typeof t === 'string');
    
    if (!tokens.includes(pushToken)) {
      tokens.push(pushToken);
      // 🛡️ ARCHITECTURE FIX (v2.6.527): Cap array to prevent 16MB MongoDB explosion
      if (tokens.length > 15) tokens = tokens.slice(-15);
      await Player.updateOne(
        { id: userId },
        { $set: { "data.pushTokens": tokens }, lastUpdated: new Date() }
      );
      console.log(`📱 [NOTIFY_DEBUG] Token Registered: ${pushToken.substring(0, 15)}... for user ${userId}. Total: ${tokens.length}`);
    } else {
      console.log(`📱 [NOTIFY_DEBUG] Token already exists for user ${userId}`);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/ping-coach', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  const { tournamentId, coachId } = req.body;
  if (!tournamentId || !coachId) return res.status(400).json({ error: 'Missing parameters' });
  
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const release = await syncMutex.acquire();
  try {
    const state = await AppState.findOne().sort({ version: -1 });
    if (!state) return res.status(404).json({ error: 'System state not found' });
    
    let tournaments = state.data?.tournaments || [];
    let players = state.data?.players || [];
    
    const tournament = tournaments.find(t => t.id === tournamentId);
    const coach = players.find(p => p.id === coachId);
    
    if (!tournament || !coach) return res.status(404).json({ error: 'Tournament or Coach not found' });
    
    if (!tournament.individualPings) tournament.individualPings = {};
    const currentCount = tournament.individualPings[coachId] || 0;
    const newCount = currentCount + 1;
    tournament.individualPings[coachId] = newCount;
    
    const title = "Tournament Invitation 🎾";
    const body = `You have been requested to coach for ${tournament.title}. Please review in the app.`;
    
    if (coach.pushTokens?.length > 0) {
      const tickets = await sendPushNotification(coach.pushTokens, title, body, { type: 'COACH_INDIVIDUAL_PING', tournamentId: tournament.id, pingCount: newCount });
      
      if (!tournament.individualPingTracking) tournament.individualPingTracking = {};
      const deliveredCount = tickets ? tickets.filter(t => t.status === 'ok').length : 0;
      tournament.individualPingTracking[coachId] = {
        deliveredCount,
        undeliveredCount: coach.pushTokens.length - deliveredCount,
        timestamp: new Date().toISOString()
      };
    } else {
      if (!tournament.individualPingTracking) tournament.individualPingTracking = {};
      tournament.individualPingTracking[coachId] = {
        deliveredCount: 0,
        undeliveredCount: 1, // Coach has no tokens (offline/pending)
        timestamp: new Date().toISOString()
      };
    }
    
    // Save state
    const now = new Date().toISOString();
    const updatedState = await AppState.findOneAndUpdate(
      { _id: state._id },
      { $inc: { version: 1 }, $set: { lastUpdated: now, "data.tournaments": tournaments } },
      { new: true }
    );
    
    // Also save in atomic collection
    await Tournament.updateOne(
      { id: tournament.id },
      { $set: { id: tournament.id, data: tournament, lastUpdated: now } },
      { upsert: true }
    );
    
    // Broadcast change
    if (io) {
      io.emit('data_updated', { lastUpdated: updatedState.lastUpdated, version: updatedState.version, keys: ['tournaments'] });
    }
    
    logServerEvent('COACH_INDIVIDUAL_PING_SENT', { coachId, tournamentId, newCount });
    res.json({ success: true, individualPings: tournament.individualPings, individualPingTracking: tournament.individualPingTracking });
  } catch (err) {
    console.error("❌ Ping Coach Error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    release();
  }
}));


  return router;
}
