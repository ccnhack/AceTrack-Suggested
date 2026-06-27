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
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs', 'partnerRequests'];
    
    const now = Date.now();
    const clientVersion = req.body.version;

    // 🛡️ SCALABILITY FIX (v2.6.316): O(N) -> O(K) Scoped Hydration
    // Collect the exact IDs of the incoming documents to prevent loading the entire DB into memory.
    const reqIds = { players: new Set(), tournaments: new Set(), matches: new Set(), matchVideos: new Set(), supportTickets: new Set(), evaluations: new Set(), matchmaking: new Set(), chatbotMessages: new Set(), partnerRequests: new Set(), auditLogs: new Set(), seenAdminActionIds: new Set(), visitedAdminSubTabs: new Set() };
    
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

    // 🛡️ [VAPT-F23] (v2.6.557): BOLA/IDOR Prevention — JWT-verified identity for ownership checks
    const bolaActorId = String(req.user?.id || req.userId || '').toLowerCase();
    const bolaIsAdmin = req.userRole === 'admin';
    const bolaIsSupport = req.userRole === 'support';

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

              // 🛡️ [VAPT-F23] (v2.6.557): BOLA/IDOR OWNERSHIP GUARD
              // Prevents horizontal privilege escalation where User A can modify User B's data.
              // Uses JWT-verified identity (bolaActorId) — NOT the spoofable x-user-id header.
              if (key === 'players' && !bolaIsAdmin && id !== bolaActorId) {
                console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying player profile ${id}`);
                logAudit(req, 'BOLA_PLAYER_BLOCKED', [key], { targetId: id, actorId: bolaActorId }).catch(() => {});
                return;
              }
              if (key === 'supportTickets' && !bolaIsAdmin && !bolaIsSupport) {
                const ticketOwner = String(existing?.userId || p.userId || '').toLowerCase();
                if (ticketOwner !== bolaActorId) {
                  console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying ticket ${id} (owner: ${ticketOwner})`);
                  logAudit(req, 'BOLA_TICKET_BLOCKED', [key], { targetId: id, actorId: bolaActorId, ownerId: ticketOwner }).catch(() => {});
                  return;
                }
              }
              if (key === 'evaluations' && !bolaIsAdmin) {
                console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying evaluation ${id}`);
                logAudit(req, 'BOLA_EVAL_BLOCKED', [key], { targetId: id, actorId: bolaActorId }).catch(() => {});
                return;
              }
              if (key === 'tournaments' && !bolaIsAdmin) {
                const tCreator = String(existing?.creatorId || p.creatorId || '').toLowerCase();
                const tCoach = String(existing?.assignedCoachId || p.assignedCoachId || '').toLowerCase();
                
                if (tCreator !== bolaActorId && tCoach !== bolaActorId) {
                  console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying tournament ${id}`);
                  logAudit(req, 'BOLA_TOURNAMENT_BLOCKED', [key], { targetId: id, actorId: bolaActorId }).catch(() => {});
                  return;
                }
              }
              if (key === 'matches' && !bolaIsAdmin) {
                const matchPlayers = [existing?.player1Id, existing?.player2Id, p.player1Id, p.player2Id, p.challengerId, p.opponentId]
                  .filter(Boolean).map(pid => String(pid).toLowerCase());
                if (!matchPlayers.includes(bolaActorId)) {
                  console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying match ${id}`);
                  return;
                }
              }
              if (key === 'matchmaking' && !bolaIsAdmin) {
                const mmParticipants = [existing?.senderId, existing?.receiverId, existing?.creatorId, p.senderId, p.receiverId, p.creatorId]
                  .filter(Boolean).map(pid => String(pid).toLowerCase());
                if (!mmParticipants.includes(bolaActorId)) {
                  console.warn(`🛑 [BOLA_GUARD] Blocked ${bolaActorId} from modifying matchmaking ${id}`);
                  return;
                }
              }

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
                
                // 🛡️ ARCHITECTURE FIX: Cap array to prevent MongoDB explosion and UI clutter
                if (mergedDevices.length > 5) {
                  mergedDevices.sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
                  mergedDevices.splice(5);
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
    
    const { processSaveBusinessLogic } = await import('../../services/SaveBusinessLogicService.mjs');
    await processSaveBusinessLogic({ SupportMetricsService, logAudit }, { req, changedKeys, newMasterData, modifiedEntities });

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
    const { processNotificationHooks } = await import('../../services/SaveNotificationService.mjs');
    await processNotificationHooks({ addInAppNotification, sendPushNotification, sendCoachInviteEmail }, { req, changedKeys, currentData, newMasterData });

  } catch (error) {
    console.error("❌ Save Error:", error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    release();
  }
});
  return router;
}
