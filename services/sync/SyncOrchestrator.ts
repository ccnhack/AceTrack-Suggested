import { Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import storage, { thinPlayer, thinPlayers, capPlayerDetail } from '../../utils/storage';
import { dataMerger } from '../dataMerger';
import { eventBus } from '../EventBus';
import config from '../../config';
import logger from '../../utils/logger';

import { telemetryService } from './TelemetryService';
import { queueService } from './QueueService';
import { socketService } from './SocketService';
import { syncApi } from './SyncApi';

/**
 * SYNC ORCHESTRATOR
 * Replaces SyncOrchestrator monolith.
 */

class SyncOrchestrator {
  private static instance: SyncOrchestrator;
  private isAuthMuted: boolean = false;
  private userId: string | null = null;
  private userToken: string | null = null;
  private userRole: string | null = null;
  private hardwareId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private isSyncing: boolean = false;
  private activeSyncs: number = 0;
  private syncTimeout: any = null;
  private syncVersion: number = 0;
  private lastServerUpdate: number = 0;
  private lastDeviceStamp: number = 0;  // Throttle device heartbeats (1 per 20min)
  private lastSuccessfulPullTimestamp: string | null = null; // 📡 [DELTA SYNC] (v2.6.431)
  
  private actionSequences: Map<string, any[]> = new Map();
  private throttleTimeouts: Map<string, any> = new Map();
  private keystore = {
    active: 'ace_secure_secret_v1', 
    previous: null as string | null,
    version: 1
  };
  private currentSchemaVersion = 1;
  private isCloudOnline: boolean = false;

  private constructor() {
    eventBus.subscribe('SYNC_STATUS_CHANGED', (data: any) => {
      this.isCloudOnline = !!data.isOnline;
    });
  }

  /**
   * System Flags (Phase 0.1/0.11 Consolidation)
   * These are non-synced local-only flags (e.g., onboarding, deviceId).
   */
  public async setSystemFlag(key: string, value: any) {
    console.log(`[SyncOrchestrator] Setting system flag: ${key}`);
    await storage.setItem(key, value);
  }

  public async getSystemFlag(key: string): Promise<any | null> {
    return await storage.getItem(key);
  }

  public async removeSystemFlag(key: string) {
    console.log(`[SyncOrchestrator] Removing system flag: ${key}`);
    await storage.removeItem(key);
  }

  public static getInstance(): SyncOrchestrator {
    if (!SyncOrchestrator.instance) {
      SyncOrchestrator.instance = new SyncOrchestrator();
    }
    return SyncOrchestrator.instance;
  }

  public getSocket(): Socket | null {
    return socketService.getSocket();
  }

  public getUserId(): string | null {
    return this.userId;
  }

  public getActiveApiUrl(): string {
    return config.API_BASE_URL;
  }

  public setUserToken(token: string | null) {
    this.userToken = token;
    if (token) this.isAuthMuted = false; // Reset mute on new token
    // Re-setup socket if token changed to ensure high-security connection
    if (this.userId) {
      socketService.setupSocket(this.userId, this.userRole || 'user', this.userToken, this.hardwareId, async (updates) => {
        await this.handleRemoteUpdate(updates);
      });
    }
  }

  /**
   * 🛡️ [SYNC_RECOVERY] (v2.6.315)
   * Force a socket reconnection to the current config.API_BASE_URL.
   * Useful when switching between Local and Cloud modes in Dev.
   */
  public reconnect() {
    if (this.userId) {
      console.log(`[SyncOrchestrator] Reconnecting to: ${config.API_BASE_URL}`);
      socketService.setupSocket(this.userId, this.userRole || 'user', this.userToken, this.hardwareId, async (updates) => {
        await this.handleRemoteUpdate(updates);
      });
    }
  }

  // 🛡️ [PUBLIC QUERY API] (v2.6.125)
  public isSyncActive(): boolean {
    return this.activeSyncs > 0;
  }

  public getLastServerUpdate(): number {
    return this.lastServerUpdate;
  }

  /**
   * Initialize the sync engine for a specific user.
   */
  public async init(userId: string, forceRole?: string) {
    if (this.userId === userId && this.initPromise) return this.initPromise;
    this.userId = userId;
    
    this.initPromise = (async () => {
      try {
        const savedVersion = await storage.getItem('version');
        if (typeof savedVersion === 'number') {
          this.syncVersion = savedVersion;
        }

        // 🛡️ [SYNC RECOVERY] (v2.6.125) Reset sync count and clear hung states
        this.activeSyncs = 0;
        this.isSyncing = false;
        this.emitSyncStatus();

        console.log(`[SyncOrchestrator] Initializing for user: ${userId} (Cloud v${this.syncVersion})`);
        
        // 🛡️ [DIAGNOSTICS] Stabilize hardware ID for Admin Hub correlation
        this.hardwareId = await storage.getItem('acetrack_device_id');

        // 1. Hydrate pending sync state
        await queueService.hydrate();

        const user = await storage.getItem('currentUser');
        const role = forceRole || user?.role || 'user';
        this.userRole = role;

        // 2. Setup Socket.io
        socketService.setupSocket(this.userId, role, this.userToken, this.hardwareId, async (updates) => {
          await this.handleRemoteUpdate(updates);
        });

        // 3. Inform system that initialization is complete
        // 🛡️ [JWT HYDRATION] (v2.6.192) Ensure token is available for immediate polling
        // 🛡️ [HTTP_ONLY_TRANSITION] (v2.6.258): Skip local token hydration on web
        if (Platform.OS !== 'web') {
          const savedToken = await storage.getItem('userToken');
          if (savedToken) {
            console.log(`[SyncOrchestrator] Proactively hydrated token for ${userId}`);
            this.userToken = savedToken;
            this.isAuthMuted = false;
          }
        }

        eventBus.emit('INITIALIZATION_COMPLETE', { userId });

        // 🛡️ [POLLING_FALLBACK] (v2.6.331):
        // If Socket.io fails (common on some corporate/proxy environments),
        // we start a low-frequency REST poll to ensure the UI stays updated.
        if (Platform.OS === 'web') {
           setInterval(() => {
             // Only poll if socket is NOT connected or if we have high conflict history
             if (!this.isCloudOnline) {
               console.log('[SyncOrchestrator] [POLLING] Socket disconnected. Performing REST poll...');
               this.forcePullData();
             }
           }, 20000); // 20s poll is safe for Render free tier
        }
      } catch (e: any) {
        console.error('[SyncOrchestrator] FATAL_INIT_CRASH:', e);
        logger.logAction('SYNC_ORCHESTRATOR_INIT_FATAL', { error: e.message, stack: e.stack });
        // Attempt emergency status update via REST
        telemetryService.trackIncident('emergency', `SYNC_INIT_CRASH: ${e.message}`);
      }
    })();

    return this.initPromise;
  }



  /**
   * The primary entry point for all data changes.
   */
  public async syncAndSaveData(updates: Record<string, any>, isAtomic: boolean = false, isInternal: boolean = false) {
    // 🛡️ [BULK LABEL TRUNCATION] (v2.6.160)
    // Avoid massive string joining for audit logs and bulk hydrates
    const keys = Object.keys(updates);
    const labelBase = keys.length > 3 ? `BULK_SYNC_${keys.length}_KEYS` : `SYNC_${keys.join('_')}`;
    
    // 🛡️ [DYNAMIC THRESHOLD] (v2.6.240)
    // Bulk syncs and Cloud Init naturally take longer on mobile hardware.
    // We increase headroom to 90s for these specific labels to prevent false positives.
    const threshold = (labelBase.includes('BULK') || labelBase.includes('CLOUD_INIT')) ? 90000 : 35000;

    console.log(`[SyncOrchestrator] [SYNC_START] Key: ${labelBase}, Internal: ${isInternal}`);
    return this.trackOperation(labelBase, async () => {
      // 🛡️ [BACKPRESSURE GUARD] (v2.6.125)
      const qLen = storage.getQueueLength();
      if (qLen > 20) {
        telemetryService.trackIncident('backpressure', `High Backpressure: ${qLen} items in queue. System automatically throttling.`);
      }

      // 1. Prepare working set for atomic write (v2.6.240)
      const workingUpdates: Record<string, any> = { ...updates };
      
      // 2. Pre-Processing & Sanitization
      for (const key in workingUpdates) {
        let val = workingUpdates[key];
        
        // Capture Cloud Version
        if (key === 'version' && typeof val === 'number') {
          this.syncVersion = val;
        }

        // Apply thinning
        if (key === 'players' && Array.isArray(val)) {
          workingUpdates[key] = thinPlayers(val.filter(p => !!(p && p.id)));
        } 
        
        // Identity & Profile Guard
        else if (key === 'currentUser' && val) {
          if (this.userId && val.id && val.id !== this.userId) {
            console.warn(`[SyncOrchestrator] [IDENTITY_HIJACK_BLOCK] Rejecting currentUser update: mismatch.`);
            delete workingUpdates[key];
            continue;
          }
          
          // Badge Injection
          if (!isInternal && val.role === 'admin') {
            try {
              const seenIds = await storage.getItem('seenAdminActionIds');
              const visitedTabs = await storage.getItem('visitedAdminSubTabs');
              if (Array.isArray(seenIds)) val.seenAdminActionIds = seenIds;
              if (Array.isArray(visitedTabs)) val.visitedAdminSubTabs = visitedTabs;
            } catch (e) { /* ignore */ }
          }

          val = capPlayerDetail(val);
          
          // Heartbeat
          if (!isInternal && this.hardwareId) {
            const now = Date.now();
            if ((now - this.lastDeviceStamp) > 1200000) {
              this.lastDeviceStamp = now;
              const deviceTracker = {
                id: this.hardwareId,
                name: Constants.deviceName || Platform.OS,
                appVersion: Constants.expoConfig?.version || config.APP_VERSION || '2.6.258',
                platformVersion: `${Platform.OS} (API ${Platform.Version})`,
                lastActive: now
              };
              val.devices = val.devices || [];
              const idx = val.devices.findIndex((d: any) => d && d.id === this.hardwareId);
              if (idx >= 0) val.devices[idx] = deviceTracker;
              else val.devices.push(deviceTracker);
            }
          }

          // 🛡️ [IDENTITY_SYNC] (v2.6.240)
          // Synchronously harmonize players list if it's already in the working set
          if (workingUpdates.players && Array.isArray(workingUpdates.players)) {
             const pIdx = workingUpdates.players.findIndex((p: any) => p && p.id === val.id);
             if (pIdx !== -1) {
                workingUpdates.players[pIdx] = { ...workingUpdates.players[pIdx], ...thinPlayer(val) };
             }
          }

          workingUpdates[key] = val;
        } 
        
        else if (key === 'currentUser' && !val && !isInternal) {
          console.warn('[SyncOrchestrator] Blocking attempt to overwrite currentUser with null.');
          delete workingUpdates[key];
        }

        // Tournament Sanitization & Ghost Pruning
        if (key === 'tournaments' && Array.isArray(val)) {
          workingUpdates[key] = val
            .filter((t: any) => t && t.id && t.title && String(t.title).trim() !== '')
            .map((t: any) => ({
            ...t,
            registeredPlayerIds: Array.isArray(t.registeredPlayerIds) ? t.registeredPlayerIds.filter((id: any) => id !== null) : []
          }));
        }

        // Support Ticket Delivery Stamping (v2.6.241)
        if (key === 'supportTickets' && Array.isArray(val) && isInternal && this.userId) {
          workingUpdates[key] = val.map((ticket: any) => {
            if (!ticket?.messages) return ticket;
            const updatedMsgs = ticket.messages.map((m: any) => {
              // Only upgrade to 'delivered' if currently 'sent'. 
              // Do NOT downgrade 'seen' or 'read' back to 'delivered'.
              if (m.senderId !== this.userId && m.status === 'sent') {
                return { ...m, status: 'delivered' };
              }
              return m;
            });
            return { ...ticket, messages: updatedMsgs };
          });
        }
      }

      // 3. Atomic Multi-Set (v2.6.240)
      console.log(`[SyncOrchestrator] [LOCAL_SAVE] Executing Multi-Set for ${Object.keys(workingUpdates).length} keys...`);
      await storage.multiSet(workingUpdates);

      // 🛡️ Emit updates for each key
      for (const key in workingUpdates) {
        eventBus.emitEntityUpdate(key, null, 'update', isInternal ? 'api' : 'local');
      }

      // 🛡️ [POST-SYNC HARMONIZATION] (v2.6.240)
      // If players wasn't in the update set, but currentUser was, update it in background without blocking watchdog
      if (workingUpdates.currentUser && !workingUpdates.players) {
         (async () => {
            try {
               const players = await storage.getItem('players');
               if (Array.isArray(players)) {
                  const idx = players.findIndex((p: any) => p && p.id === workingUpdates.currentUser.id);
                  if (idx !== -1) {
                     players[idx] = { ...players[idx], ...thinPlayer(workingUpdates.currentUser) };
                     await storage.setItem('players', players);
                     eventBus.emitEntityUpdate('players', null, 'update', 'internal');
                  }
               }
            } catch(e) {}
         })();
      }

      // 4. Cloud Synchronization (Background Path)
      if (!isInternal) {
        // Enqueue for Cloud Sync
        // 🛡️ SECURITY HARDENING (v2.6.164): Removed 'currentUser' from syncableKeys.
        const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs'];
        const syncUpdates: Record<string, any> = {};
        let hasSyncable = false;

        for (const key in workingUpdates) {
          if (syncableKeys.includes(key)) {
            let val = workingUpdates[key];
          
          // 🛡️ [SYNC REPLICATION] Removed LOCAL_PATH_GUARD to allow immediate local avatar previews
          syncUpdates[key] = val;
          hasSyncable = true;
        }
      }

      if (hasSyncable) {
        await queueService.setPendingUpdates(Object.keys(syncUpdates), syncUpdates);

        // 🛡️ [SYNC GATE] (v2.6.118)
        // Only schedule a cloud push if the update originated locally.
        // Data from 'isInternal' sources (socket/pull) should not be pushed back to avoid infinite loops.
        if (!isInternal) {
          if (isAtomic) {
            await this.performCloudPush(false);
          } else {
            this.scheduleCloudPush(false);
          }
        }
        }
      }
    }, threshold);
  }

  /**
   * 🛡️ FLUSH BEFORE PULL (v2.6.125)
   * Forces any pending/debounced local changes to be pushed to the cloud
   * immediately. Must be called BEFORE pulling fresh data to prevent
   * deleted items from reappearing via stale cloud state.
   */
  public async flushPendingPush(): Promise<void> {
    // Cancel any debounced push — we'll do it now
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }

    // Only flush if there are actually pending updates
    if (Object.keys(queueService.getPendingUpdates()).length > 0 || queueService.getPendingSync().length > 0) {
      console.log(`[SyncOrchestrator] [FLUSH] Flushing ${queueService.getPendingSync().length} pending keys before pull: ${queueService.getPendingSync().join(', ')}`);
      await this.performCloudPush(false);
    }
  }

  private scheduleCloudPush(isInternal: boolean) {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => this.performCloudPush(isInternal), 3000);
  }



  /**
   * Centralized sync tracking wrapper.
   * Ensures activeSyncs is always decremented and UI is updated.
   */
  public async trackOperation<T>(label: string, operation: () => Promise<T>, customThreshold?: number): Promise<T> {
    await this.updateSyncStatus(true);
    telemetryService.startWatchdog(label, customThreshold || 35000, () => {
      if (!this.userId || this.userId === 'guest' || this.isAuthMuted) return;
      if (this.activeSyncs > 0) {
        this.activeSyncs = 0;
        this.emitSyncStatus();
      }
    });
    try {
      console.log(`[SyncOrchestrator] [TRACK] Starting: ${label}`);
      return await operation();
    } finally {
      console.log(`[SyncOrchestrator] [TRACK] Finished: ${label}`);
      await this.updateSyncStatus(false);
      if (this.activeSyncs === 0) {
        telemetryService.clearWatchdog();
      }
    }
  }

  private async updateSyncStatus(isStarting: boolean) {
    this.activeSyncs += isStarting ? 1 : -1;
    if (this.activeSyncs < 0) this.activeSyncs = 0;
    
    this.emitSyncStatus();
  }

  private emitSyncStatus() {
    const wasSyncing = this.isSyncing;
    this.isSyncing = this.activeSyncs > 0;
    
    if (wasSyncing !== this.isSyncing) {
      console.log(`[SyncOrchestrator] SYNC_STATUS_CHANGED: isSyncing=${this.isSyncing} (Active: ${this.activeSyncs})`);
      eventBus.emit('SYNC_STATUS_CHANGED', { isSyncing: this.isSyncing });
    }
  }

  /**
   * 🛡️ SELF-HEALING CONFLICT RESOLUTION (v2.6.125)
   * Automatically pulls cloud state, merges with local changes,
   * and increments version to resolve 409 conflicts silently.
   */
  private async selfHealConflict(): Promise<void> {
    return this.trackOperation('CLOUD_SELF_HEAL', async () => {
      console.log('[SyncOrchestrator] [SELF_HEAL] Starting background conflict resolution...');
      telemetryService.trackIncident('reliability', 'Self-Healing: Conflict detected. Merging cloud state...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // Strict 20s for heal pull

      try {
        const cloudUrl = config.API_BASE_URL;
        const headers = { 
          'x-ace-api-key': config.ACE_API_KEY,
          'x-user-id': this.userId || 'guest'
        };
        if (this.userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${this.userToken}`;

        const res = await fetch(`${cloudUrl}${config.getEndpoint('DATA_SYNC')}`, {
          headers,
          credentials: 'include',
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
        
        const serverData = await res.json();
        const localData: Record<string, any> = {};
        
        // Load local state keys that exist in server response
        for (const key in serverData) {
          localData[key] = await storage.getItem(key);
        }

        // Merge using dataMerger
        console.log(`[SyncOrchestrator] [SELF_HEAL] Merging ${Object.keys(serverData).length} keys from cloud...`);
        const { result, meta } = dataMerger.mergeData(localData, serverData);
        console.log(`[SyncOrchestrator] [SELF_HEAL] Merge complete. Changed keys: ${(meta?.fieldsChanged || []).join(', ') || 'none'}`);

        // Save merged result internally (isInternal=true suppresses push-back)
        await this.syncAndSaveData(result, false, true);
        
        // 📡 [DELTA SYNC] (v2.6.431): After successful full heal, record the server time
        // so subsequent forcePullData calls can use incremental delta mode.
        if (serverData.serverTimestamp) {
          this.lastSuccessfulPullTimestamp = serverData.serverTimestamp;
        }
        console.log('[SyncOrchestrator] [SELF_HEAL] State merged. Ready for retry.');
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[SyncOrchestrator] Self-healing failed:', err);
        telemetryService.trackIncident('reliability', `Self-Healing Failed: ${err.message}`);
      }
    });
  }

  public async performCloudPush(isInternal: boolean = false): Promise<void> {
    // 🛡️ [GUEST GUARD] (v2.6.210)
    // More robust identity checking to prevent guest/device-only syncs from leaking.
    const actorId = String(this.userId || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId === 'null' || actorId === 'undefined' || actorId.startsWith('device_') || this.isAuthMuted) {
      if (this.isAuthMuted) console.log('[SyncOrchestrator] performCloudPush: Auth muted due to previous 401.');
      return;
    }
    
    if (this.activeSyncs > 1 && !isInternal) {
      console.log('[SyncOrchestrator] performCloudPush: Skip (Concurrent sync active)');
      return;
    }
    
    console.log('[SyncOrchestrator] Starting Cloud Push sequence...');

    // 🛡️ [AUDIT FIX S-2] (v2.6.327): Snapshot pending updates before clearing.
    // If the push fails, we restore them so they aren't permanently lost.
    const updates = { ...queueService.getPendingUpdates() };
    const savedPendingSync = [...queueService.getPendingSync()];
    await queueService.clearPending();
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = null;

    // 🛡️ [GHOST PUSH PROTECTION] (v2.6.159)
    // Prevent initiating cloud push if there is actually nothing to sync.
    if (Object.keys(updates).length === 0) {
      console.log('[SyncOrchestrator] performCloudPush: No updates found, skipping network sequence.');
      return;
    }

    let workingUpdates = { ...updates };
    let retryCount = 0;
    const MAX_RETRIES = 2;

    while (retryCount <= MAX_RETRIES) {
      const label = `CLOUD_PUSH_ATTEMPT_${retryCount + 1}${isInternal ? '_INTERNAL' : ''}`;
      
      const status: any = await this.trackOperation(label, async () => {
        try {
          const result = await syncApi.pushToApi(
            workingUpdates,
            this.syncVersion,
            this.userId,
            this.userToken,
            this.isAuthMuted,
            isInternal
          );
          
          if (result.success === true) {
            await queueService.clearPending();
            telemetryService.trackMetric('lastSyncSuccess');
            return 'SUCCESS'; 
          }

          if (result.success === 'RETRY_CONFLICT') {
            console.log('[SyncOrchestrator] ⚔️ Conflict detected. Healing...');
            if (result.newServerVersion) this.syncVersion = result.newServerVersion;
            await this.selfHealConflict();
            
            // 🛡️ [SYNC_RECOVERY] (v2.6.331): After heal, we MUST pull fresh state for the next attempt.
            const freshUpdates: Record<string, any> = {};
            for (const key of Object.keys(workingUpdates)) {
               if (key === 'version' || key === 'isInternal') continue;
               freshUpdates[key] = await storage.getItem(key);
            }
            workingUpdates = freshUpdates;
            return 'RETRY_CONTINUE';
          }

          if (result.success === 'RETRY_RATE_LIMIT') return 'RETRY_WAIT';

          if (result.status === 401) this.isAuthMuted = true;

          telemetryService.trackMetric('pushFailureCount');
          return 'FAILURE';
        } catch (error: any) {
          console.error('[SyncOrchestrator] performCloudPush error:', error);
          return 'FAILURE';
        }
      });

      if (status === 'SUCCESS') return;
      if (status === 'FAILURE') {
        await queueService.restorePending(savedPendingSync, updates);
        return; 
      }

      retryCount++;
      if (status === 'RETRY_WAIT') {
        const backoff = 2000 * retryCount;
        await new Promise(r => setTimeout(r, backoff));
      }
      // 'RETRY_CONTINUE' (Conflict) proceeds immediately to the next loop iteration with workingUpdates updated.
    }
  }





  private async handleRemoteUpdate(remoteUpdates: Record<string, any>) {
    // 1. Load local state for relevant keys
    const localState: Record<string, any> = {};
    for (const key in remoteUpdates) {
      localState[key] = await storage.getItem(key);
    }

    // 2. Perform Pure Merge
    const { result, meta } = dataMerger.mergeData(localState, remoteUpdates);

    // 3. Save Merged Result with Checksum Suppression (Phase 0.8)
    for (const key of meta.fieldsChanged) {
      const current = localState[key];
      const next = result[key];
      
      // 🏗️ Phase A-2: Fast hash comparison instead of full JSON.stringify
      if (queueService.fastHash(current) === queueService.fastHash(next)) {
        continue;
      }

      // 🛡️ [IDENTITY GUARD] (v2.6.118)
      // Prevent session hijacking by verifying the ID of the incoming profile update via socket/cloud.
      if (key === 'currentUser' && next && this.userId && next.id && next.id !== this.userId) {
        console.warn(`[SyncOrchestrator] [SOCKET_IDENTITY_HIJACK_BLOCK] Rejecting remote currentUser update for mismatch: Incoming=${next.id}, Active=${this.userId}`);
        telemetryService.trackIncident('anomalies', `Identity Hijack Block: External update for ID ${next.id} ignored.`);
        continue;
      }

      await storage.setItem(key, next);
      eventBus.emitEntityUpdate(key, null, 'update', 'socket');
    }
  }

  /**
   * 🛡️ [SYNC_RECOVERY] (v2.6.330)
   * Manually pull fresh state from the cloud and merge with local state.
   * This is the definitive fallback when Socket.io fails.
   */
  public async forcePullData(): Promise<any> {
    return this.trackOperation('CLOUD_FORCE_PULL', async () => {
       // 📡 [DELTA SYNC] (v2.6.431): Use incremental sync if we have a previous timestamp
       const useDelta = !!this.lastSuccessfulPullTimestamp;
       console.log(`[SyncOrchestrator] [FORCE_PULL] Starting ${useDelta ? 'DELTA' : 'FULL'} sync fallback...`);
       
       let result = await syncApi.pullFromApi(
         this.userId, 
         this.userToken, 
         this.isAuthMuted,
         this.lastSuccessfulPullTimestamp  // null on first pull → full hydration
       );
       
       if (!result.success || !result.data) {
         console.error(`[SyncOrchestrator] [FORCE_PULL] Failed: status=${result.status}`);
         // 📡 [DELTA FALLBACK] (v2.6.433): If a delta pull fails, reset timestamp to force full pull next time
         // AND retry immediately to avoid leaving the client with stale data for the polling interval.
         if (useDelta && result.status !== 401 && result.status !== 403) {
           console.log('[SyncOrchestrator] [FORCE_PULL] Delta failed. Retrying immediately in FULL pull mode...');
           this.lastSuccessfulPullTimestamp = null;
           result = await syncApi.pullFromApi(this.userId, this.userToken, this.isAuthMuted, null);
         }
       }

       // Check again in case the retry also failed, or if it was a full pull failure
       if (!result.success || !result.data) {
         // 🛡️ [AUTH_FAILURE] (v2.6.432): Emit auth failure for 401 responses
         if (result.status === 401) {
           eventBus.emit('AUTH_FAILURE', { status: 401, endpoint: '/api/data' });
         }
         return null;
       }

       console.log(`[SyncOrchestrator] [FORCE_PULL] Received cloud state. isDelta: ${result.data.isDelta || false}, Version: ${result.data.version || 'unknown'}`);
       
       // Process version bump
       if (typeof result.data.version === 'number' && result.data.version > this.syncVersion) {
         this.syncVersion = result.data.version;
       }

       // 📡 [DELTA SYNC] (v2.6.431): Track the server timestamp for next incremental pull
       if (result.serverTimestamp) {
         this.lastSuccessfulPullTimestamp = result.serverTimestamp;
       }

       // 🛡️ [DATA VALIDATION] (v2.6.432): Sanitize pulled data before storing.
       const data = result.data;
       if (Array.isArray(data.tournaments)) {
         const before = data.tournaments.length;
         data.tournaments = data.tournaments.filter((t: any) => t && t.id && t.title);
         const removed = before - data.tournaments.length;
         if (removed > 0) console.warn(`[SyncOrchestrator] Stripped ${removed} corrupted tournament(s) missing id/title.`);
       }
       if (Array.isArray(data.players)) {
         data.players = data.players.filter((p: any) => p && p.id);
       }

       // 🛡️ [DELTA SYNC MERGE] (v2.6.434): Merge incoming data with existing local state
       // Failure to do this causes delta syncs with empty arrays to blindly overwrite local collections!
       const localData: Record<string, any> = {};
       for (const key in data) {
         if (key !== 'isDelta' && key !== 'serverTimestamp' && key !== 'version' && key !== 'lastUpdated') {
           localData[key] = await storage.getItem(key);
         }
       }
       const { result: mergedData } = dataMerger.mergeData(localData, data);

       // Perform Save (isInternal=true to prevent push-back loop)
       await this.syncAndSaveData(mergedData, false, true);
       
       console.log('[SyncOrchestrator] [FORCE_PULL] Manual sync complete. UI updated.');
       return mergedData;
    });
  }

  /**
   * 🛡️ DEEP TRIDECA-GUARD AUTHORITY (Guard 1-13)
   * The definitive pipeline for all matchmaking state changes.
   */
  public async handleMatchUpdate(response: any) {
    // PRE-GUARD: Schema Validation (Guard 7)
    if (!this.validateMatch(response.data?.updatedMatch || response.data?.removedMatchIds)) {
      telemetryService.trackMetric('invalidPayloadCount');
      console.warn('[SyncOrchestrator] INVALID_PAYLOAD_REJECTED', response);
      return;
    }

    // LAYER 1-2: Priority & Sequencing (Commander)
    const matchId = response.data?.updatedMatch?.id || response.data?.removedMatchIds?.[0];
    if (!matchId) return;

    if (!this.actionSequences.has(matchId)) {
      this.actionSequences.set(matchId, []);
    }
    this.actionSequences.get(matchId)!.push(response);

    // LAYER 6: Backpressure & Throttling (Shield)
    if (this.throttleTimeouts.has(matchId)) {
      clearTimeout(this.throttleTimeouts.get(matchId));
    }

    this.throttleTimeouts.set(matchId, setTimeout(() => {
      this.processActionSequence(matchId);
      this.throttleTimeouts.delete(matchId);
    }, 100)); // 100ms throttle window
  }

  private async processActionSequence(matchId: string) {
    return this.trackOperation(`PROCESS_MATCH_${matchId}`, async () => {
      const sequence = this.actionSequences.get(matchId);
      this.actionSequences.delete(matchId);
      if (!sequence || sequence.length === 0) return;

      // GUARD 8: Atomicity (Mutex)
      await storage.runAtomic(async () => {
        let currentMatchmaking = await storage.getItem('matchmaking') || [];
        let changed = false;

      for (const response of sequence) {
        const intent = response.data;
        const incoming = intent.updatedMatch;

        if (incoming) {
          const existing = currentMatchmaking.find((m: any) => m.id === incoming.id);
          
          // GUARD 9: Deep Merge Safety (Recursive)
          const merged = existing ? this.deepMerge(existing, incoming) : incoming;

          // GUARD 10: Logical Versioning & Temporal Safety (Chronos)
          const incomingVer = merged.version || 1;
          const existingVer = existing?.version || 0;

          if (existing && incomingVer < existingVer) {
            telemetryService.trackMetric('staleUpdateCount');
            telemetryService.trackIncident('anomalies', `Stale Action Rejected: Incoming data for ${matchId} is older than local state.`);
            console.log(`[SyncOrchestrator] STALE_UPDATE_IGNORED: ${matchId}`);
            continue;
          }

          if (existing && incomingVer === existingVer) {
             // Fallback to timestamp if versions are equal
             const incomingTime = new Date(merged.lastUpdated || 0).getTime();
             const existingTime = new Date(existing.lastUpdated || 0).getTime();
             if (incomingTime < existingTime) {
                telemetryService.trackMetric('staleUpdateCount');
                continue;
             }
          }

          // GUARD 12: Idempotency (Deduplication)
          // 🏗️ Phase A-2: Fast hash comparison instead of full JSON.stringify
          if (existing && queueService.fastHash(existing) === queueService.fastHash(merged)) {
            telemetryService.trackMetric('noOpSkippedCount');
            continue;
          }

          // APPLY UPDATE
          merged.version = Math.max(existingVer + 1, incomingVer);
          merged.lastUpdated = new Date().toISOString();

          const index = currentMatchmaking.findIndex((m: any) => m.id === merged.id);
          if (index !== -1) {
            currentMatchmaking[index] = merged;
          } else {
            currentMatchmaking.push(merged);
          }
          changed = true;
          telemetryService.trackMetric('successfulUpdateCount');
          
          // GUARD 4: Historian (Record Action)
          await this.recordAction(matchId, response);
        }

        if (intent.removedMatchIds) {
          currentMatchmaking = currentMatchmaking.filter((m: any) => !intent.removedMatchIds.includes(m.id));
          changed = true;
          telemetryService.trackMetric('successfulUpdateCount');
        }
      }

      if (changed) {
        // 🛡️ [SYNC AUTHORITY] (v2.6.118)
        // Route through centralized sync engine with 'Atomic' flag set.
        // This ensures the removal is debounced and pushed to the cloud as an overwrite.
        await this.syncAndSaveData({ matchmaking: currentMatchmaking }, true, false);
      }
    }); // End runAtomic
  }); // End trackOperation
}

  private deepMerge(target: any, source: any): any {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(target[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  private validateMatch(data: any): boolean {
    if (!data) return false;
    const items = Array.isArray(data) ? data : [data];
    for (const item of items) {
      if (typeof item === 'string') continue; // For removed IDs
      if (!item.id || typeof item.id !== 'string') return false;
    }
    return true;
  }

  private async recordAction(matchId: string, response: any) {
    try {
      const historyKey = `match_history_${matchId}`;
      let history = await storage.getItem(historyKey) || { version: 1, actions: [], checksum: '' };
      
      const newAction = {
        type: response.code,
        timestamp: new Date().toISOString(),
        data: response.data.updatedMatch,
        signature: this.signAction(response.data.updatedMatch)
      };

      history.actions.push(newAction);
      if (history.actions.length > 50) history.actions.shift();
      
      history.checksum = this.calculateChecksum(JSON.stringify(history.actions));
      await storage.setItem(historyKey, history);
    } catch (e) {
      console.error('[SyncOrchestrator] Failed to record action:', e);
    }
  }

  private signAction(data: any): string {
    // Simplified signature for this environment
    return `sig_${this.keystore.version}_${JSON.stringify(data).length}_${this.keystore.active.length}`;
  }

  private calculateChecksum(data: string): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
        hash = ((hash << 5) - hash) + data.charCodeAt(i);
        hash |= 0;
    }
    return hash.toString(16);
  }

  public getMetrics() {
    return { 
      ...telemetryService.getMetrics(), 
      queueLength: storage.getQueueLength(),
      activeThrottles: this.throttleTimeouts.size
    };
  }

  /**
   * 🛡️ REPLAY SYSTEM: Deterministic state reconstruction from persistent history.
   * Verifies signatures and checksums before replaying actions.
   */
  public async replayMatch(matchId: string) {
    const historyKey = `match_history_${matchId}`;
    const history = await storage.getItem(historyKey);
    if (!history || !history.actions) return null;

    // GUARD 3: Data Integrity (Checksum)
    const currentHash = this.calculateChecksum(JSON.stringify(history.actions));
    if (currentHash !== history.checksum) {
      telemetryService.trackMetric('anomalyDetectedCount');
      telemetryService.trackIncident('anomalies', `History Corruption: match_history_${matchId} failed checksum verification.`);
      console.error(`[SyncOrchestrator] HISTORY_CORRUPTION_DETECTED: ${matchId}`);
      return null;
    }

    // LAYER 1: Action Authentication (Security - Verify signatures during replay)
    let replayedState = {};
    for (const action of history.actions) {
       if (action.signature !== this.signAction(action.data)) {
           telemetryService.trackMetric('tamperDetectedCount');
           console.error(`[SyncOrchestrator] TAMPER_DETECTED in history for ${matchId}`);
           continue;
       }
       replayedState = this.deepMerge(replayedState, action.data);
    }
    
    console.log(`[SyncOrchestrator] REPLAY_EXECUTED: ${matchId} (Actions: ${history.actions.length})`);
    return replayedState;
  }

  /**
   * 🧪 [TESTING ONLY] Injects stale data to sabotage the next UI save.
   */
  public async injectStaleData(entityType: string, entityId: string) {
    console.log(`🧪 [SyncOrchestrator] Sabotaging ${entityType}:${entityId} with stale version.`);
    const data = await storage.getItem(entityType);
    if (!Array.isArray(data)) return;
    
    const idx = data.findIndex((item: any) => item.id === entityId);
    if (idx !== -1) {
      // Regress the version so the next save looks like a conflict
      data[idx].version = (data[idx].version || 1) - 2;
      await storage.setItem(entityType, data);
      eventBus.emitEntityUpdate(entityType, null, 'update', 'internal');
    }
  }

  public destroy() {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.userId = null;
    this.throttleTimeouts.forEach(t => clearTimeout(t));
    this.throttleTimeouts.clear();
    this.actionSequences.clear();
  }

}

export const syncOrchestrator = SyncOrchestrator.getInstance();
export default SyncOrchestrator;

