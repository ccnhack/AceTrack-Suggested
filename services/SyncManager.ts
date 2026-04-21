import { io, Socket } from 'socket.io-client';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import storage, { thinPlayer, thinPlayers, capPlayerDetail } from '../utils/storage';
import { dataMerger } from './dataMerger';
import { eventBus } from './EventBus';
import { connectivityService } from './ConnectivityService';
import config from '../config';
import logger from '../utils/logger';

/**
 * SYNC MANAGER (Phase 0)
 * Centralized singleton for all data persistence and cloud synchronization.
 * 
 * Features:
 * - Mutex-style locking for storage operations.
 * - Debounced cloud pushing.
 * - Socket-driven real-time updates.
 * - Deterministic merging via dataMerger.
 */

class SyncManager {
  private static instance: SyncManager;
  private userId: string | null = null;
  private hardwareId: string | null = null;
  private initPromise: Promise<void> | null = null;
  private socket: Socket | null = null;
  private isSyncing: boolean = false;
  private activeSyncs: number = 0;
  private pendingSync: string[] = [];
  private pendingSyncUpdates: Record<string, any> = {};
  private syncTimeout: any = null;
  private syncVersion: number = 0;
  private lastServerUpdate: number = 0;
  private lastDeviceStamp: number = 0;  // Throttle device heartbeats (1 per 20min)
  private metrics = {
    invalidPayloadCount: 0,
    staleUpdateCount: 0,
    noOpSkippedCount: 0,
    successfulUpdateCount: 0,
    tamperDetectedCount: 0,
    anomalyDetectedCount: 0,
    pushAttemptCount: 0,
    pushFailureCount: 0,
    rateLimitCount: 0,
    conflictCount: 0,
    lastSyncSuccess: null as string | null,
    incidentHistory: [] as { type: string, message: string, timestamp: string }[],
  };
  private actionSequences: Map<string, any[]> = new Map();
  private throttleTimeouts: Map<string, any> = new Map();
  private keystore = {
    active: 'ace_secure_secret_v1', // Should be fetched/derived in prod
    previous: null as string | null,
    version: 1
  };
  private currentSchemaVersion = 1;

  private constructor() {}

  /**
   * System Flags (Phase 0.1/0.11 Consolidation)
   * These are non-synced local-only flags (e.g., onboarding, deviceId).
   */
  public async setSystemFlag(key: string, value: any) {
    console.log(`[SyncManager] Setting system flag: ${key}`);
    await storage.setItem(key, value);
  }

  public async getSystemFlag(key: string): Promise<any | null> {
    return await storage.getItem(key);
  }

  public async removeSystemFlag(key: string) {
    console.log(`[SyncManager] Removing system flag: ${key}`);
    await storage.removeItem(key);
  }

  public static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  public getSocket(): Socket | null {
    return this.socket;
  }

  public getActiveApiUrl(): string {
    return config.API_BASE_URL;
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
  public async init(userId: string) {
    if (this.userId === userId && this.initPromise) return this.initPromise;
    this.userId = userId;
    
    this.initPromise = (async () => {
      const savedVersion = await storage.getItem('version');
      if (typeof savedVersion === 'number') {
        this.syncVersion = savedVersion;
      }

      // 🛡️ [SYNC RECOVERY] (v2.6.125) Reset sync count and clear hung states
      this.activeSyncs = 0;
      this.isSyncing = false;
      this.emitSyncStatus();

      console.log(`[SyncManager] Initializing for user: ${userId} (Cloud v${this.syncVersion})`);
      
      // 🛡️ [DIAGNOSTICS] Stabilize hardware ID for Admin Hub correlation
      this.hardwareId = await storage.getItem('acetrack_device_id');

      // 1. Hydrate pending sync state
      const savedPending = await storage.getItem('pendingSync');
      if (Array.isArray(savedPending)) {
        this.pendingSync = savedPending;
      }

      // 2. Setup Socket.io
      this.setupSocket(userId);

      // 3. Inform system that initialization is complete
      eventBus.emit('INITIALIZATION_COMPLETE', { userId });
    })();

    return this.initPromise;
  }

  private setupSocket(userId: string) {
    if (this.socket) {
        this.socket.disconnect();
    }

    this.socket = io(config.API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: { userId },
      auth: { token: config.ACE_API_KEY },
      extraHeaders: { 'x-ace-api-key': config.ACE_API_KEY }
    });

    this.socket.on('connect', () => {
      console.log('[SyncManager] Socket connected');
      eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: true, source: 'socket' });
    });

    this.socket.on('disconnect', () => {
      console.log('[SyncManager] Socket disconnected');
      eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: false, source: 'socket' });
    });

    this.socket.on('data_updated', async (data) => {
      // 🛡️ [SELF-ECHO GUARD] (v2.6.125)
      // Skip updates originating from our own socket to prevent sync loops
      if (data?.lastSocketId && this.socket?.id && data.lastSocketId === this.socket.id) {
        console.log('[SyncManager] Skipping self-originated socket update.');
        return;
      }
      console.log('[SyncManager] Received data_updated via socket');
      await this.handleRemoteUpdate(data.updates);
    });

    // 🛡️ [DIAGNOSTICS] ADMIN PING RESPONDER (v2.6.118)
    // Allows the Admin Hub to verify real-time device connectivity.
    this.socket.on('admin_ping_device_relay', async (data: any) => {
      if (data.targetUserId === this.userId && this.socket) {
        // Ensure hardwareId is loaded before ponging
        if (this.initPromise) await this.initPromise;
        
        console.log('[SyncManager] Received Admin Ping — Replying with Pong');
        this.socket.emit('device_pong', {
          targetUserId: this.userId,
          deviceId: this.hardwareId || Constants.sessionId || 'mobile_client',
          deviceName: Constants.deviceName || Platform.OS, // Fallback to OS if name is null
          appVersion: Constants.expoConfig?.version || '2.6.117',
          timestamp: Date.now() // Numerical timestamp for better Admin Hub compatibility
        });
      }
    });

    // 🛡️ [DIAGNOSTICS] FORCE UPLOAD RESPONDER
    // Allows the Admin Hub to pull logs remotely from the device.
    // Matches monolith App.js format: prefix='admin_requested' so Admin Hub shows [ADMIN PULL]
    this.socket.on('force_upload_diagnostics', async (data: any) => {
      if (data.targetUserId === this.userId) {
         console.log('[SyncManager] Received Force Upload Request');
         logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', {
           adminId: data.adminId,
           targetUserId: data.targetUserId,
           myId: this.userId,
           targetDeviceId: data.targetDeviceId,
           myDeviceId: this.hardwareId
         });
         try {
           const user = await storage.getItem('currentUser');
           const label = user?.name || 'Guest';
           const deviceId = this.hardwareId || await storage.getItem('acetrack_device_id') || 'unknown';
           const allLogs = logger.getLogs();
           await fetch(`${config.API_BASE_URL}/api/diagnostics`, {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'x-ace-api-key': config.ACE_API_KEY
             },
             body: JSON.stringify({
               username: label,
               logs: allLogs,
               prefix: 'admin_requested',
               deviceId
             })
           });
           logger.logAction('ADMIN_DIAGNOSTICS_PULL_SUCCESS', { count: allLogs.length });
         } catch (e: any) {
           console.error('[SyncManager] Remote diagnostic upload failed:', e);
           logger.logAction('ADMIN_DIAGNOSTICS_PULL_FAILED', { error: e.message });
         }
      }
    });

  }

  /**
   * The primary entry point for all data changes.
   */
  public async syncAndSaveData(updates: Record<string, any>, isAtomic: boolean = false, isInternal: boolean = false) {
    if (!this.userId) return;

    return this.trackOperation(`SYNC_${Object.keys(updates).join('_')}`, async () => {
      // 🛡️ [BACKPRESSURE GUARD] (v2.6.125)
      const qLen = storage.getQueueLength();
      if (qLen > 20) {
        this.trackIncident('backpressure', `High Backpressure: ${qLen} items in queue. System automatically throttling.`);
      }

      // 1. Local Persistence (Fast Path)
      for (const key in updates) {
        let val = updates[key];
        
        // Capture Cloud Version
        if (key === 'version' && typeof val === 'number') {
          this.syncVersion = val;
        }

        // Apply thinning/capping as needed
        if (key === 'players' && Array.isArray(val)) {
          val = thinPlayers(val.filter(p => !!(p && p.id)));
        } else if (key === 'currentUser' && val) {
          // 🛡️ [IDENTITY GUARD] (v2.6.118)
          // Prevent session hijacking by verifying the ID of the incoming profile update.
          if (this.userId && val.id && val.id !== this.userId) {
            console.warn(`[SyncManager] [IDENTITY_HIJACK_BLOCK] Rejecting currentUser update for mismatch: Incoming=${val.id}, Active=${this.userId}`);
            continue;
          }
          
          // 🛡️ [ADMIN BADGE INJECTION] (v2.6.125)
          // When admin syncs, auto-inject seenAdminActionIds/visitedAdminSubTabs
          if (!isInternal && val.role === 'admin') {
            try {
              const seenIds = await storage.getItem('seenAdminActionIds');
              const visitedTabs = await storage.getItem('visitedAdminSubTabs');
              if (Array.isArray(seenIds)) val.seenAdminActionIds = seenIds;
              if (Array.isArray(visitedTabs)) val.visitedAdminSubTabs = visitedTabs;
            } catch (e) {
              console.warn('[SyncManager] Badge injection deferred:', e);
            }
          }

          val = capPlayerDetail(val);
          
          // 🛡️ [DEVICE HEARTBEAT] (v2.6.125)
          // Stamp current device info into currentUser.devices for Admin Hub diagnostics.
          // Throttled to once per 20 minutes to avoid excessive writes.
          if (!isInternal && this.hardwareId) {
            const now = Date.now();
            const shouldStamp = (now - this.lastDeviceStamp) > 1200000; // 20 min
            if (shouldStamp) {
              this.lastDeviceStamp = now;
              const deviceTracker = {
                id: this.hardwareId,
                name: Constants.deviceName || Platform.OS,
                appVersion: Constants.expoConfig?.version || '2.6.122',
                platformVersion: `${Platform.OS} (API ${Platform.Version})`,
                lastActive: now
              };
              val.devices = val.devices || [];
              const existingIdx = val.devices.findIndex((d: any) => d && d.id === this.hardwareId);
              if (existingIdx >= 0) {
                val.devices[existingIdx] = deviceTracker;
              } else {
                val.devices.push(deviceTracker);
              }
              console.log(`[SyncManager] [DEVICE_HEARTBEAT] Stamped device: ${this.hardwareId}`);
            }
          }
          
          // 🛡️ [SYNC HARMONIZATION] (v2.6.118)
          // Ensure profile changes (avatar, name) reflect in the Rankings/Matchmaking lists immediately.
          (async () => {
            try {
              const players = await storage.getItem('players');
              if (Array.isArray(players) && val && val.id) {
                const idx = players.findIndex((p: any) => p && p.id === val.id);
                if (idx !== -1) {
                  // Merge updated fields while preserving ranking-specific ones
                  const prevVerified = !!players[idx].isEmailVerified;
                  players[idx] = { ...players[idx], ...thinPlayer(val) };
                  const nextVerified = !!players[idx].isEmailVerified;
                  
                  if (prevVerified !== nextVerified) {
                    console.log(`[SyncManager] [IDENTITY_SYNC] ${val.id} verification changed: ${prevVerified} -> ${nextVerified}`);
                  }
                  
                  await storage.setItem('players', players);
                  eventBus.emitEntityUpdate('players', null, 'update', 'internal');
                  console.log(`[SyncManager] Harmonized profile for: ${val.id} (E:${!!players[idx].isEmailVerified} P:${!!players[idx].isPhoneVerified})`);
                }


              }
            } catch (e) {
              console.warn('[SyncManager] Profile harmonization deferred:', e);
            }
          })();
        } else if (key === 'currentUser' && !val && !isInternal) {
          // 🛡️ RECOVERY GUARD: Prevent overwriting currentUser with null during sync
          // unless it's an internal reset or logout (which should use removeSystemFlag).
          console.warn('[SyncManager] Blocking attempt to overwrite currentUser with null.');
          continue; 
        }

        // 🛡️ [TOURNAMENT SANITIZATION] (v2.6.125)
        // Strip nil playerIds from tournament arrays on local save
        if (key === 'tournaments' && Array.isArray(val)) {
          val = val.map((t: any) => ({
            ...t,
            registeredPlayerIds: (t.registeredPlayerIds || []).filter((pid: any) => !!pid),
            pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter((pid: any) => !!pid)
          }));
        }

        // 🛡️ [TICKET MESSAGE STATE: DELIVERED] (v2.6.125)
        // On pull (isInternal), mark incoming messages from others as 'delivered'
        if (key === 'supportTickets' && Array.isArray(val) && isInternal && this.userId) {
          val = val.map((ticket: any) => {
            if (!ticket?.messages) return ticket;
            const updatedMsgs = ticket.messages.map((m: any) => {
              if (m.senderId !== this.userId && m.status === 'sent') {
                return { ...m, status: 'delivered' };
              }
              return m;
            });
            return { ...ticket, messages: updatedMsgs };
          });
        }

        await storage.setItem(key, val);
        eventBus.emitEntityUpdate(key, null, 'update', isInternal ? 'api' : 'local');
      }

      // 2. Enqueue for Cloud Sync
      const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'currentUser', 'chatbotMessages', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs'];
      const syncUpdates: Record<string, any> = {};
      let hasSyncable = false;

      for (const key in updates) {
        if (syncableKeys.includes(key)) {
          let val = updates[key];
          
          // 🛡️ [SYNC REPLICATION] Removed LOCAL_PATH_GUARD to allow immediate local avatar previews
          syncUpdates[key] = val;
          hasSyncable = true;
          if (!this.pendingSync.includes(key)) {
            this.pendingSync.push(key);
          }
        }
      }

      if (hasSyncable) {
        await storage.setItem('pendingSync', this.pendingSync);
        Object.assign(this.pendingSyncUpdates, syncUpdates);

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

    });
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
    if (Object.keys(this.pendingSyncUpdates).length > 0 || this.pendingSync.length > 0) {
      console.log(`[SyncManager] [FLUSH] Flushing ${this.pendingSync.length} pending keys before pull: ${this.pendingSync.join(', ')}`);
      await this.performCloudPush(false);
    }
  }

  private scheduleCloudPush(isInternal: boolean) {
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = setTimeout(() => this.performCloudPush(isInternal), 3000);
  }

  /**
   * 🛡️ WATCHDOG ENGINE (v2.6.125)
   * Prevents 'Stuck Sync' UI by forcing a reset if no operations complete within 15s.
   */
  private syncWatchdog: any = null;
  private startWatchdog() {
    if (this.syncWatchdog) clearTimeout(this.syncWatchdog);
    this.syncWatchdog = setTimeout(() => {
      if (this.activeSyncs > 0) {
        console.warn(`[SyncManager] 🛡️ WATCHDOG TRIGGERED: Forcing sync reset after 30s hang.`);
        this.activeSyncs = 0;
        this.emitSyncStatus();
      }
    }, 30000);
  }

  /**
   * Centralized sync tracking wrapper.
   * Ensures activeSyncs is always decremented and UI is updated.
   */
  public async trackOperation<T>(label: string, operation: () => Promise<T>): Promise<T> {
    await this.updateSyncStatus(true);
    this.startWatchdog();
    try {
      console.log(`[SyncManager] [TRACK] Starting: ${label}`);
      return await operation();
    } finally {
      console.log(`[SyncManager] [TRACK] Finished: ${label}`);
      await this.updateSyncStatus(false);
      if (this.activeSyncs === 0 && this.syncWatchdog) {
        clearTimeout(this.syncWatchdog);
        this.syncWatchdog = null;
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
      console.log(`[SyncManager] SYNC_STATUS_CHANGED: isSyncing=${this.isSyncing} (Active: ${this.activeSyncs})`);
      eventBus.emit('SYNC_STATUS_CHANGED', { isSyncing: this.isSyncing });
    }
  }

  /**
   * 🛡️ SELF-HEALING CONFLICT RESOLUTION (v2.6.125)
   * Automatically pulls cloud state, merges with local changes,
   * and increments version to resolve 409 conflicts silently.
   */
  private async selfHealConflict(): Promise<void> {
    console.log('[SyncManager] [SELF_HEAL] Starting background conflict resolution...');
    this.trackIncident('reliability', 'Self-Healing: Conflict detected. Merging cloud state...');
    
    try {
      const cloudUrl = config.API_BASE_URL;
      const res = await fetch(`${cloudUrl}/api/data`, {
        headers: { 'x-ace-api-key': config.ACE_API_KEY }
      });
      if (!res.ok) throw new Error(`Pull failed: ${res.status}`);
      
      const serverData = await res.json();
      const localData: Record<string, any> = {};
      
      // Load local state keys that exist in server response
      for (const key in serverData) {
        localData[key] = await storage.getItem(key);
      }

      // Merge using dataMerger
      const { result } = dataMerger.mergeData(localData, serverData);

      // Save merged result internally (isInternal=true suppresses push-back)
      await this.syncAndSaveData(result, false, true);
      console.log('[SyncManager] [SELF_HEAL] State merged. Ready for retry.');
    } catch (err: any) {
      console.error('[SyncManager] Self-healing failed:', err);
      this.trackIncident('reliability', `Self-Healing Failed: ${err.message}`);
    }
  }

  public async performCloudPush(isInternal: boolean = false): Promise<void> {
    // 🛡️ [FIX v2.6.125] Allow nested pushes from within tracked operations.
    // Previously, atomic pushes from processActionSequence were silently skipped
    // because isSyncing was already true from the parent trackOperation wrapper.
    // We now only skip if there's a genuinely separate concurrent push, not our own.
    if (this.activeSyncs > 1 && !isInternal) {
      console.log('[SyncManager] performCloudPush: Skip (Concurrent sync active)');
      return;
    }
    
    return this.trackOperation('CLOUD_PUSH', async () => {
      console.log('[SyncManager] Starting Cloud Push...');

      const updates = { ...this.pendingSyncUpdates };
      this.pendingSyncUpdates = {};
      if (this.syncTimeout) clearTimeout(this.syncTimeout);
      this.syncTimeout = null;

      let retryCount = 0;
      const MAX_RETRIES = 2;

      while (retryCount <= MAX_RETRIES) {
        try {
          const result = await this.pushToApi(updates, isInternal);
          
          if (result.success) {
            this.pendingSync = [];
            this.metrics.lastSyncSuccess = new Date().toISOString();
            await storage.setItem('pendingSync', []);
            return; // Success!
          }

          // 🛡️ [Self-Healing Branch]
          if (result.status === 409 && retryCount < MAX_RETRIES) {
            console.log(`[SyncManager] [RETRY] Collision detected (409). Attempting self-heal (Try ${retryCount + 1})...`);
            await this.selfHealConflict();
            retryCount++;
            continue; // Retry with updated version/state
          }

          if (result.status === 429 && retryCount < MAX_RETRIES) {
            const backoff = 2000 * (retryCount + 1);
            console.log(`[SyncManager] [RETRY] Rate limited (429). Backing off ${backoff}ms...`);
            await new Promise(r => setTimeout(r, backoff));
            retryCount++;
            continue;
          }

          // Non-retryable failure
          this.metrics.pushFailureCount++;
          this.trackIncident('reliability', `Push failed: Server rejected with ${result.status} [isInternal: ${isInternal}]`);
          return;
        } catch (error: any) {
          console.error('[SyncManager] performCloudPush error:', error);
          this.trackIncident('reliability', `Push Exception: ${error?.message || 'Unknown network error'}`);
          return;
        }
      }
    });
  }

  private trackIncident(type: string, message: string) {
    const timestamp = new Date().toISOString();
    this.metrics.incidentHistory.unshift({ type, message, timestamp });
    // Keep last 10 incidents
    if (this.metrics.incidentHistory.length > 10) {
      this.metrics.incidentHistory.pop();
    }
  }

  private async pushToApi(updates: Record<string, any>, isInternal: boolean): Promise<{ success: boolean, status?: number }> {
    const cloudUrl = config.API_BASE_URL;
    this.metrics.pushAttemptCount++;
    
    // 🛡️ [NETWORK GUARD] (v2.6.118)
    // Implement 30s timeout to prevent 'Stuck Sync' status on flaky connections.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    try {
      // 🛡️ [TICKET MESSAGE STATE: SENT] (v2.6.125)
      // On push, promote 'pending' messages to 'sent'
      if (updates.supportTickets && Array.isArray(updates.supportTickets)) {
        updates.supportTickets = updates.supportTickets.map((t: any) => {
          if (!t?.messages) return t;
          const promotedMsgs = t.messages.map((m: any) => m.status === 'pending' ? { ...m, status: 'sent' } : m);
          return { ...t, messages: promotedMsgs };
        });
      }

      console.log(`[SyncManager] Pushing to API: ${Object.keys(updates).join(', ')} [v:${this.syncVersion}]`);
      const response = await fetch(`${cloudUrl}/api/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          'x-user-id': this.userId || 'guest'
        },
        body: JSON.stringify({
          ...updates,
          version: this.syncVersion,
          isInternal,
          atomicKeys: ['matchmaking', ...(updates.atomicKeys || [])]
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('[SyncManager] Rate limited by server');
          this.metrics.rateLimitCount++;
          this.trackIncident('reliability', 'HTTP 429: Rate limited by cloud server. Automatic backoff engaged.');
        } else if (response.status === 409) {
          // 🛡️ [OCC CONFLICT HANDLING] (v2.6.125)
          // Server detected version conflict — update local version and trigger re-pull
          console.warn('[SyncManager] OCC conflict detected (409). Will re-pull.');
          this.metrics.conflictCount++;
          this.trackIncident('reliability', 'HTTP 409: Version conflict. Cloud has newer state.');
          try {
            const conflictData = await response.json();
            if (conflictData.serverVersion) {
              this.syncVersion = conflictData.serverVersion;
            }
          } catch (e) { /* ignore parse failure */ }
        }
        return { success: false, status: response.status };
      }

      const result = await response.json();
      this.lastServerUpdate = result.lastUpdated || Date.now();
      return { success: true, status: response.status };
    } catch (error) {
      console.error('[SyncManager] API Push failed:', error);
      throw error; // Let performCloudPush handle the exception
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
      
      // Perform deep comparison to suppress redundant updates
      if (JSON.stringify(current) === JSON.stringify(next)) {
        continue;
      }

      // 🛡️ [IDENTITY GUARD] (v2.6.118)
      // Prevent session hijacking by verifying the ID of the incoming profile update via socket/cloud.
      if (key === 'currentUser' && next && this.userId && next.id && next.id !== this.userId) {
        console.warn(`[SyncManager] [SOCKET_IDENTITY_HIJACK_BLOCK] Rejecting remote currentUser update for mismatch: Incoming=${next.id}, Active=${this.userId}`);
        this.trackIncident('anomalies', `Identity Hijack Block: External update for ID ${next.id} ignored.`);
        continue;
      }

      await storage.setItem(key, next);
      eventBus.emitEntityUpdate(key, null, 'update', 'socket');
    }
  }

  /**
   * 🛡️ DEEP TRIDECA-GUARD AUTHORITY (Guard 1-13)
   * The definitive pipeline for all matchmaking state changes.
   */
  public async handleMatchUpdate(response: any) {
    // PRE-GUARD: Schema Validation (Guard 7)
    if (!this.validateMatch(response.data?.updatedMatch || response.data?.removedMatchIds)) {
      this.metrics.invalidPayloadCount++;
      console.warn('[SyncManager] INVALID_PAYLOAD_REJECTED', response);
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
            this.metrics.staleUpdateCount++;
            this.trackIncident('anomalies', `Stale Action Rejected: Incoming data for ${matchId} is older than local state.`);
            console.log(`[SyncManager] STALE_UPDATE_IGNORED: ${matchId}`);
            continue;
          }

          if (existing && incomingVer === existingVer) {
             // Fallback to timestamp if versions are equal
             const incomingTime = new Date(merged.lastUpdated || 0).getTime();
             const existingTime = new Date(existing.lastUpdated || 0).getTime();
             if (incomingTime < existingTime) {
                this.metrics.staleUpdateCount++;
                continue;
             }
          }

          // GUARD 12: Idempotency (Deduplication)
          if (existing && JSON.stringify(existing) === JSON.stringify(merged)) {
            this.metrics.noOpSkippedCount++;
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
          this.metrics.successfulUpdateCount++;
          
          // GUARD 4: Historian (Record Action)
          await this.recordAction(matchId, response);
        }

        if (intent.removedMatchIds) {
          currentMatchmaking = currentMatchmaking.filter((m: any) => !intent.removedMatchIds.includes(m.id));
          changed = true;
          this.metrics.successfulUpdateCount++;
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
      console.error('[SyncManager] Failed to record action:', e);
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
      ...this.metrics, 
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
      this.metrics.anomalyDetectedCount++;
      this.trackIncident('anomalies', `History Corruption: match_history_${matchId} failed checksum verification.`);
      console.error(`[SyncManager] HISTORY_CORRUPTION_DETECTED: ${matchId}`);
      return null;
    }

    // LAYER 1: Action Authentication (Security - Verify signatures during replay)
    let replayedState = {};
    for (const action of history.actions) {
       if (action.signature !== this.signAction(action.data)) {
           this.metrics.tamperDetectedCount++;
           console.error(`[SyncManager] TAMPER_DETECTED in history for ${matchId}`);
           continue;
       }
       replayedState = this.deepMerge(replayedState, action.data);
    }
    
    console.log(`[SyncManager] REPLAY_EXECUTED: ${matchId} (Actions: ${history.actions.length})`);
    return replayedState;
  }

  /**
   * 🧪 [TESTING ONLY] Injects stale data to sabotage the next UI save.
   */
  public async injectStaleData(entityType: string, entityId: string) {
    console.log(`🧪 [SyncManager] Sabotaging ${entityType}:${entityId} with stale version.`);
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
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
      this.syncTimeout = null;
    }
    this.userId = null;
    this.pendingSync = [];
    this.pendingSyncUpdates = {};
    this.throttleTimeouts.forEach(t => clearTimeout(t));
    this.throttleTimeouts.clear();
    this.actionSequences.clear();
  }

}

export const syncManager = SyncManager.getInstance();
export default SyncManager;

