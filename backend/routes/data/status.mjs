import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { AppState, AuditLog, Player, Tournament, Match, MatchVideo, SupportTicket, Evaluation, Matchmaking, ChatbotThread, CoachInvite } from '../../models/index.mjs';
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
  addInAppNotification, sendCoachInviteEmail
}) {
  const router = express.Router();

router.get('/player/:id', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin' && req.userRole !== 'support') {
    return res.status(403).json({ error: 'Unauthorized: Administrative access required.' });
  }
  
  const { id } = req.params;
  const playerDoc = await Player.findOne({ id }).lean();
  
  if (!playerDoc) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  res.json({ success: true, player: playerDoc.data });
}));
router.get('/status', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
  try {
    // 🛡️ [EMERGENCY RESCUE] (v2.6.312)
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Restricted to admin role only
    if (req.query.rescue === 'true') {
      if (req.userRole !== 'admin') {
        return res.status(403).json({ error: 'System Administrator privileges required for state recovery.' });
      }
      const states = await AppState.find().sort({ lastUpdated: -1 }).limit(20);
      const previous = states.find((s, i) => i > 0 && s.data?.players?.length > 5);
      if (previous) {
        const recovered = new AppState({
          data: previous.data,
          version: (states[0].version || 1) + 1,
          lastUpdated: new Date(),
          lastSocketId: 'QUERY_RESCUE'
        });
        await recovered.save();
        console.log(`✅ [RECOVERY] Restored from ${previous.lastUpdated}. Users: ${previous.data.players.length}`);
        return res.json({ 
          success: true, 
          message: `RECOVERY EXECUTED: Restored from ${previous.lastUpdated}. Users: ${previous.data.players.length}`,
          restoredAt: new Date().toISOString()
        });
      } else {
        console.warn(`🛑 [RECOVERY] No stable state found in last ${states.length} snapshots.`);
      }
    }

    const state = await AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated version');
    res.json({ 
      lastUpdated: state?.lastUpdated || 0,
      version: state?.version || 1,
      latestAppVersion: APP_VERSION
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
router.get('/audit-logs', apiKeyGuard, sensitiveCacheGuard, asyncHandler(async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Use verified role instead of spoofable headers
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
  res.json({ success: true, logs });
}));
  return router;
}
