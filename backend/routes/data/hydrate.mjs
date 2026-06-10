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

router.get('/data', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
  const syncStartTime = Date.now();
  console.time(`[SYNC_TRACE] ${req.ip} TOTAL`);
  try {
    // 🛡️ SCALABILITY ARCHITECTURE (v2.6.316): Prevent OOM crashes on large scale users usage
    // Pre-filter heavy collections at the database level instead of loading the entire DB into Node.js memory.
    // 🛡️ [SEC-1 FIX] STRICT ZERO-TRUST ENFORCER
    // Trust ONLY the verified JWT identity provided by security.mjs
    const reqUserId = req.user?.id || req.userId || 'guest';
    const normalizedReqId = String(reqUserId).toLowerCase();
    
    // Role must come directly from the verified JWT payload
    const resolvedRole = req.user?.role || req.userRole || null;
    const resolvedScopes = req.user?.scopes || [];
    
    // 🛡️ [SUPPORT FIX]: The web frontend sometimes drops cookies cross-origin. 
    // Admins were surviving via the 'admin' ID fallback. Added fallback for 'admin_support_' IDs.
    const isAdmin = resolvedRole === 'admin' || normalizedReqId === 'admin' || resolvedScopes.includes('*');
    const isSupport = resolvedRole === 'support' || resolvedScopes.includes('read:support') || normalizedReqId.startsWith('admin_support_');
    const canReadSupport = isAdmin || isSupport || resolvedScopes.includes('read:basic');

    console.log(`[SYNC_TRACE_ROLES] ${normalizedReqId} | role:${resolvedRole} | scopes:${JSON.stringify(resolvedScopes)} | isAdmin:${isAdmin} | isSupport:${isSupport} | canReadSupport:${canReadSupport}`);

    const matchQuery = isAdmin ? {} : { 
      $or: [
        { "data.player1Id": normalizedReqId },
        { "data.player2Id": normalizedReqId },
        { "data.challengerId": normalizedReqId },
        { "data.opponentId": normalizedReqId }
      ]
    };
    const ticketQuery = canReadSupport ? {} : { "data.userId": normalizedReqId };
    console.log(`[SYNC_TRACE_TICKETS] ticketQuery for ${normalizedReqId}:`, JSON.stringify(ticketQuery));
    const evalQuery = isAdmin ? {} : { "data.playerId": normalizedReqId };
    const chatQuery = isAdmin ? {} : { "userId": normalizedReqId };

    // 🛡️ [PERFORMANCE] (v2.6.319): Scope unbounded queries
    const matchmakingQuery = isAdmin ? {} : {
      $or: [
        { "data.creatorId": normalizedReqId },
        { "data.opponentId": normalizedReqId },
        { "data.status": { $nin: ["completed", "cancelled", "expired"] } }
      ]
    };

    // 📡 [DELTA SYNC] (v2.6.431): Incremental sync support
    // If ?since=ISO_TIMESTAMP is provided, only return documents modified after that time.
    // This dramatically reduces payload size for background refreshes & polling.
    // Initial hydration and selfHealConflict calls omit this param → full pull is preserved.
    const sinceParam = req.query.since;
    let sinceFilter = {};
    let isDelta = false;
    if (sinceParam) {
      const sinceDate = new Date(sinceParam);
      if (!isNaN(sinceDate.getTime())) {
        sinceFilter = { lastUpdated: { $gte: sinceDate } };
        isDelta = true;
        console.log(`[DELTA_SYNC] Incremental sync requested since: ${sinceDate.toISOString()}`);
      }
    }

    console.time(`[SYNC_TRACE] ${req.ip} QUERIES`);
    const [
      stateMetadata,
      requesterDoc,
      publicPlayersDocs,
      tournamentsDocs,
      matchesDocs,
      videosDocs,
      ticketsDocs,
      evalsDocs,
      matchmakingDocs,
      chatbotDocs
    ] = await Promise.all([
      // 🛡️ [PHASE 2 DECOMPOSITION] (v2.6.620): AppState is now READ-ONLY backup.
      // Only fetch version/lastUpdated metadata — NOT the data blob.
      AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated version').lean(),
      Player.findOne({ id: normalizedReqId }).lean(),
      isAdmin ? Player.find({ id: { $ne: normalizedReqId }, ...sinceFilter }).lean() : Player.find(
        { id: { $ne: normalizedReqId }, ...sinceFilter }, 
        { "data.id": 1, "data.name": 1, "data.username": 1, "data.avatar": 1, "data.role": 1, "data.skillLevel": 1, "data.rating": 1, "data.trueSkillRating": 1, "data.supportStatus": 1, "data.supportLevel": 1, "data.terminatedAt": 1, "data.reOnboardedAt": 1, "data.isLive": 1 }
      ).lean(),
      isAdmin ? Tournament.find(sinceFilter).lean() : Tournament.find(sinceFilter).sort({ lastUpdated: -1 }).limit(100).lean(),
      Match.find({ ...matchQuery, ...sinceFilter }).lean(),
      isAdmin ? MatchVideo.find(sinceFilter).lean() : MatchVideo.find(sinceFilter).sort({ lastUpdated: -1 }).limit(50).lean(),
      SupportTicket.find({ ...ticketQuery, ...sinceFilter }).lean(),
      Evaluation.find({ ...evalQuery, ...sinceFilter }).lean(),
      Matchmaking.find({ ...matchmakingQuery, ...sinceFilter }).lean(),
      ChatbotThread.find({ ...chatQuery, ...sinceFilter }).lean()
    ]);
    console.timeEnd(`[SYNC_TRACE] ${req.ip} QUERIES`);

    // Stitch from Distinct Collections
    const chatbotMessages = {};
    if (chatbotDocs && Array.isArray(chatbotDocs)) {
      chatbotDocs.forEach(doc => { 
        if (doc && doc.userId) {
          if (isAdmin || String(doc.userId).toLowerCase() === normalizedReqId) {
            chatbotMessages[doc.userId] = doc.data || [];
          }
        }
      });
    }

    // 🛡️ [PHASE 2 DECOMPOSITION] (v2.6.620): Direct read from distinct collections.
    // No more mergeEntities() bridge or AppState.data spread.
    const extractData = (docs = []) => {
      return docs.filter(Boolean).map(doc => {
        if (doc && doc.data && (doc.data.id || doc.id)) {
          const docId = String(doc.data.id || doc.id);
          return { ...doc.data, id: docId };
        }
        return null;
      }).filter(Boolean);
    };

    const composedData = {
      players: extractData([requesterDoc, ...(publicPlayersDocs || [])]),
      tournaments: extractData(tournamentsDocs),
      matches: extractData(matchesDocs),
      matchVideos: extractData(videosDocs),
      supportTickets: extractData(ticketsDocs),
      evaluations: extractData(evalsDocs),
      matchmaking: extractData(matchmakingDocs),
      chatbotMessages
    };

    // 🛡️ [PRESENCE INJECTOR] (v2.6.383)
    if (composedData.players && Array.isArray(composedData.players)) {
      composedData.players = composedData.players.map(p => {
        if (!p) return p;
        const pClone = { ...p };
        const normalizedId = String(pClone.id || pClone.userId || '').toLowerCase();
        
        const isLive = !!pClone.isLive;
        pClone.isLive = isLive;
        pClone.status = isLive ? 'active' : 'offline';
        
        const dbSupportStatus = (pClone.supportStatus || '').toLowerCase();
        const isAdminControlledStatus = ['terminated', 'suspended', 'inactive', 'left'].includes(dbSupportStatus);
        if (!isAdminControlledStatus) {
          pClone.supportStatus = isLive ? 'active' : 'offline';
        }
        
        if (pClone.role === 'admin' && normalizedId !== 'admin') {
          pClone.role = 'user';
        }
        return pClone;
      });

      if (req.query.syncContext === 'full_hydrate') {
        const sample = composedData.players.slice(0, 10).map(p => ({ id: p.id, isLive: p.isLive, status: p.status }));
        console.log(`📡 [SYNC_PAYLOAD_SAMPLE] Requester: ${normalizedReqId} | Samples:`, JSON.stringify(sample));
      }
    }

    delete composedData.currentUser;

    if (isSupport) {
      console.log(`[SYNC_DEBUG] Support Data Projection: ${composedData.players?.length || 0} players, ${composedData.matches?.length || 0} matches processed.`);
    }

    console.timeEnd(`[SYNC_TRACE] ${req.ip} TOTAL`);
    const duration = Date.now() - syncStartTime;
    if (duration > 5000) {
      console.warn(`⚠️ [PERFORMANCE_ALERT] /api/data slow for ${normalizedReqId}: ${duration}ms`);
      logAudit(req, 'PERFORMANCE_ALERT_SLOW_SYNC', [], { duration, userId: normalizedReqId });
    } else {
      console.log(`[SYNC_DEBUG] /api/data sync complete for ${normalizedReqId} in ${duration}ms`);
    }

    res.json({ ...composedData, lastUpdated: stateMetadata?.lastUpdated || new Date(), version: stateMetadata?.version || 1, isDelta, serverTimestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Data Fetch Error:', error.stack);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error during data synchronization.' : error.message });
  }
});
  return router;
}
