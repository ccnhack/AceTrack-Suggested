import express from 'express';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { AppState, AuditLog, Player, Tournament, Match, MatchVideo, SupportTicket, Evaluation, Matchmaking, ChatbotThread } from '../models/index.mjs';
import { asyncHandler, getISTTimestamp } from '../helpers/utils.mjs';
import { processTournamentWaitlist } from '../promotion_logic.mjs';
import { apiKeyGuard, sensitiveCacheGuard, validate, SaveDataSchema, DiagnosticsSchema, AutoFlushSchema, getSanitizedState } from '../middleware/security.mjs';

export default function createDataRoutes({
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
  addInAppNotification
}) {
  const router = express.Router();

router.get('/data', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
  try {
    // 🛡️ SCALABILITY ARCHITECTURE (v2.6.316): Prevent OOM crashes on large scale users usage
    // Pre-filter heavy collections at the database level instead of loading the entire DB into Node.js memory.
    let reqUserId = req.headers['x-user-id'];
    const referer = req.headers['referer'] || '';
    if (!reqUserId && referer.includes('/admin')) {
      reqUserId = 'admin';
    }
    const normalizedReqId = String(reqUserId || '').toLowerCase();
    const isAdmin = req.user?.role === 'admin' || normalizedReqId === 'admin' || (req.user?.scopes || []).includes('*');
    const canReadSupport = isAdmin || (req.user?.scopes || []).includes('read:support') || (req.user?.scopes || []).includes('read:basic');

    const matchQuery = isAdmin ? {} : { 
      $or: [
        { "data.player1Id": normalizedReqId },
        { "data.player2Id": normalizedReqId },
        { "data.challengerId": normalizedReqId },
        { "data.opponentId": normalizedReqId }
      ]
    };
    const ticketQuery = canReadSupport ? {} : { "data.userId": normalizedReqId };
    const evalQuery = isAdmin ? {} : { "data.playerId": normalizedReqId };
    const chatQuery = isAdmin ? {} : { "userId": normalizedReqId };

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
      Player.find().lean(), // Active players fetched (PII sanitized later)
      Tournament.find().lean(),
      Match.find(matchQuery).lean(),
      MatchVideo.find().lean(),
      SupportTicket.find(ticketQuery).lean(),
      Evaluation.find(evalQuery).lean(),
      Matchmaking.find().lean(),
      ChatbotThread.find(chatQuery).lean()
    ]);

    const baseData = (state && state.data) ? state.data : {};
    
    // Stitch from Distinct Collections
    const chatbotMessages = {};
    chatbotDocs.forEach(doc => { chatbotMessages[doc.userId] = doc.data; });

    const composedData = {
      ...baseData,
      players: playersDocs.map(d => d.data),
      tournaments: tournamentsDocs.map(d => d.data),
      matches: matchesDocs.map(d => d.data),
      matchVideos: videosDocs.map(d => d.data),
      supportTickets: ticketsDocs.map(d => d.data),
      evaluations: evalsDocs.map(d => d.data),
      matchmaking: matchmakingDocs.map(d => d.data),
      chatbotMessages
    };

    if (composedData.players && Array.isArray(composedData.players)) {
      composedData.players = composedData.players.map(p => {
        if (p && p.role === 'admin' && String(p.id).toLowerCase() !== 'admin') {
          return { ...p, role: 'user' };
        }
        return p;
      });
    }

    if (composedData.currentUser && composedData.currentUser.role === 'admin' && String(composedData.currentUser.id).toLowerCase() !== 'admin') {
      composedData.currentUser.role = 'user';
    }

    // 🛡️ SECURITY HARDENING: Explicitly exclude 'currentUser' and sanitize based on identity.
    
    const users = composedData.players || [];
    const requestingUser = users.find(u => String(u.id).toLowerCase() === String(reqUserId || '').toLowerCase());
    const reqUserRole = requestingUser?.role || (reqUserId === 'admin' ? 'admin' : 'user');

    const sanitizedData = getSanitizedState(composedData, req);
    delete sanitizedData.currentUser;

    res.json({ ...sanitizedData, lastUpdated: state?.lastUpdated || new Date(), version: state?.version || 1 });
  } catch (error) {
    console.error('❌ Data Fetch Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/status
router.get('/status', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
  try {
    // 🛡️ [EMERGENCY RESCUE] (v2.6.312)
    if (req.query.rescue === 'true') {
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
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics
router.get('/diagnostics', apiKeyGuard, sensitiveCacheGuard, asyncHandler(async (req, res) => {
  try {
    const { userId } = req.query;

    // 🛡️ FRONTEND SHIM: The legacy Web Admin Hub might have a stale frontend socket.
    // Hijack this REST query to emit the ping device relay directly from the server.
    if (userId) {
      logServerEvent('ADMIN_PING_DEVICE_SHIM', { targetUserId: userId });
      io.emit('admin_ping_device_relay', { targetUserId: userId });
    }

    let allFilesWithMeta = [];

    // 1. Fetch Cloud Files with metadata
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const result = await cloudinary.search
        .expression('folder:acetrack/diagnostics/*')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute({ signal: controller.signal });
      
      clearTimeout(timeoutId);
        
      result.resources.forEach(file => {
        const parts = file.public_id.split('/');
        allFilesWithMeta.push({
          name: parts[parts.length - 1],
          timestamp: new Date(file.created_at).getTime()
        });
      });
    } catch (e) {
      console.warn('Cloudinary search failed:', e.message);
    }
    
    // 2. Fetch Local Files with metadata
    try {
      if (fs.existsSync(DIAGNOSTICS_DIR)) {
        const localFiles = fs.readdirSync(DIAGNOSTICS_DIR);
        localFiles.forEach(file => {
          const stats = fs.statSync(path.join(DIAGNOSTICS_DIR, file));
          allFilesWithMeta.push({
            name: file,
            timestamp: stats.mtime.getTime()
          });
        });
      }
    } catch (e) {
      console.warn('Local diagnostic read failed:', e.message);
    }
    
    // 3. De-duplicate and Sort Global List (Latest First)
    const uniqueFilesMap = new Map();
    allFilesWithMeta.forEach(f => {
      // Keep the one with the latest timestamp if duplicates exist
      if (!uniqueFilesMap.has(f.name) || uniqueFilesMap.get(f.name) < f.timestamp) {
        uniqueFilesMap.set(f.name, f.timestamp);
      }
    });

    if (userId) console.log(`🔍 [AdminFetch] Filtering logs for: ${userId}`);
    
    const sortedFiles = Array.from(uniqueFilesMap.entries())
      .sort((a, b) => b[1] - a[1]) // Descending
      .map(entry => entry[0])
      .filter(f => {
        if (!userId) return true;
        const safeId = String(userId).toLowerCase();
        const fName = String(f).toLowerCase();
        console.log(`🔍 [AdminFetch] Checking file ${fName} against ID ${safeId}`);
        // Strict match: starts with user_ OR contains admin_requested_user_ OR starts with user-
        return fName.startsWith(safeId + '_') || 
               fName.includes('_requested_' + safeId + '_') ||
               fName.includes('manual_upload_' + safeId + '_') ||
               fName.startsWith(safeId + '-');
      });

    res.json({ success: true, files: sortedFiles });
  } catch (error) {
    console.error('Diagnostics Fetch Error:', error);
    res.status(500).json({ error: error.message });
  }
}));


// GET /api/v1/diagnostics/raw_events (Admin only)
router.get('/diagnostics/raw_events', apiKeyGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const filepath = path.join(DIAGNOSTICS_DIR, 'server_events.jsonl');
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    return res.send(data);
  }
  res.status(404).send('Not found');
}));

router.get('/diagnostics/:filename', apiKeyGuard, asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  
  try {
    const publicId = `acetrack/diagnostics/${filename}`;
    const fileUrl = cloudinary.url(publicId, { resource_type: 'raw', secure: true });
    const cloudRes = await fetch(fileUrl);
    if (cloudRes.ok) {
      const contentType = cloudRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await cloudRes.json();
        return res.json(data);
      } else {
        const text = await cloudRes.text();
        return res.send(text);
      }
    }
  } catch (cloudErr) {
    console.log(`Cloudinary fetch failed for ${filename}, trying local fallback.`);
  }

  const filepath = path.join(DIAGNOSTICS_DIR, filename);
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    return res.json(JSON.parse(data));
  }

  res.status(404).json({ error: 'File not found in cloud or local storage' });
}));

// POST /api/v1/register-push-token
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
      playerDoc.data = { ...player, pushTokens: tokens };
      playerDoc.lastUpdated = new Date();
      playerDoc.markModified('data');
      await playerDoc.save();
      console.log(`📱 [NOTIFY_DEBUG] Token Registered: ${pushToken.substring(0, 15)}... for user ${userId}. Total: ${tokens.length}`);
    } else {
      console.log(`📱 [NOTIFY_DEBUG] Token already exists for user ${userId}`);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/save
router.post('/save', apiKeyGuard, sensitiveCacheGuard, validate(SaveDataSchema), async (req, res) => {
  const waitStart = Date.now();
  const release = await syncMutex.acquire();
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
      Player.find(buildQuery('players')).lean(),
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
          const atomicKeys = req.body.atomicKeys || [];

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
            console.log(`[SYNC_DEBUG] Atomic Overwrite for key: ${key} (${incoming.length} items)`);
            newMasterData[key] = incoming;
            continue; 
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

                if (isUserRegistering && existingReg >= (existing.maxPlayers || 0)) {
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
                const preservedStatus = (existing.role === 'support' && existing.supportStatus) 
                  ? existing.supportStatus : (p.supportStatus || existing.supportStatus);
                
                // 🛡️ [DEFINED-ONLY MERGE] (v2.6.313): Only overwrite fields that are explicitly
                // present in the incoming data. Thinned players have many fields set to undefined;
                // spreading them would silently delete wallet, history, notifications, etc.
                const definedFields = {};
                for (const [fieldKey, fieldVal] of Object.entries(p)) {
                  if (fieldVal !== undefined && fieldKey !== 'devices' && fieldKey !== 'password' && fieldKey !== 'supportStatus') {
                    definedFields[fieldKey] = fieldVal;
                  }
                }
                const merged = { ...existing, ...definedFields, devices: mergedDevices, password: preservedPassword, supportStatus: preservedStatus };
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
                  const merged = { ...existing, ...p, messages: mergedMessages };
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

    const nextVersion = currentVersion + 1;

    // 🛡️ [16MB BOMB DEFUSAL] (v2.6.316): Strip distinct collections before saving monolithic AppState
    const appStateDataToSave = { ...newMasterData };
    const distinctKeys = ['players', 'tournaments', 'matches', 'matchVideos', 'supportTickets', 'evaluations', 'matchmaking', 'chatbotMessages'];
    distinctKeys.forEach(k => delete appStateDataToSave[k]);

    // 🛡️ [C-6 FIX] (v2.6.315): Avoid empty {} filter which can cause duplicate singletons
    // If state._id exists, target it exactly. If not, create a new document with a generated ID.
    const updateFilter = state?._id ? { _id: state._id } : { _id: new mongoose.Types.ObjectId() };
    const updatedState = await AppState.findOneAndUpdate(
      updateFilter,
      { $set: { data: appStateDataToSave, version: nextVersion, lastUpdated: now } },
      { upsert: true, returnDocument: 'after' }
    );

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
      // 1. New Match Challenges
      if (changedKeys.includes('matches')) {
        const incomingMatches = req.body.matches || [];
        const existingMatches = currentData.matches || [];
        const newMatches = incomingMatches.filter(m => !existingMatches.some(em => em.id === m.id));
        
        for (const match of newMatches) {
          if (match.status === 'scheduled' || match.status === 'Pending') {
            const opponentId = match.player2Id || match.opponentId;
            const challengerId = match.player1Id || match.challengerId;
            console.log(`[NOTIFY_DEBUG] Processing match ${match.id} (Status: ${match.status}) for opponent ${opponentId}`);
            const opponent = newMasterData.players.find(p => p.id === opponentId);
            const challenger = newMasterData.players.find(p => p.id === challengerId);
            
            if (opponent) {
              const challengerName = challenger?.name || 'Someone';
              const title = "New Match Challenge! 🎾";
              const body = `${challengerName} challenged you to a match.`;
              
              addInAppNotification(opponent, title, body, { matchId: match.id, type: 'MATCH_CHALLENGE' });
              
              if (opponent.pushTokens?.length > 0) {
                sendPushNotification(opponent.pushTokens, title, body, { matchId: match.id, type: 'MATCH_CHALLENGE' });
              }
            }
          }
        }
      }

      // 2. Video Approvals
      if (changedKeys.includes('matchVideos')) {
        const incomingVideos = req.body.matchVideos || [];
        const existingVideos = currentData.matchVideos || [];
        
        for (const video of incomingVideos) {
          const existing = existingVideos.find(ev => ev.id === video.id);
          const justApproved = video.adminStatus === 'Active' && (!existing || existing.adminStatus !== 'Active');
          
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
        const invalidTickets = incomingTickets.filter(t => !t.title || t.title === 'undefined' || !t.description || t.description === 'undefined');
        if (invalidTickets.length > 0) {
          console.warn(`🛡️ [GUARD] Rejecting sync due to ${invalidTickets.length} malformed tickets.`);
          return res.status(400).json({ 
            error: "MALFORMED_TICKET_DATA", 
            details: "Subject and Description are required for all tickets." 
          });
        }

        for (let i = 0; i < incomingTickets.length; i++) {
          const ticket = incomingTickets[i];
          const existing = existingTickets.find(et => et.id === ticket.id);
          const isNew = !existing;
          const newMessages = (ticket.messages || []).slice(existing ? existing.messages.length : 0);
          
          if (isNew) {
             logAudit(req, 'TICKET_CREATED', ['supportTickets'], { ticketId: ticket.id, type: ticket.type, title: ticket.title });
          }
          // 🤖 [AUTO-ASSIGN] (v2.6.132) 
          // If ticket is Open and unassigned, try to find a best agent
          if (ticket.status === 'Open' && !ticket.assignedTo) {
            const bestAgent = SupportMetricsService.findBestAgent(newMasterData.players, newMasterData.supportTickets || []);
            if (bestAgent) {
              console.log(`🤖 [ASSIGN] Auto-assigning ticket ${ticket.id} to agent ${bestAgent.id} (${bestAgent.firstName})`);
              ticket.assignedTo = bestAgent.id;
              ticket.assignedAt = new Date().toISOString();
              ticket.assignmentSource = 'auto';
              
              logAudit(req, 'TICKET_AUTO_ASSIGNED', ['supportTickets', 'players'], { 
                ticketId: ticket.id, 
                agentId: bestAgent.id,
                agentName: `${bestAgent.firstName} ${bestAgent.lastName}`
              });

              // Increment agent's lifetime handles
              const agentIndex = newMasterData.players.findIndex(p => p.id === bestAgent.id);
              if (agentIndex !== -1) {
                if (!newMasterData.players[agentIndex].metrics) newMasterData.players[agentIndex].metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
                newMasterData.players[agentIndex].metrics.totalHandled += 1;
              }
            }
          }

          // 🛡️ [TERMINATION CLEANUP] (v2.6.132)
          // If the assigned agent is now terminated, unassign the ticket
          if (ticket.assignedTo) {
            const agent = newMasterData.players.find(p => p.id === ticket.assignedTo);
            if (agent && agent.supportStatus === 'terminated') {
              console.log(`🛡️ [CLEANUP] Unassigning ticket ${ticket.id} due to agent termination.`);
              ticket.assignedTo = null;
              ticket.assignedAt = null;
            }
          }

          for (const msg of newMessages) {
            // Track Initial Acknowledgment (v2.6.132)
            if (String(msg.senderId) !== String(ticket.userId) && !ticket.firstResponseAt && msg.senderId !== 'system') {
                ticket.firstResponseAt = new Date().toISOString();
            }

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

      // 4. Tournament Registrations (New in v2.6.84)
      if (changedKeys.includes('tournaments')) {
        const incomingTournaments = req.body.tournaments || [];
        const existingTournaments = currentData.tournaments || [];

        for (const tournament of incomingTournaments) {
          const existing = existingTournaments.find(et => et.id === tournament.id);
          const incomingRegIds = tournament.registeredPlayerIds || [];
          const existingRegIds = existing ? (existing.registeredPlayerIds || []) : [];
          
          // Find newly registered players
          const newRegIds = incomingRegIds.filter(id => !existingRegIds.includes(id));

          for (const playerId of newRegIds) {
            const player = newMasterData.players.find(p => p.id === playerId);
            if (player) {
              const title = "Registration Confirmed! 🏆";
              const body = `You're officially registered for ${tournament.title}. Good luck!`;
              
              addInAppNotification(player, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              
              if (player.pushTokens?.length > 0) {
                sendPushNotification(player.pushTokens, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              }
            }
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
    res.status(500).json({ error: error.message });
  } finally {
    release();
  }
});

// POST /api/v1/upload
router.post('/upload', apiKeyGuard, upload.single('video'), async (req, res) => {
  if (!req.file) {
    logServerEvent('UPLOAD_FAILED', { error: 'No file received' });
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let uploadFolder = 'acetrack';
    if (req.file.mimetype.startsWith('video/')) uploadFolder = 'acetrack/videos';
    else if (req.file.mimetype.startsWith('image/')) uploadFolder = 'acetrack/images';
    else uploadFolder = 'acetrack/others';

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}${req.file.mimetype.startsWith('image/') ? '.jpg' : ''}`,
        format: req.file.mimetype.startsWith('image/') ? 'jpg' : undefined,
      },
      async (error, result) => {
        if (req.file.path) {
          fs.promises.unlink(req.file.path).catch(e => console.error("Cleanup error:", e));
        }

        if (error) {
          console.error("❌ Cloudinary Upload Error:", error);
          await logServerEvent('UPLOAD_FAILED_CLOUDINARY', { error: error.message });
          return res.status(500).json({ error: "Failed to upload to cloud" });
        }
        
        await logAudit(req, 'FILE_UPLOAD_CLOUDINARY', [], { url: result.secure_url, size: req.file.size });
        await logServerEvent('UPLOAD_SUCCESS_CLOUDINARY', { url: result.secure_url });
        
        res.json({ url: result.secure_url });
      }
    );

    fs.createReadStream(req.file.path).pipe(stream);
  } catch (error) {
    console.error('Upload Process Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/diagnostics
router.post('/diagnostics', apiKeyGuard, validate(DiagnosticsSchema), asyncHandler(async (req, res) => {
  const { username, logs, prefix, deviceId } = req.body;
    const timestamp = getISTTimestamp();
    const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    try {
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`) || f.startsWith(`admin_requested_${safeUsername}_`))
        .sort();
      while (userFiles.length >= 3) {
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, userFiles.shift()));
      }
    } catch (e) { /* silent */ }

    const filePrefix = prefix === 'admin_requested' ? 'admin_requested_' : '';
    const safeDeviceId = deviceId ? `_${deviceId.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${filePrefix}${safeUsername}${safeDeviceId}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const reportData = {
      username,
      deviceId: deviceId || 'Unknown Device',
      uploadedAt: istDate.toISOString().replace('Z', '+05:30'),
      logs
    };

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));

    console.log(`☁️ [Cloudinary] Starting upload for: ${filename} (Size: ${fs.statSync(filepath).size} bytes)`);
    try {
      const cloudResult = await cloudinary.uploader.upload(filepath, {
        folder: 'acetrack/diagnostics',
        resource_type: 'raw',
        public_id: filename,
        use_filename: true,
        unique_filename: false
      });
      console.log(`✅ [Cloudinary] Upload Success: ${cloudResult.secure_url} (ID: ${cloudResult.public_id})`);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_SUCCESS', { 
        url: cloudResult.secure_url,
        public_id: cloudResult.public_id,
        filename: filename
      });
      logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
      
      try {
        const result = await cloudinary.search
          .expression('folder:acetrack/diagnostics/*')
          .sort_by('created_at', 'desc')
          .max_results(100)
          .execute();
          
        const userFilesCloud = result.resources.filter(f => {
          const fName = f.public_id.split('/').pop().toLowerCase();
          return fName.startsWith(`${safeUsername}_`) || 
                 fName.startsWith(`admin_requested_${safeUsername}_`);
        });
        
        if (userFilesCloud.length > 3) {
          const filesToDelete = userFilesCloud.slice(3).map(f => f.public_id);
          console.log(`🧹 [Cloudinary] Rotating ${filesToDelete.length} old diagnostic(s) for ${safeUsername}`);
          await cloudinary.api.delete_resources(filesToDelete, { resource_type: 'raw' });
        }
      } catch (rotationErr) {
        console.error('❌ [Cloudinary] Rotation Failed:', rotationErr.message);
      }
      
    } catch (err) {
      console.error('❌ [Cloudinary] Diagnostics Backup Failed:', err.message);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_ERROR', { 
        error: err.message, 
        filename,
        stack: err.stack 
      });
      await logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
    }

    res.json({ success: true, filename });
}));

// POST /api/v1/diagnostics/auto-flush
router.post('/diagnostics/auto-flush', apiKeyGuard, validate(AutoFlushSchema), asyncHandler(async (req, res) => {
  const { username, deviceId, logs } = req.body;
  const safeUser = String(username || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const safeDevice = String(deviceId || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const timestamp = getISTTimestamp();
  const filename = `${safeUser}_${safeDevice}_${timestamp}.log`;
  
  const filePath = path.join(DIAGNOSTICS_DIR, filename);
  const logContent = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()} [${l.type}]: ${l.message}`).join('\n');
  await fs.promises.writeFile(filePath, logContent);

  console.log(`☁️ [Cloudinary Auto-Flush] Starting upload for: ${filename} (Size: ${(await fs.promises.stat(filePath)).size} bytes)`);
  try {
    const cloudResult = await cloudinary.uploader.upload(filePath, {
      folder: 'acetrack/diagnostics/auto-flush',
      resource_type: 'raw',
      public_id: filename,
      use_filename: true,
      unique_filename: false
    });
    console.log(`✅ [Cloudinary Auto-Flush] Success: ${cloudResult.secure_url}`);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_SUCCESS', { 
      url: cloudResult.secure_url,
      filename: filename
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
  } catch (err) {
    console.error('❌ [Cloudinary Auto-Flush] Backup Failed:', err.message);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_ERROR', { 
      error: err.message, 
      filename,
      stack: err.stack
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
  }

  const allFiles = await fs.promises.readdir(DIAGNOSTICS_DIR);
  const userFiles = allFiles
    .filter(f => f.startsWith(`${safeUser}_${safeDevice}_`) && f.endsWith('.log'))
    .sort((a, b) => {
      const timeA = parseInt(a.split('_').pop().replace('.log', '')) || 0;
      const timeB = parseInt(b.split('_').pop().replace('.log', '')) || 0;
      return timeB - timeA;
    });

  if (userFiles.length > 3) {
    for (const f of userFiles.slice(3)) {
      await fs.promises.unlink(path.join(DIAGNOSTICS_DIR, f)).catch(() => {});
    }
  }

  res.json({ success: true, count: logs.length, retained: 3 });
}));

// GET /api/v1/audit-logs (Admin only)
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
