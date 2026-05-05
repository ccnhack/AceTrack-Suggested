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
  private isAuthMuted: boolean = false;
  private userId: string | null = null;
  private userToken: string | null = null;
  private userRole: string | null = null;
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

  // 🏗️ Phase A-2: Fast structural hash for deep comparison.
  // Replaces O(n) JSON.stringify equality checks with a bounded hash.
  // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Increased cap to 50K and mix in total length to prevent silent collisions
  private fastHash(obj: any): number {
    const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
    let hash = 0;
    const len = Math.min(str.length, 50000);
    for (let i = 0; i < len; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i) | 0;
    }
    // Mix in the total length to prevent collisions between identical prefixes of different lengths
    hash = ((hash << 5) - hash) + str.length | 0;
    return hash;
  }

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
    if (this.userId && this.socket) {
      this.setupSocket(this.userId, this.userRole || 'user');
    }
  }

  /**
   * 🛡️ [SYNC_RECOVERY] (v2.6.315)
   * Force a socket reconnection to the current config.API_BASE_URL.
   * Useful when switching between Local and Cloud modes in Dev.
   */
  public reconnect() {
    if (this.userId) {
      console.log(`[SyncManager] Reconnecting to: ${config.API_BASE_URL}`);
      this.setupSocket(this.userId, this.userRole || 'user');
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

        console.log(`[SyncManager] Initializing for user: ${userId} (Cloud v${this.syncVersion})`);
        
        // 🛡️ [DIAGNOSTICS] Stabilize hardware ID for Admin Hub correlation
        this.hardwareId = await storage.getItem('acetrack_device_id');

        // 1. Hydrate pending sync state
        const savedPending = await storage.getItem('pendingSync');
        if (Array.isArray(savedPending)) {
          this.pendingSync = savedPending;
        }

        const user = await storage.getItem('currentUser');
        const role = forceRole || user?.role || 'user';
        this.userRole = role;

        // 2. Setup Socket.io
        this.setupSocket(userId, role);

        // 3. Inform system that initialization is complete
        // 🛡️ [JWT HYDRATION] (v2.6.192) Ensure token is available for immediate polling
        // 🛡️ [HTTP_ONLY_TRANSITION] (v2.6.258): Skip local token hydration on web
        if (Platform.OS !== 'web') {
          const savedToken = await storage.getItem('userToken');
          if (savedToken) {
            console.log(`[SyncManager] Proactively hydrated token for ${userId}`);
            this.userToken = savedToken;
            this.isAuthMuted = false;
          }
        }

        eventBus.emit('INITIALIZATION_COMPLETE', { userId });
      } catch (e: any) {
        console.error('[SyncManager] FATAL_INIT_CRASH:', e);
        logger.logAction('SYNC_MANAGER_INIT_FATAL', { error: e.message, stack: e.stack });
        // Attempt emergency status update via REST
        this.reportEmergencyStatus(userId, e.message);
      }
    })();

    return this.initPromise;
  }

  private setupSocket(userId: string, role?: string) {
    if (this.socket) {
        this.socket.disconnect();
    }

    const getDeviceName = () => {
      if (Platform.OS !== 'web') return Platform.OS;
      if (typeof navigator === 'undefined') return 'Browser';
      const ua = navigator.userAgent;
      if (ua.includes('Chrome') && !ua.includes('Edg')) return 'Chrome';
      if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
      if (ua.includes('Firefox')) return 'Firefox';
      if (ua.includes('Edg')) return 'Edge';
      return 'Browser';
    };

    this.socket = io(config.API_BASE_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      query: { userId, role: role || 'user', deviceName: getDeviceName() },
      auth: { 
        token: this.userToken || config.PUBLIC_APP_ID,
        // 🛡️ [WEB_SOCKET_HARDENING] (v2.6.259)
        // Browsers often block custom headers ('extraHeaders') on WebSockets.
        // We mirror the API key in the auth object to ensure handshake success.
        apiKey: config.PUBLIC_APP_ID 
      },
      // 🛡️ [COOKIE_SOCKET_SUPPORT] (v2.6.258)
      withCredentials: true,
      extraHeaders: { 
        'x-ace-api-key': config.PUBLIC_APP_ID,
        ...(Platform.OS !== 'web' && this.userToken ? { 'Authorization': `Bearer ${this.userToken}` } : {})
      }
    });

    try {
      this.socket.on('connect', () => {
        console.log('[SyncManager] Socket connected');
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: true, source: 'socket' });
      });

      this.socket.on('disconnect', () => {
        console.log('[SyncManager] Socket disconnected');
        eventBus.emit('SYNC_STATUS_CHANGED', { isOnline: false, source: 'socket' });
      });

      this.socket.on('connect_error', (err: any) => {
        console.error(`[SyncManager] Socket connection error: ${err.message}`);
      });

      this.socket.on('data_updated', async (data) => {
        try {
          if (data?.lastSocketId && this.socket?.id && data.lastSocketId === this.socket.id) {
            console.log('[SyncManager] Skipping self-originated socket update.');
            return;
          }
          console.log('[SyncManager] Received data_updated via socket');
          await this.handleRemoteUpdate(data.updates);
        } catch (e: any) {
          console.error('[SyncManager] socket:data_updated error:', e);
        }
      });

      // 🛡️ [DIAGNOSTICS] ADMIN PING RESPONDER (v2.6.167)
      this.socket.on('admin_ping_device_relay', async (data: any) => {
        try {
          if (data.targetUserId === this.userId && this.socket) {
            if (this.initPromise) await this.initPromise;
            
            console.log('[SyncManager] Received Admin Ping — Replying with Pong');
            const deviceId = this.hardwareId || await storage.getItem('acetrack_device_id') || Constants.sessionId || 'mobile_client';
            this.socket.emit('device_pong', {
              targetUserId: this.userId,
              deviceId,
              deviceName: Constants.deviceName || Platform.OS,
              appVersion: Constants.expoConfig?.version || config.APP_VERSION || '2.6.258',
              timestamp: Date.now()
            });
          }
        } catch (e: any) {
          console.error('[SyncManager] socket:admin_ping error:', e);
        }
      });

      // 🛡️ [DIAGNOSTICS] FORCE UPLOAD RESPONDER
      this.socket.on('force_upload_diagnostics', async (data: any) => {
        try {
          if (data.targetUserId === this.userId) {
             console.log('[SyncManager] Received Force Upload Request');
             logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', {
               adminId: data.adminId,
               targetUserId: data.targetUserId,
               myId: this.userId,
               targetDeviceId: data.targetDeviceId,
               myDeviceId: this.hardwareId
             });
             
             const user = await storage.getItem('currentUser');
             const label = this.userId || user?.name || 'Guest';
             const deviceId = this.hardwareId || await storage.getItem('acetrack_device_id') || 'unknown';
             const allLogs = logger.getLogs();
             const headers = {
               'Content-Type': 'application/json',
               'x-ace-api-key': config.ACE_API_KEY
             };
             if (this.userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${this.userToken}`;

             await fetch(`${config.API_BASE_URL}${config.getEndpoint('DIAGNOSTICS')}`, {
               method: 'POST',
               headers,
               credentials: 'include',
               body: JSON.stringify({
                 username: label,
                 logs: allLogs,
                 prefix: 'admin_requested',
                 deviceId
               })
             });
             logger.logAction('ADMIN_DIAGNOSTICS_PULL_SUCCESS', { count: allLogs.length });
          }
        } catch (e: any) {
          console.error('[SyncManager] Remote diagnostic upload failed:', e);
          logger.logAction('ADMIN_DIAGNOSTICS_PULL_FAILED', { error: e.message });
        }
      });
    } catch (e: any) {
      console.error('[SyncManager] setupSocket listeners failed:', e);
    }
  }

  private async reportEmergencyStatus(userId: string, error: string) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.ACE_API_KEY
      };
      if (this.userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${this.userToken}`;

      await fetch(`${config.API_BASE_URL}${config.getEndpoint('DIAGNOSTICS')}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          username: userId,
          logs: [{ 
            timestamp: new Date().toISOString(), 
            level: 'ERROR', 
            type: 'SYNC_FATAL', 
            message: `SYNC_INIT_CRASH: ${error}`
          }],
          prefix: 'crash_report',
          deviceId: this.hardwareId || 'unknown'
        })
      });
    } catch (e) {
      // Last resort failed, nothing we can do
    }
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

    return this.trackOperation(labelBase, async () => {
      // 🛡️ [BACKPRESSURE GUARD] (v2.6.125)
      const qLen = storage.getQueueLength();
      if (qLen > 20) {
        this.trackIncident('backpressure', `High Backpressure: ${qLen} items in queue. System automatically throttling.`);
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
            console.warn(`[SyncManager] [IDENTITY_HIJACK_BLOCK] Rejecting currentUser update: mismatch.`);
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
          console.warn('[SyncManager] Blocking attempt to overwrite currentUser with null.');
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
      console.log(`[SyncManager] [LOCAL_SAVE] Executing Multi-Set for ${Object.keys(workingUpdates).length} keys...`);
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
  private startWatchdog(label: string, customThreshold?: number) {
    if (this.syncWatchdog) clearTimeout(this.syncWatchdog);
    const timeout = customThreshold || 35000;
    this.syncWatchdog = setTimeout(() => {
      // 🛡️ [GUEST GUARD] (v2.6.192)
      if (!this.userId || this.userId === 'guest' || this.isAuthMuted) {
        if (this.isAuthMuted) console.log('[SyncManager] performCloudPush: Auth muted due to previous 401.');
        return false;
      }
      if (this.activeSyncs > 0) {
        console.warn(`[SyncManager] 🛡️ WATCHDOG TRIGGERED: Forcing sync reset after ${timeout/1000}s hang [STUCK_OP: ${label}]`);
        this.activeSyncs = 0;
        this.emitSyncStatus();
      }
    }, timeout);
  }

  /**
   * Centralized sync tracking wrapper.
   * Ensures activeSyncs is always decremented and UI is updated.
   */
  public async trackOperation<T>(label: string, operation: () => Promise<T>, customThreshold?: number): Promise<T> {
    await this.updateSyncStatus(true);
    this.startWatchdog(label, customThreshold);
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
    return this.trackOperation('CLOUD_SELF_HEAL', async () => {
      console.log('[SyncManager] [SELF_HEAL] Starting background conflict resolution...');
      this.trackIncident('reliability', 'Self-Healing: Conflict detected. Merging cloud state...');
      
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
        const { result } = dataMerger.mergeData(localData, serverData);

        // Save merged result internally (isInternal=true suppresses push-back)
        await this.syncAndSaveData(result, false, true);
        console.log('[SyncManager] [SELF_HEAL] State merged. Ready for retry.');
      } catch (err: any) {
        clearTimeout(timeoutId);
        console.error('[SyncManager] Self-healing failed:', err);
        this.trackIncident('reliability', `Self-Healing Failed: ${err.message}`);
      }
    });
  }

  public async performCloudPush(isInternal: boolean = false): Promise<void> {
    // 🛡️ [GUEST GUARD] (v2.6.210)
    // More robust identity checking to prevent guest/device-only syncs from leaking.
    const actorId = String(this.userId || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId === 'null' || actorId === 'undefined' || actorId.startsWith('device_') || this.isAuthMuted) {
      if (this.isAuthMuted) console.log('[SyncManager] performCloudPush: Auth muted due to previous 401.');
      return;
    }
    
    if (this.activeSyncs > 1 && !isInternal) {
      console.log('[SyncManager] performCloudPush: Skip (Concurrent sync active)');
      return;
    }
    
    console.log('[SyncManager] Starting Cloud Push sequence...');

    const updates = { ...this.pendingSyncUpdates };
    this.pendingSyncUpdates = {};
    if (this.syncTimeout) clearTimeout(this.syncTimeout);
    this.syncTimeout = null;

    // 🛡️ [GHOST PUSH PROTECTION] (v2.6.159)
    // Prevent initiating cloud push if there is actually nothing to sync.
    if (Object.keys(updates).length === 0) {
      console.log('[SyncManager] performCloudPush: No updates found, skipping network sequence.');
      return;
    }

    console.log(`[SyncManager] [${new Date().toISOString()}] Starting Cloud Push sequence...`);

    let retryCount = 0;
    const MAX_RETRIES = 2;

    while (retryCount <= MAX_RETRIES) {
      // 🛡️ [GRANULAR TRACKING] (v2.6.158)
      // Wrap each discrete attempt in a separate trackOperation so the watchdog
      // resets its 30s timer for every network roundtrip.
      const label = `CLOUD_PUSH_ATTEMPT_${retryCount + 1}${isInternal ? '_INTERNAL' : ''}`;
      
      const success = await this.trackOperation(label, async () => {
        try {
          const result = await this.pushToApi(updates, isInternal);
          
          if (result.success) {
            this.pendingSync = [];
            this.metrics.lastSyncSuccess = new Date().toISOString();
            await storage.setItem('pendingSync', []);
            return true; 
          }

          if (result.status === 409 && retryCount < MAX_RETRIES) {
            console.log(`[SyncManager] [CONFLICT] Attempt ${retryCount + 1} failed. Self-healing...`);
            await this.selfHealConflict();
            return 'RETRY_CONFLICT';
          }

          if (result.status === 429 && retryCount < MAX_RETRIES) {
            return 'RETRY_RATE_LIMIT';
          }

          this.metrics.pushFailureCount++;
          this.trackIncident('reliability', `Push failed: Server rejected with ${result.status}`);
          return false;
        } catch (error: any) {
          console.error('[SyncManager] performCloudPush error:', error);
          this.trackIncident('reliability', `Push Exception: ${error?.message}`);
          return false;
        }
      });

      if (success === true) return;
      if (success === false) return; // Terminal failure

      // Handle Retries
      retryCount++;
      if (success === 'RETRY_RATE_LIMIT') {
        const backoff = 2000 * retryCount;
        console.log(`[SyncManager] [RETRY] Backing off ${backoff}ms...`);
        // 🛡️ [IDLE EXCLUSION] Sleep happens OUTSIDE trackOperation to avoid watchdog triggers
        await new Promise(r => setTimeout(r, backoff));
      }
      // For RETRY_CONFLICT, we continue immediately after self-healing
    }
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
    console.log(`[SyncManager] pushToApi: Sending to ${cloudUrl}${config.getEndpoint('DATA_SAVE')}`);
    this.metrics.pushAttemptCount++;

    // 🛡️ [GUEST PUSH GUARD] (v2.6.210)
    // Prevent unauthenticated or guest sessions from attempting to persist local cache to cloud.
    // This suppresses noisy "UNAUTHORIZED_ACCESS_BLOCKED" alerts on the landing page.
    const actorId = String(this.userId || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId === 'null' || actorId === 'undefined' || actorId.startsWith('device_') || this.isAuthMuted) {
       console.log(`[SyncManager] 🛡️ Push Suppressed: Identity is ${this.userId || 'missing'}${this.isAuthMuted ? ' (Auth Muted)' : ''}. Skipping Cloud Sync.`);
       return { success: false, status: 403 };
    }
    
    // 🛡️ [NETWORK GUARD] (v2.6.159) Hardened
    // Implement 20s timeout (decreased from 30s) to ensure network failure 
    // happens BEFORE the watchdog triggers (35s).
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

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

      console.log(`[SyncManager] [${new Date().toISOString()}] Pushing to API: ${Object.keys(updates).join(', ')} [v:${this.syncVersion}]`);
      const headers = {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.ACE_API_KEY,
        'x-user-id': this.userId || 'guest'
      };
      if (this.userToken && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${this.userToken}`;

      const response = await fetch(`${cloudUrl}${config.getEndpoint('DATA_SAVE')}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...updates,
          version: this.syncVersion,
          isInternal,
          atomicKeys: [...(updates.atomicKeys || [])]
        }),
        credentials: 'include',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401) {
          console.warn('[SyncManager] 🛑 Terminal Auth Failure (401). Muting sync.');
          this.isAuthMuted = true;
          eventBus.emit('AUTH_FAILURE', { status: 401, endpoint: `${cloudUrl}${config.getEndpoint('DATA_SAVE')}` });
        }
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
      
      // 🏗️ Phase A-2: Fast hash comparison instead of full JSON.stringify
      if (this.fastHash(current) === this.fastHash(next)) {
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
          // 🏗️ Phase A-2: Fast hash comparison instead of full JSON.stringify
          if (existing && this.fastHash(existing) === this.fastHash(merged)) {
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

