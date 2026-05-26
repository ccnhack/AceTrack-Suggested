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
      state,
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
      AppState.findOne().sort({ lastUpdated: -1 }).lean(),
      // 🛡️ SCALABILITY FIX (v2.6.316): Fetch full profile only for the requester
      Player.findOne({ id: normalizedReqId }).lean(),
      // 🛡️ SCALABILITY FIX (v2.6.316): Fetch all other players with a thin discovery projection (PII-free)
      // 🛡️ [PRODUCTION HARDENING] (v2.6.325): Support staff now use thin projection by default to prevent OOM
      // PII is only returned for the 'requesterDoc' or specifically requested tickets.
      isAdmin ? Player.find({ id: { $ne: normalizedReqId }, ...sinceFilter }).lean() : Player.find(
        { id: { $ne: normalizedReqId }, ...sinceFilter }, 
        { "data.id": 1, "data.name": 1, "data.username": 1, "data.avatar": 1, "data.role": 1, "data.skillLevel": 1, "data.rating": 1, "data.trueSkillRating": 1, "data.supportStatus": 1, "data.supportLevel": 1, "data.terminatedAt": 1, "data.reOnboardedAt": 1 }
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

    const baseData = (state && state.data) ? state.data : {};
    
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

    // 🛡️ [PHASE 1 TRANSITION GUARD] (v2.6.327): Union Merge for all entities
    // This prevents data loss if some documents are still in the legacy AppState blob.
    const mergeEntities = (legacy = [], distinctDocs = []) => {
      const map = new Map();
      legacy.forEach(item => { if (item && item.id) map.set(String(item.id), item); });
      distinctDocs.forEach(doc => { 
        if (doc && doc.data && (doc.data.id || doc.id)) {
          const docId = String(doc.data.id || doc.id);
          // 🛡️ [VAPT-F22] (v2.6.556): Ensure 'id' is explicitly injected into the data payload
          // if it only exists at the document root, preventing frontend silent dropping
          map.set(docId, { ...doc.data, id: docId });
        }
      });
      return Array.from(map.values());
    };

    const composedData = {
      ...baseData,
      players: mergeEntities(baseData.players, [requesterDoc, ...(publicPlayersDocs || [])].filter(Boolean)),
      tournaments: mergeEntities(baseData.tournaments, tournamentsDocs),
      matches: mergeEntities(baseData.matches, matchesDocs),
      matchVideos: mergeEntities(baseData.matchVideos, videosDocs),
      supportTickets: mergeEntities(baseData.supportTickets, ticketsDocs),
      evaluations: mergeEntities(baseData.evaluations, evalsDocs),
      matchmaking: mergeEntities(baseData.matchmaking, matchmakingDocs),
      chatbotMessages
    };

    // 🛡️ [PRESENCE INJECTOR] (v2.6.383)
    // Cross-reference DB players with live WebSocket sessions
    if (composedData.players && Array.isArray(composedData.players)) {
      const activeUserIds = new Set();
      if (activeSupportSessions) {
        for (const session of activeSupportSessions.values()) {
           if (session.userId) activeUserIds.add(String(session.userId).toLowerCase());
        }
      }

      composedData.players = composedData.players.map(p => {
        if (!p) return p;
        const pClone = { ...p }; // 🛡️ [ISOLATION FIX] (v2.6.388)
        const normalizedId = String(pClone.id || pClone.userId || '').toLowerCase();
        const isLive = activeUserIds.has(normalizedId);
        
        // Inject Live status into ALL potential fields the UI might use
        pClone.isLive = isLive;
        pClone.status = isLive ? 'active' : 'offline';
        
        // 🛡️ [LIFECYCLE PRESERVATION] (v2.6.424): Do NOT overwrite administrative statuses
        // Terminated, suspended, and inactive are set by admins via /manage-user.
        // Only apply presence logic to employees whose DB status is 'active' or unset.
        const dbSupportStatus = (pClone.supportStatus || '').toLowerCase();
        const isAdminControlledStatus = ['terminated', 'suspended', 'inactive', 'left'].includes(dbSupportStatus);
        if (!isAdminControlledStatus) {
          pClone.supportStatus = isLive ? 'active' : 'offline';
        }
        
        // 🛡️ [SECURITY]: Role sanitation for non-admins
        if (pClone.role === 'admin' && normalizedId !== 'admin') {
          pClone.role = 'user';
        }
        return pClone;
      });

      // 📡 [PAYLOAD SNIFFER] (v2.6.388)
      if (req.query.syncContext === 'full_hydrate') {
        const sample = composedData.players.slice(0, 10).map(p => ({ id: p.id, isLive: p.isLive, status: p.status }));
        console.log(`📡 [SYNC_PAYLOAD_SAMPLE] Requester: ${normalizedReqId} | Samples:`, JSON.stringify(sample));
      }

      // 🛡️ [SYNC_DIAGNOSTIC] (v2.6.383)
      if (req.originalUrl.includes('data')) {
          // Removed DATA_SYNC_PRESENCE audit log to reduce DB write noise
      }
    }

    // 🛡️ SECURITY HARDENING: Explicitly exclude 'currentUser' to prevent session shadowing
    delete composedData.currentUser;

    // 🛡️ [PERFORMANCE INSTRUMENTATION] (v2.6.325)
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

    res.json({ ...composedData, lastUpdated: state?.lastUpdated || new Date(), version: state?.version || 1, isDelta, serverTimestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Data Fetch Error:', error.stack);
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error during data synchronization.' : error.message });
  }
});

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

router.post('/save', apiKeyGuard, sensitiveCacheGuard, validate(SaveDataSchema), async (req, res) => {
  const waitStart = Date.now();
  let release;
  try {
    release = await syncMutex.acquire();
  } catch (error) {
    if (error.message === 'MUTEX_QUEUE_FULL') {
      console.warn(`🛑 [SaveGuard] Sync Mutex Queue Saturated. Rejecting request from ${req.ip}`);
      return res.status(429).json({ success: false, error: 'Too many concurrent sync requests. Please try again later.' });
    }
    throw error;
  }
  const waitTime = Date.now() - waitStart;
  if (waitTime > 2000) console.warn(`⚠️ Save Mutex Wait: ${waitTime}ms from ${req.ip}`);

  try {
    // 🛡️ [GUEST SYNC GUARD] (v2.6.210)
    // Silently reject sync attempts from guests or device-only sessions to prevent Slack notification spam.
    const actorId = String(req.headers['x-user-id'] || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId.startsWith('device_') || actorId === 'null' || actorId === 'undefined') {
      console.log(`[SaveGuard] 🛡️ Suppressed sync attempt from guest session (${req.ip})`);
      return res.status(403).json({ success: false, error: 'Unauthorized: Guests cannot synchronize data.' });
    }

    // 🛡️ SECURITY HARDENING (v2.6.164): Removed 'currentUser' from syncableKeys.
    // User profile updates now happen exclusively via the 'players' collection to maintain isolation.
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs'];
    
    const now = Date.now();
    const clientVersion = req.body.version;

    // 🛡️ SCALABILITY FIX (v2.6.316): O(N) -> O(K) Scoped Hydration
    // Collect the exact IDs of the incoming documents to prevent loading the entire DB into memory.
    const reqIds = { players: new Set(), tournaments: new Set(), matches: new Set(), matchVideos: new Set(), supportTickets: new Set(), evaluations: new Set(), matchmaking: new Set(), chatbotMessages: new Set() };
    
    for (const key of syncableKeys) {
      if (req.body[key]) {
        if (key === 'chatbotMessages' && typeof req.body[key] === 'object') {
          Object.keys(req.body[key]).forEach(userId => reqIds.chatbotMessages.add(String(userId).toLowerCase()));
        } else if (Array.isArray(req.body[key])) {
          req.body[key].forEach(item => {
            if (item && item.id) reqIds[key].add(String(item.id).toLowerCase());
            
            // Extract player dependencies for tournament waitlist logic
            if (key === 'tournaments') {
              (item.waitlistedPlayerIds || []).forEach(pid => reqIds.players.add(String(pid).toLowerCase()));
              (item.pendingPaymentPlayerIds || []).forEach(pid => reqIds.players.add(String(pid).toLowerCase()));
              (item.registeredPlayerIds || []).forEach(pid => reqIds.players.add(String(pid).toLowerCase()));
            }
          });
        }
      }
    }

    const buildQuery = (key) => {
      const isAtomicWipe = req.body.atomicKeys && req.body.atomicKeys.includes(key) && key !== 'players';
      if (isAtomicWipe) return {}; // We need all of them to overwrite
      if (reqIds[key].size === 0) return { id: null }; // Fetch nothing
      return { id: { $in: Array.from(reqIds[key]) } };
    };

    const chatbotQuery = reqIds.chatbotMessages.size > 0 
      ? { userId: { $in: Array.from(reqIds.chatbotMessages) } } 
      : { userId: null };

    const [
      state,
      playersDocs,
      tournamentsDocs,
      matchesDocs,
      videosDocs,
      ticketsDocs,
      evalsDocs,
      matchmakingDocs,
      chatbotDocs
    ] = await Promise.all([
      AppState.findOne().sort({ lastUpdated: -1 }).lean(),
      Player.find(buildQuery('players')).select('+data.password').lean(),
      Tournament.find(buildQuery('tournaments')).lean(),
      Match.find(buildQuery('matches')).lean(),
      MatchVideo.find(buildQuery('matchVideos')).lean(),
      SupportTicket.find(buildQuery('supportTickets')).lean(),
      Evaluation.find(buildQuery('evaluations')).lean(),
      Matchmaking.find(buildQuery('matchmaking')).lean(),
      ChatbotThread.find(chatbotQuery).lean()
    ]);

    const currentData = (state && state.data) ? state.data : {};
    const currentVersion = state?.version || 1;

    currentData.players = playersDocs.map(d => d.data);
    currentData.tournaments = tournamentsDocs.map(d => d.data);
    currentData.matches = matchesDocs.map(d => d.data);
    currentData.matchVideos = videosDocs.map(d => d.data);
    currentData.supportTickets = ticketsDocs.map(d => d.data);
    currentData.evaluations = evalsDocs.map(d => d.data);
    currentData.matchmaking = matchmakingDocs.map(d => d.data);
    currentData.chatbotMessages = {};
    chatbotDocs.forEach(doc => { currentData.chatbotMessages[doc.userId] = doc.data; });

    if (clientVersion === undefined) {
      console.warn(`🛑 Rejected: Request missing version from ${req.ip}`);
      return res.status(403).json({ error: 'Forbidden: Missing version number. Please update your app.' });
    }
    
    if (clientVersion < currentVersion) {
      console.warn(`🛑 OCC Conflict: Client v${clientVersion} vs Server v${currentVersion}`);
      return res.status(409).json({ 
        error: 'Conflict: Your local data is out of date. Please refresh and try again.',
        serverVersion: currentVersion,
        cloudLastUpdated: state?.lastUpdated
      });
    }

    const changedKeys = Object.keys(req.body).filter(k => syncableKeys.includes(k));
    await logAudit(req, 'DATA_SAVE', changedKeys, { atomicKeys: req.body.atomicKeys, version: clientVersion });

    const newMasterData = { ...currentData };
    
    // 🛡️ SECURITY HARDENING (v2.6.164): Purge any legacy currentUser leaked into global state
    delete newMasterData.currentUser;

    // 🛡️ DELTA TRACKER (v2.6.316): Only update documents that actually changed to achieve O(K) writes
    const modifiedEntities = {
      players: new Map(),
      tournaments: new Map(),
      matches: new Map(),
      matchVideos: new Map(),
      supportTickets: new Map(),
      evaluations: new Map(),
      matchmaking: new Map()
    };

    for (const key of syncableKeys) {
      if (req.body[key] !== undefined) {
        let incoming = req.body[key];
        const atomicKeys = req.body.atomicKeys || [];

        if (key === 'tournaments' && Array.isArray(incoming)) {
          // 🛡️ TOURNAMENT OTP REPAIR (v2.6.165): 
          // Do NOT hash Start/End OTPs inside the shared tournaments collection.
          // Hashing them here breaks client-side verification as the client receives a bcrypt hash instead of the 6-digit code.
          console.log(`[SYNC_DEBUG] Processing ${incoming.length} incoming tournaments (OTP Hashing Skipped for Stability)`);
          incoming = incoming.map(t => {
             const updatedT = { ...t };
             // Preserve raw OTPs if present, or rely on them being set by Admin only.
             return updatedT;
          });
        }

        if (['players', 'matchmaking', 'tournaments', 'matches', 'auditLogs', 'matchVideos', 'supportTickets', 'evaluations'].includes(key) && Array.isArray(incoming)) {

          // 🛡️ [PRODUCTION SAFETY] (v2.6.313): NEVER allow atomic overwrites for 'players'
          // Players contain auth credentials, wallet data, and identity. Atomic overwrites 
          // from clients with thinned/stale data are the #1 cause of data loss incidents.
          if (key === 'players' && atomicKeys.includes(key)) {
            console.warn(`🛑 [SAFETY] Blocked atomic overwrite of 'players' from ${req.ip}. Forced to merge mode.`);
            // Fall through to merge logic below
          }
          // 🛡️ [PAYLOAD SIZE GUARD] (v2.6.313): Reject players arrays that are suspiciously small
          // compared to current data. This prevents accidental wipes from partially-loaded clients.
          else if (key === 'players' && currentData.players && currentData.players.length > 5) {
            if (incoming.length < currentData.players.length * 0.5) {
              console.error(`🛑 [SIZE_GUARD] BLOCKED: Incoming players (${incoming.length}) is less than 50% of current (${currentData.players.length}). Skipping key.`);
              await logAudit(req, 'PLAYERS_SIZE_GUARD_BLOCKED', ['players'], { incomingCount: incoming.length, currentCount: currentData.players.length });
              continue;
            }
          }
          else if (atomicKeys.includes(key) && key !== 'players') {
            // 🛡️ [ATOMIC_GUARD] (Phase 1 Concurrency Fix): Block standard users from overwriting entire tournament collections
            if (key === 'tournaments' && req.userRole !== 'admin') {
              console.warn(`🛑 [ATOMIC_GUARD] Blocked unauthorized atomic overwrite of tournaments by ${req.userRole || 'user'} (userId: ${req.headers['x-user-id']})`);
              // Do NOT `continue`. Fall through to standard delta merge logic below.
            } else if (['supportTickets', 'matchVideos'].includes(key)) {
              console.warn(`🛑 [ATOMIC_GUARD] Blocked atomic overwrite of ${key}. This collection must be updated via REST APIs only.`);
              // Fall through to standard delta merge logic
            } else {
              console.log(`[SYNC_DEBUG] Atomic Overwrite for key: ${key} (${incoming.length} items)`);
              // 🛡️ [DELETE_AUDIT] (v2.6.511): Log which items were removed during atomic overwrite
              if (key === 'tournaments' && currentData.tournaments) {
                const incomingIds = new Set(incoming.map(t => String(t.id).toLowerCase()));
                const removedIds = currentData.tournaments
                  .filter(t => t && t.id && !incomingIds.has(String(t.id).toLowerCase()))
                  .map(t => ({ id: t.id, title: t.title }));
                if (removedIds.length > 0) {
                  console.log(`🗑️ [DELETE_AUDIT] Tournaments REMOVED via atomic overwrite: ${JSON.stringify(removedIds)}`);
                  logAudit(req, 'TOURNAMENT_DELETED', ['tournaments'], { 
                    deletedTournaments: removedIds, 
                    remainingCount: incoming.length,
                    userId: req.headers['x-user-id'] 
                  }).catch(() => {});
                }
              }
              newMasterData[key] = incoming;
              continue; 
            }
          }
          const entityMap = new Map();
          (currentData[key] || []).forEach(e => { if (e && e.id) entityMap.set(String(e.id).toLowerCase(), e); });
          
          incoming.forEach(p => {
            if (p && p.id) {
              const id = String(p.id).toLowerCase();
              const existing = entityMap.get(id);

              // 🛡️ [AUTO-ASSIGNMENT ENGINE] (v2.6.254)
              // If supportTickets are being saved and there's a new message from a staff member on an unassigned ticket, assign it.
              if (key === 'supportTickets' && p.messages?.length > (existing?.messages?.length || 0)) {
                const lastMsg = p.messages[p.messages.length - 1];
                const senderId = lastMsg.senderId;
                const isStaff = senderId !== p.userId && senderId !== 'system'; 
                const isUnassigned = !p.assignedTo || p.assignedTo === 'Unassigned' || p.assignedTo === '';
                
                if (isUnassigned && isStaff) {
                   p.assignedTo = senderId;
                   p.assignedAt = new Date().toISOString();
                   console.log(`[AUTO-ASSIGN] Ticket ${p.id} assigned to ${senderId} on cloud sync.`);
                }
              }
              
              // 🛡️ [SLOT_GUARD] (v2.6.107): Prevent over-registration if max reached
              if (key === 'tournaments' && existing) {
                const incomingReg = (p.registeredPlayerIds || []).filter(Boolean).length;
                const existingReg = (existing.registeredPlayerIds || []).filter(Boolean).length;
                
                // If this is a status change from Pending -> Registered
                const currentUserId = String(req.headers['x-user-id'] || '').toLowerCase();
                const isUserRegistering = (p.registeredPlayerIds || []).includes(currentUserId) && 
                                        !(existing.registeredPlayerIds || []).includes(currentUserId);

                if (isUserRegistering && existingReg >= (existing.maxPlayers || Infinity)) {
                  console.warn(`🛑 [SLOT_GUARD] Rejecting registration for ${currentUserId} in tournament ${p.id}. Slot already taken (Registered: ${existingReg}/${existing.maxPlayers}).`);
                  
                  // 🛡️ [DIAGNOSTICS] (v2.6.311)
                  logAudit(req, 'TOURNAMENT_REGISTRATION_REJECTED_FULL', ['tournaments'], { 
                    tournamentId: p.id, 
                    userId: currentUserId,
                    registeredCount: existingReg,
                    maxPlayers: existing.maxPlayers
                  }).catch(() => {});

                  // Revert to original state
                  p.registeredPlayerIds = [...(existing.registeredPlayerIds || [])];
                  p.pendingPaymentPlayerIds = [...(existing.pendingPaymentPlayerIds || [])];
                  if (!p.pendingPaymentPlayerIds.includes(currentUserId)) {
                    p.pendingPaymentPlayerIds.push(currentUserId);
                  }
                  p.waitlistedPlayerIds = [...(existing.waitlistedPlayerIds || [])];
                  p.pendingPaymentTimestamps = { ...(existing.pendingPaymentTimestamps || {}) };
                }
              }

              // 🛡️ ULTIMATE ADMIN GUARD (v2.6.170): Block ANY modification to the master 'admin' account
              if (id === 'admin' && key === 'players' && existing) {
                console.warn(`🛑 Blocked unauthorized attempt to modify System Admin profile: userId=${req.headers['x-user-id']}`);
                // Restore entire existing admin profile, ignore all incoming changes
                entityMap.set(id, existing);
                return;
              }

              // 🛡️ SUPPORT GUARD (v2.6.437): Block modification to support staff accounts
              if (existing && existing.role === 'support' && key === 'players') {
                const reqUserId = String(req.headers['x-user-id'] || req.user?.id || req.userId || '').toLowerCase();
                if (reqUserId !== id && req.userRole !== 'admin') {
                  console.warn(`🛑 Blocked unauthorized attempt to modify support profile ${id} by ${reqUserId}`);
                  entityMap.set(id, existing);
                  return;
                }
              }

              // 🛡️ ADMIN GUARD: Only allow the 'admin' account to have the 'admin' role (v2.6.51)
              if (p.role === 'admin' && id !== 'admin') {
                console.warn(`🛑 Unauthorized Admin Escalation Attempt: userId=${id}`);
                p.role = 'user';
              }

              if (key === 'players' && existing) {
                const mergedDevices = [...(existing.devices || [])];
                if (p.devices && Array.isArray(p.devices)) {
                  p.devices.forEach(d => {
                    if (!d || !d.id) return;
                    const dIndex = mergedDevices.findIndex(ed => ed.id === d.id);
                    if (dIndex >= 0) mergedDevices[dIndex] = { ...mergedDevices[dIndex], ...d };
                    else mergedDevices.push(d);
                  });
                }
                // 🛡️ PASSWORD GUARD (v2.6.145): Preserve server-side password for support users
                const preservedPassword = (existing.role === 'support') ? existing.password : (p.password || existing.password);
                // 🛡️ [PRESENCE_PURGE] (v2.6.424): Force transient status fields to 'offline' during DB persistence.
                // But PRESERVE admin-controlled lifecycle statuses (terminated, suspended, inactive).
                const adminControlledStatuses = ['terminated', 'suspended', 'inactive', 'left'];
                const existingDbStatus = (existing.supportStatus || '').toLowerCase();
                const preservedSupportStatus = adminControlledStatuses.includes(existingDbStatus) ? existing.supportStatus : 'offline';
                
                const definedFields = {};
                for (const [fieldKey, fieldVal] of Object.entries(p)) {
                  const protectedFields = ['isLive', 'status', 'supportStatus', 'devices', 'password'];
                  if (fieldVal !== undefined && !protectedFields.includes(fieldKey)) {
                    definedFields[fieldKey] = fieldVal;
                  }
                }
                const merged = { ...existing, ...definedFields, devices: mergedDevices, password: preservedPassword, supportStatus: preservedSupportStatus, status: 'offline', isLive: false };
                entityMap.set(id, merged);
                modifiedEntities[key].set(id, merged);
              } else {
                if (key === 'matchmaking') {
                  const statusChanged = existing && p.status && p.status !== existing.status;
                  const slotChanged = existing && (p.proposedDate !== existing.proposedDate || p.proposedTime !== existing.proposedTime);
                  
                  if (!existing || statusChanged || slotChanged) {
                    p.isNew = true;
                    console.log(`[SYNC_DEBUG] Marking matchmaking ${p.id} as isNew=true (Status/Slot update)`);
                  }
                  
                  const merged = existing ? { ...existing, ...p } : p;
                  // 🛡️ SYNC PROTECTION (v2.6.91): Preserve 'isNew: true' if client update doesn't explicitly clear it
                  if (existing && existing.isNew && p.isNew === undefined) {
                    merged.isNew = true;
                  }
                  entityMap.set(id, merged);
                  if (modifiedEntities[key]) modifiedEntities[key].set(id, merged);
                } else if (key === 'supportTickets' && existing) {
                  // 🛡️ [STATUS_SYNC] (v2.6.241)
                  // 🛡️ [M-7 FIX] (v2.6.315): ID-based message matching instead of index-based
                  // This prevents status downgrades when messages arrive in different order.
                  const mergedMessages = [...(p.messages || [])];
                  if (existing.messages && Array.isArray(existing.messages)) {
                    const STATUS_WEIGHT = { 'read': 3, 'seen': 2, 'delivered': 1, 'sent': 0, 'pending': -1 };
                    const existingMsgMap = new Map(existing.messages.map(em => [em.id, em]));
                    mergedMessages.forEach((mm, idx) => {
                      const existingMsg = existingMsgMap.get(mm.id);
                      if (existingMsg) {
                        const incomingStatus = mm.status || 'sent';
                        const existingStatus = existingMsg.status || 'sent';
                        if ((STATUS_WEIGHT[existingStatus] || 0) > (STATUS_WEIGHT[incomingStatus] || 0)) {
                          mergedMessages[idx] = { ...mm, status: existingStatus };
                        }
                      }
                    });
                  }
                  // 🛡️ ARCHITECTURE FIX (v2.6.527): Cap messages to prevent 16MB MongoDB explosion
                  let cappedMessages = mergedMessages;
                  if (cappedMessages.length > 500) {
                    cappedMessages = cappedMessages.slice(-500);
                  }
                  const merged = { ...existing, ...p, messages: cappedMessages };
                  entityMap.set(id, merged);
                  if (modifiedEntities[key]) modifiedEntities[key].set(id, merged);
                } else {
                  const merged = existing ? { ...existing, ...p } : p;
                  entityMap.set(id, merged);
                  if (modifiedEntities[key]) modifiedEntities[key].set(id, merged);
                }
              }
            }
          });
          newMasterData[key] = Array.from(entityMap.values());
        } else if (key === 'currentUser') {
          // 🛡️ [C-5 FIX] (v2.6.315): SKIP currentUser entirely.
          // currentUser is a per-session, per-device concept. Writing it into the shared 
          // global AppState.data causes cross-user data leakage. The client already excludes 
          // it from syncableKeys (SyncManager L489). This handler only fired on legacy clients.
          console.log(`[SYNC_DEBUG] Skipping 'currentUser' key — per-session data not stored in global state.`);
        } else if (['seenAdminActionIds', 'visitedAdminSubTabs'].includes(key) && Array.isArray(incoming)) {
          // 🛡️ UNION MERGE: Additive only to prevent acknowledgments from being lost (v2.6.50)
          const existing = Array.isArray(currentData[key]) ? currentData[key] : [];
          newMasterData[key] = [...new Set([...existing, ...incoming])];
        } else {
          newMasterData[key] = incoming;
        }
      }
    }
    
    // ═══════════════════════════════════════════════════════════════
    // 🏆 WAITLIST PROMOTION & PRIORITY LOGIC (v2.6.103)
    if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
      // Create a snapshot of player notification lengths before processing
      const playerNotifMap = new Map();
      (newMasterData.players || []).forEach(p => {
        if (p && p.id) {
          playerNotifMap.set(String(p.id), (p.notifications || []).length);
        }
      });

      newMasterData.tournaments = newMasterData.tournaments.map(t => {
        const originalWaitlistStr = JSON.stringify(t.waitlistedPlayerIds || []);
        const originalPendingStr = JSON.stringify(t.pendingPaymentPlayerIds || []);
        const originalRegStr = JSON.stringify(t.registeredPlayerIds || []);
        
        const processed = processTournamentWaitlist(t, newMasterData.players || []);
        
        // 🛡️ SCALABILITY FIX (v2.6.316): Register side-effects in the delta tracker
        const changed = 
          JSON.stringify(processed.waitlistedPlayerIds || []) !== originalWaitlistStr ||
          JSON.stringify(processed.pendingPaymentPlayerIds || []) !== originalPendingStr ||
          JSON.stringify(processed.registeredPlayerIds || []) !== originalRegStr;
          
        if (changed) {
          modifiedEntities.tournaments.set(processed.id, processed);
        }
        return processed;
      });

      // 🛡️ [SIDE-EFFECT REPAIR] (v2.6.316): Explicitly register mutated players
      // processTournamentWaitlist appends in-app notifications directly to the masterPlayers array in memory.
      // We must explicitly register these mutated players in the delta tracker so they are saved to the DB.
      (newMasterData.players || []).forEach(p => {
        if (p && p.id) {
          const originalLen = playerNotifMap.get(String(p.id)) || 0;
          const newLen = (p.notifications || []).length;
          if (newLen > originalLen) {
            console.log(`[SIDE-EFFECT] Waitlist promotion detected. Explicitly marking player ${p.id} for sync.`);
            modifiedEntities.players.set(String(p.id).toLowerCase(), p);
          }
        }
      });
    }

    // 🛡️ [SUPPORT BUSINESS LOGIC ENGINE] (v2.6.438)
    // Perform auto-assignment, termination cleanup, and response tracking BEFORE saving to database.
    if (changedKeys.includes('supportTickets')) {
       const existingTickets = currentData.supportTickets || [];
       (newMasterData.supportTickets || []).forEach(ticket => {
         const existing = existingTickets.find(et => et.id === ticket.id);
         const isNew = !existing;
         const isUnassigned = !ticket.assignedTo || ticket.assignedTo === 'Unassigned' || ticket.assignedTo === '';
         
         // 1. 🤖 [AUTO-ASSIGNMENT]
         if (isNew && isUnassigned && ticket.status === 'Open') {
           const bestAgent = SupportMetricsService.findBestAgent(newMasterData.players, newMasterData.supportTickets || []);
           if (bestAgent) {
             console.log(`🤖 [ASSIGN] Pre-save auto-assigning ticket ${ticket.id} to agent ${bestAgent.id}`);
             ticket.assignedTo = bestAgent.id;
             ticket.assignedAt = new Date().toISOString();
             ticket.assignmentSource = 'auto';
             modifiedEntities.supportTickets.set(ticket.id, ticket);

             // Increment agent's lifetime handles
             const agentIndex = newMasterData.players.findIndex(p => p.id === bestAgent.id);
             if (agentIndex !== -1) {
               const agent = newMasterData.players[agentIndex];
               if (!agent.metrics) agent.metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
               agent.metrics.totalHandled += 1;
               modifiedEntities.players.set(agent.id.toLowerCase(), agent);
             }

             logAudit(req, 'TICKET_AUTO_ASSIGNED', ['supportTickets', 'players'], { 
               ticketId: ticket.id, 
               agentId: bestAgent.id,
               agentName: `${bestAgent.firstName || ''} ${bestAgent.lastName || ''}`.trim()
             }).catch(() => {});
           }
         }

         // 2. 🛡️ [TERMINATION CLEANUP]
         if (ticket.assignedTo) {
           const agent = newMasterData.players.find(p => p.id === ticket.assignedTo);
           const status = (agent?.supportStatus || '').toLowerCase();
           if (agent && ['terminated', 'left', 'ex-employee'].includes(status)) {
             console.log(`🛡️ [CLEANUP] Pre-save unassigning ticket ${ticket.id} due to agent termination.`);
             ticket.assignedTo = null;
             ticket.assignedAt = null;
             modifiedEntities.supportTickets.set(ticket.id, ticket);
           }
         }

         // 3. 🛡️ [RESPONSE TRACKING]
         const existingMsgCount = existing?.messages?.length || 0;
         const newMessages = (ticket.messages || []).slice(existingMsgCount);
         for (const msg of newMessages) {
           if (String(msg.senderId) !== String(ticket.userId) && !ticket.firstResponseAt && msg.senderId !== 'system') {
             ticket.firstResponseAt = new Date().toISOString();
             modifiedEntities.supportTickets.set(ticket.id, ticket);
           }
         }
       });
    }

    const nextVersion = currentVersion + 1;

    // 🛡️ [16MB BOMB DEFUSAL] (v2.6.316): Strip distinct collections before saving monolithic AppState
    // 🛡️ [SCALABILITY FIX] (v2.6.321): AppState bottleneck resolved via Atomic $inc and selective data writes.
    const appStateDataToSave = { ...newMasterData };
    const distinctKeys = ['players', 'tournaments', 'matches', 'matchVideos', 'supportTickets', 'evaluations', 'matchmaking', 'chatbotMessages'];
    distinctKeys.forEach(k => delete appStateDataToSave[k]);

    // 🛡️ [C-6 FIX] (v2.6.315): Avoid empty {} filter which can cause duplicate singletons
    // 🛡️ [OCC FIX] (v2.6.435): Optimistic Concurrency Control for Multi-Instance Sync
    const updateFilter = state?._id ? { _id: state._id, version: currentVersion } : { _id: new mongoose.Types.ObjectId() };
    const upsertAllowed = !state?._id;
    
    const hasDataChanges = changedKeys.some(k => !distinctKeys.includes(k));
    const updateQuery = { 
      $inc: { version: 1 }, 
      $set: { lastUpdated: now } 
    };
    if (hasDataChanges) {
      updateQuery.$set.data = appStateDataToSave;
    }

    const updatedState = await AppState.findOneAndUpdate(
      updateFilter,
      updateQuery,
      { upsert: upsertAllowed, returnDocument: 'after' }
    );

    if (state?._id && !updatedState) {
      console.warn(`🛑 [OCC] Cross-Instance Conflict detected for ${req.ip}. Rejecting save to prevent data overwrite.`);
      return res.status(409).json({ 
        error: 'Conflict: Server state was modified by another request. Data not saved to prevent overwrite.',
        serverVersion: currentVersion + 1
      });
    }

    // 🏗️ PHASE 1 (DATABASE) MIGRATION: DUAL WRITE TO DISTINCT COLLECTIONS
    // This allows the frontend to continue using the monolithic payload format,
    // while we safely persist the data atomically into the new collections.
    const upsertEntities = async (Model, entities) => {
       if (!entities || entities.length === 0) return;
       const bulkOps = entities.map(entity => {
          const entityId = String(entity.id || entity._id || Math.random().toString(36).substring(7));
          return {
             updateOne: {
                filter: { id: entityId },
                update: { $set: { id: entityId, data: entity, lastUpdated: now } },
                upsert: true
             }
          };
       });
       if (bulkOps.length > 0) {
          await Model.bulkWrite(bulkOps);
       }
    };

    // If atomic overwrites happened, clear the collection first
    const handleAtomicWipe = async (Model, key) => {
      if (req.body.atomicKeys && req.body.atomicKeys.includes(key) && key !== 'players') {
        await Model.deleteMany({});
      }
    };

    const getEntitiesToUpsert = (key) => {
      // 🛡️ SCALABILITY FIX (v2.6.316): O(N) -> O(K) reduction
      // If atomic overwrite, save the full collection
      if (req.body.atomicKeys && req.body.atomicKeys.includes(key) && key !== 'players') {
        return newMasterData[key] || [];
      }
      // Otherwise, ONLY save the delta that was actually modified in this request
      return Array.from(modifiedEntities[key].values());
    };

    await Promise.all([
      handleAtomicWipe(Player, 'players').then(() => upsertEntities(Player, getEntitiesToUpsert('players'))),
      handleAtomicWipe(Tournament, 'tournaments').then(() => upsertEntities(Tournament, getEntitiesToUpsert('tournaments'))),
      handleAtomicWipe(Match, 'matches').then(() => upsertEntities(Match, getEntitiesToUpsert('matches'))),
      handleAtomicWipe(MatchVideo, 'matchVideos').then(() => upsertEntities(MatchVideo, getEntitiesToUpsert('matchVideos'))),
      handleAtomicWipe(SupportTicket, 'supportTickets').then(() => upsertEntities(SupportTicket, getEntitiesToUpsert('supportTickets'))),
      handleAtomicWipe(Evaluation, 'evaluations').then(() => upsertEntities(Evaluation, getEntitiesToUpsert('evaluations'))),
      handleAtomicWipe(Matchmaking, 'matchmaking').then(() => upsertEntities(Matchmaking, getEntitiesToUpsert('matchmaking'))),
    ]);
    
    // Handle ChatbotMessages (which is an object with userId keys)
    if (req.body.chatbotMessages && typeof req.body.chatbotMessages === 'object') {
       // Only process the incoming keys, not the entire database
       const incomingUserIds = Object.keys(req.body.chatbotMessages);
       const bulkOps = incomingUserIds.map(userId => {
         return {
           updateOne: {
             filter: { userId: String(userId) },
             update: { $set: { userId: String(userId), data: newMasterData.chatbotMessages[userId], lastUpdated: now } },
             upsert: true
           }
         };
       });
       if (bulkOps.length > 0) {
         await ChatbotThread.bulkWrite(bulkOps);
       }
    }

    const socketId = req.headers['x-socket-id'];
    const broadcastPayload = { 
      lastUpdated: updatedState.lastUpdated, 
      version: updatedState.version,
      keys: changedKeys,
      lastSocketId: socketId || 'system'
    };

    if (socketId) {
      logServerEvent('BROADCAST_EXCLUDING_SENDER', { socketId, version: broadcastPayload.version });
      io.except(socketId).emit('data_updated', broadcastPayload);
    } else {
      logServerEvent('BROADCAST_GLOBAL', { version: broadcastPayload.version });
      io.emit('data_updated', broadcastPayload);
    }
    
    logServerEvent('DATA_SAVE_SUCCESS', { lastUpdated: updatedState.lastUpdated, version: updatedState.version, keys: broadcastPayload.keys });
    res.json({ success: true, lastUpdated: updatedState.lastUpdated, version: updatedState.version });

    // ═══════════════════════════════════════════════════════════════
    // 🔔 NOTIFICATION HOOKS (v2.6.84)
    // ═══════════════════════════════════════════════════════════════
    try {
      // 1. Match Events (Challenges, Court Start, Score Reported)
      if (changedKeys.includes('matches')) {
        const incomingMatches = req.body.matches || [];
        const existingMatches = currentData.matches || [];

        for (const match of incomingMatches) {
          const existing = existingMatches.find(em => em.id === match.id);
          const isNew = !existing;

          // 1a. New Match Challenges
          if (isNew && (match.status === 'scheduled' || match.status === 'Pending')) {
            const opponentId = match.player2Id || match.opponentId;
            const challengerId = match.player1Id || match.challengerId;
            const opponent = newMasterData.players.find(p => p.id === opponentId);
            const challenger = newMasterData.players.find(p => p.id === challengerId);
            if (opponent) {
              const t = "New Match Challenge! 🎾";
              const b = `${challenger?.name || 'Someone'} challenged you to a match.`;
              addInAppNotification(opponent, t, b, { matchId: match.id, type: 'MATCH_CHALLENGE' });
              if (opponent.pushTokens?.length > 0) sendPushNotification(opponent.pushTokens, t, b, { matchId: match.id, type: 'MATCH_CHALLENGE' });
            }
          }

          // 1b. Match Starting (Court Assignment)
          if (existing && existing.status !== 'In Progress' && match.status === 'In Progress') {
            const p1 = newMasterData.players.find(p => p.id === match.player1Id);
            const p2 = newMasterData.players.find(p => p.id === match.player2Id);
            const courtText = match.courtNumber ? ` on Court ${match.courtNumber}` : '';
            const t = "Match Starting! 🎾";
            const b = `Your match is starting now${courtText}. Please proceed to the court!`;
            [p1, p2].forEach(p => {
              if (p) {
                addInAppNotification(p, t, b, { matchId: match.id, type: 'MATCH_START' });
                if (p.pushTokens?.length > 0) sendPushNotification(p.pushTokens, t, b, { matchId: match.id, type: 'MATCH_START' });
              }
            });
          }

          // 1c. Match Completed / Score Reported
          if (existing && existing.status !== 'Completed' && match.status === 'Completed') {
            const p1 = newMasterData.players.find(p => p.id === match.player1Id);
            const p2 = newMasterData.players.find(p => p.id === match.player2Id);
            const winner = newMasterData.players.find(p => p.id === match.winnerId);
            const scoreText = match.resultText || 'Score submitted';
            [p1, p2].forEach(p => {
              if (p) {
                const isWinner = p.id === match.winnerId;
                const t = isWinner ? "Match Won! 🏆" : "Match Complete 🎾";
                const b = isWinner ? `Congratulations! You won (${scoreText}).` : `Match result: ${scoreText}. ${winner?.name || 'Opponent'} wins.`;
                addInAppNotification(p, t, b, { matchId: match.id, type: 'MATCH_COMPLETED' });
                if (p.pushTokens?.length > 0) sendPushNotification(p.pushTokens, t, b, { matchId: match.id, type: 'MATCH_COMPLETED' });
              }
            });

            // 1d. Alert Organizer & Coach
            if (match.tournamentId) {
               const tournament = newMasterData.tournaments?.find(t => t.id === match.tournamentId);
               if (tournament) {
                 const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
                 const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
                 const tOrganizers = "Match Completed 📋";
                 const bOrganizers = `${p1?.name || 'P1'} vs ${p2?.name || 'P2'} has concluded (${scoreText}).`;
                 [organizer, coach].forEach(staff => {
                   if (staff) {
                     addInAppNotification(staff, tOrganizers, bOrganizers, { matchId: match.id, type: 'ORG_MATCH_COMPLETED' });
                     if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, tOrganizers, bOrganizers, { matchId: match.id, type: 'ORG_MATCH_COMPLETED' });
                   }
                 });
               }
            }
          }
        }
      }

      // 2. Video Approvals & Uploads
      if (changedKeys.includes('matchVideos')) {
        const incomingVideos = req.body.matchVideos || [];
        const existingVideos = currentData.matchVideos || [];
        
        for (const video of incomingVideos) {
          const existing = existingVideos.find(ev => ev.id === video.id);
          const isNew = !existing;
          const justApproved = video.adminStatus === 'Active' && (!existing || existing.adminStatus !== 'Active');
          
          if (isNew && video.adminStatus === 'Pending') {
            // Alert Admins of new video upload requiring approval
            const admins = newMasterData.players.filter(p => p.role === 'admin' || p.data?.role === 'admin');
            admins.forEach(admin => {
              const t = "New Video Upload 🎥";
              const b = "A new match recording is pending admin review.";
              addInAppNotification(admin, t, b, { videoId: video.id, type: 'ADMIN_VIDEO_REVIEW' });
              if (admin.pushTokens?.length > 0) sendPushNotification(admin.pushTokens, t, b, { videoId: video.id, type: 'ADMIN_VIDEO_REVIEW' });
            });
          }

          if (justApproved && video.playerIds) {
            video.playerIds.forEach(pId => {
              const player = newMasterData.players.find(p => p.id === pId);
              if (player) {
                const title = "New Match Recording! 🎥";
                const body = "A recording of your recent match is now available to view.";
                
                addInAppNotification(player, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
                
                if (player.pushTokens?.length > 0) {
                  sendPushNotification(player.pushTokens, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
                }
              }
            });
          }
        }
      }

      // 3. Support Ticket Replies & Auto-Assignment
      if (changedKeys.includes('supportTickets')) {
        const incomingTickets = req.body.supportTickets || [];
        const existingTickets = currentData.supportTickets || [];
        
        // 🛡️ [DATA VALIDATION] (v2.6.171)
        // Guard against "Ghost Tickets" by rejecting malformed payloads
        // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Response already sent above — log only, don't send another response
        const invalidTickets = incomingTickets.filter(t => !t.title || t.title === 'undefined' || !t.description || t.description === 'undefined');
        if (invalidTickets.length > 0) {
          console.warn(`🛡️ [GUARD] Detected ${invalidTickets.length} malformed tickets in post-save notification hook. Skipping ticket notifications.`);
        }

        for (let i = 0; i < incomingTickets.length; i++) {
          const ticket = incomingTickets[i];
          const existing = existingTickets.find(et => et.id === ticket.id);
          const isNew = !existing;
          const newMessages = (ticket.messages || []).slice(existing ? existing.messages.length : 0);
          
          if (isNew) {
             logAudit(req, 'TICKET_CREATED', ['supportTickets'], { ticketId: ticket.id, type: ticket.type, title: ticket.title });
             // Alert Platform Admins and Support staff
             const staffList = newMasterData.players.filter(p => p.role === 'admin' || p.role === 'support' || p.data?.role === 'admin' || p.data?.role === 'support');
             staffList.forEach(staff => {
               const t = "New Support Ticket 🎫";
               const b = `A user opened a new support ticket: "${ticket.title}"`;
               addInAppNotification(staff, t, b, { ticketId: ticket.id, type: 'ADMIN_NEW_TICKET' });
               if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, t, b, { ticketId: ticket.id, type: 'ADMIN_NEW_TICKET' });
             });
          }
          for (const msg of newMessages) {
            // 🛡️ [NOTIFY] v2.6.96: Harden identity comparison 
            if (String(msg.senderId) !== String(ticket.userId)) {
              const user = newMasterData.players.find(p => String(p.id) === String(ticket.userId));
              if (user && user.pushTokens?.length > 0) {
                sendPushNotification(
                  user.pushTokens, 
                  "Support Ticket Reply ✉️", 
                  `New reply regarding your ticket: "${ticket.title}"`,
                  { ticketId: ticket.id, type: 'SUPPORT_REPLY' }
                );
              }
              break; // Only notify once per sync batch
            }
          }
        }
      }

      // 4. Tournament Events (v2.6.500 — Comprehensive)
      if (changedKeys.includes('tournaments')) {
        const incomingTournaments = req.body.tournaments || [];
        const existingTournaments = currentData.tournaments || [];

        for (const tournament of incomingTournaments) {
          const existing = existingTournaments.find(et => et.id === tournament.id);
          const allPlayerIds = [...new Set([...(tournament.registeredPlayerIds || []), ...(tournament.pendingPaymentPlayerIds || [])])].filter(Boolean);

          const notifyAllPlayers = (title, body, dataPayload) => {
            for (const pid of allPlayerIds) {
              const player = newMasterData.players.find(p => String(p.id) === String(pid));
              if (player) {
                addInAppNotification(player, title, body, dataPayload);
                if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, title, body, dataPayload);
              }
            }
          };

          // 4a. New Registrations (pending → registered payment confirmed)
          const incomingRegIds = tournament.registeredPlayerIds || [];
          const existingRegIds = existing ? (existing.registeredPlayerIds || []) : [];
          const newRegIds = incomingRegIds.filter(id => !existingRegIds.includes(id));
          for (const playerId of newRegIds) {
            const player = newMasterData.players.find(p => p.id === playerId);
            if (player) {
              const t = "Registration Confirmed! 🏆";
              const b = `You're officially registered for ${tournament.title}. Good luck!`;
              addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              
              // Alert Organizer & Coach
              const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
              const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
              const oT = "New Player Registered 🎫";
              const oB = `${player.name} has registered for ${tournament.title}.`;
              [organizer, coach].forEach(staff => {
                if (staff) {
                  addInAppNotification(staff, oT, oB, { tournamentId: tournament.id, type: 'ORG_NEW_REGISTRATION' });
                  if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'ORG_NEW_REGISTRATION' });
                }
              });
            }
          }

          // 4b. Waitlist / Pending Additions
          const incomingWaitlistIds = tournament.waitlistedPlayerIds || [];
          const existingWaitlistIds = existing ? (existing.waitlistedPlayerIds || []) : [];
          const newWaitlistIds = incomingWaitlistIds.filter(id => !existingWaitlistIds.includes(id));
          if (newWaitlistIds.length > 0) {
            const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
            const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
            const oT = "New Waitlist Entry ⏳";
            const oB = `${newWaitlistIds.length} player(s) joined the waitlist for ${tournament.title}.`;
            [organizer, coach].forEach(staff => {
              if (staff) {
                addInAppNotification(staff, oT, oB, { tournamentId: tournament.id, type: 'ORG_WAITLIST_ENTRY' });
                if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'ORG_WAITLIST_ENTRY' });
              }
            });
          }

          // 4c. Check-In Confirmation
          const incomingStatuses = tournament.playerStatuses || {};
          const existingStatuses = existing ? (existing.playerStatuses || {}) : {};
          for (const [playerId, status] of Object.entries(incomingStatuses)) {
            if (status === 'Checked-In' && existingStatuses[playerId] !== 'Checked-In') {
              const player = newMasterData.players.find(p => String(p.id) === String(playerId));
              if (player) {
                const t = "Check-In Confirmed! ✅";
                const b = `You have successfully checked in for ${tournament.title}.`;
                addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_CHECKIN' });
                if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_CHECKIN' });
                
                // Alert Coach
                const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
                if (coach) {
                  const oT = "Player Checked-In ✅";
                  const oB = `${player.name} has checked in for ${tournament.title}.`;
                  addInAppNotification(coach, oT, oB, { tournamentId: tournament.id, type: 'COACH_PLAYER_CHECKIN' });
                  if (coach.pushTokens?.length > 0) sendPushNotification(coach.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'COACH_PLAYER_CHECKIN' });
                }
              }
            }

            // 4d. Player Denied
            if (status === 'Denied' && existingStatuses[playerId] !== 'Denied') {
              const player = newMasterData.players.find(p => String(p.id) === String(playerId));
              if (player) {
                const t = "Registration Denied ❌";
                const b = `Your registration for ${tournament.title} was not approved by the organizer.`;
                addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_DENIED' });
                if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_DENIED' });
              }
            }
          }

          // 4e. Tournament Started
          if (existing && !existing.tournamentStarted && tournament.tournamentStarted) {
            notifyAllPlayers(
              "Tournament Started! 🏁",
              `${tournament.title} has officially started. Check the bracket for your match assignments!`,
              { tournamentId: tournament.id, type: 'TOURNAMENT_STARTED' }
            );
          }

          // 4e. Tournament Concluded
          if (existing && !existing.tournamentConcluded && tournament.tournamentConcluded) {
            notifyAllPlayers(
              "Tournament Concluded! 🏆",
              `${tournament.title} has ended. Check the leaderboard for final results.`,
              { tournamentId: tournament.id, type: 'TOURNAMENT_CONCLUDED' }
            );
          }

          // 4f. Tournament Rescheduled (date or time changed)
          if (existing && (existing.date !== tournament.date || existing.time !== tournament.time)) {
            const changeText = existing.date !== tournament.date ? `New date: ${tournament.date}` : `New time: ${tournament.time}`;
            notifyAllPlayers(
              "Tournament Rescheduled 📅",
              `${tournament.title} has been rescheduled. ${changeText}.`,
              { tournamentId: tournament.id, type: 'TOURNAMENT_RESCHEDULED' }
            );
          }

          // 4g. Coach Assigned
          if (existing && !existing.assignedCoachId && tournament.assignedCoachId) {
            const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
            if (coach) {
              const t = "Tournament Assignment 🎓";
              const b = `You have been assigned as coach for ${tournament.title}.`;
              addInAppNotification(coach, t, b, { tournamentId: tournament.id, type: 'COACH_ASSIGNED' });
              if (coach.pushTokens?.length > 0) sendPushNotification(coach.pushTokens, t, b, { tournamentId: tournament.id, type: 'COACH_ASSIGNED' });
            }
          }
        }
      }

      // 4h. Evaluations Available
      if (changedKeys.includes('evaluations')) {
        const incomingEvals = req.body.evaluations || [];
        const existingEvals = currentData.evaluations || [];
        const newEvals = incomingEvals.filter(e => e && !existingEvals.some(ee => ee.id === e.id));
        for (const ev of newEvals) {
          const player = newMasterData.players.find(p => String(p.id) === String(ev.playerId));
          if (player) {
            const t = "New Evaluation! 📋";
            const b = `A coach has submitted a performance evaluation for you. Check your profile for details.`;
            addInAppNotification(player, t, b, { evaluationId: ev.id, type: 'EVALUATION_AVAILABLE' });
            if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { evaluationId: ev.id, type: 'EVALUATION_AVAILABLE' });
          }
        }
      }

      // 5. Waitlist Promotions (New in v2.6.97)
      if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
        for (const tournament of newMasterData.tournaments) {
          if (tournament && tournament._justPromotedIds && tournament._justPromotedIds.length > 0) {
            console.log(`📡 [NOTIFY_DEBUG] Dispatching promotion notifications for ${tournament._justPromotedIds.length} players in ${tournament.title}`);
            for (const playerId of tournament._justPromotedIds) {
              const player = newMasterData.players.find(p => String(p.id) === String(playerId));
              if (player) {
                const title = "Off the Waitlist! 🎾";
                const body = `A slot opened up in ${tournament.title}. Pay now to secure your spot!`;
                
                // 🛡️ [NOTIFY_DEBUG] In-app notification already persisted before save
                
                if (player.pushTokens?.length > 0) {
                  sendPushNotification(player.pushTokens, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_PROMOTION' });
                }
              }
            }
            delete tournament._justPromotedIds; // Cleanup temporary field
          }
        }
      }

      // 6. Matchmaking Challenges (New in v2.6.92)
      if (changedKeys.includes('matchmaking')) {
        const incomingMatchmaking = req.body.matchmaking || [];
        const existingMatchmaking = currentData.matchmaking || [];
        
        console.log(`[NOTIFY_DEBUG] Auditing ${incomingMatchmaking.length} matchmaking requests for notifications`);
        
        for (const mm of incomingMatchmaking) {
          const existing = existingMatchmaking.find(emm => emm.id === mm.id);
          const isNewItem = !existing;
          const statusChanged = existing && mm.status !== existing.status;
          const slotChanged = existing && (mm.proposedDate !== existing.proposedDate || mm.proposedTime !== existing.proposedTime);
          
          if (isNewItem || statusChanged || slotChanged) {
            // Determine recipient
            let recipientId = null;
            let title = "";
            let body = "";
            
            if (isNewItem && mm.status === 'Pending') {
              recipientId = mm.receiverId;
              title = "New Match Challenge! 🎾";
              body = `${mm.senderName || 'Someone'} challenged you to a match on ${mm.proposedDate} at ${mm.proposedTime}.`;
            } else if (statusChanged || slotChanged) {
              // Notify the other party
              recipientId = (mm.lastUpdatedBy === mm.senderId) ? mm.receiverId : mm.senderId;
              
              if (mm.status === 'Countered') {
                title = "Counter Proposal Received! 🔄";
                body = `${mm.lastUpdatedByName || 'The opponent'} suggested a new time: ${mm.proposedDate} at ${mm.proposedTime}.`;
              } else if (mm.status === 'Accepted') {
                title = "Match Accepted! ✅";
                body = `Your match for ${mm.proposedDate} at ${mm.proposedTime} has been confirmed.`;
              } else if (mm.status === 'Declined') {
                title = "Challenge Declined ❌";
                body = `The match challenge for ${mm.proposedDate} has been declined.`;
              }
            }
            
            if (recipientId) {
              const recipient = newMasterData.players.find(p => p.id === recipientId);
              if (recipient) {
                console.log(`[NOTIFY_DEBUG] Triggering matchmaking notify for ${recipientId}: ${title}`);
                addInAppNotification(recipient, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
                
                if (recipient.pushTokens?.length > 0) {
                  sendPushNotification(recipient.pushTokens, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
                } else {
                  console.warn(`[NOTIFY_DEBUG] No push tokens found for recipient ${recipientId}`);
                }
              } else {
                console.warn(`[NOTIFY_DEBUG] Recipient ${recipientId} not found in player master list`);
              }
            }
          }
        }
      }
    } catch (notifErr) {
      console.error("❌ Notification Hook Error:", notifErr);
    }
  } catch (error) {
    console.error("❌ Save Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    release();
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
