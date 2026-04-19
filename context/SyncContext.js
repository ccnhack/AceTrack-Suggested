import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import { eventBus } from '../services/EventBus';
import { syncManager } from '../services/SyncManager';
import { calculateServerOffset } from '../utils/tournamentUtils';
import logger from '../utils/logger';
import config from '../config';

const SyncContext = createContext(null);

export const useSync = () => useContext(SyncContext);

// 🛡️ [VERSION CHECK] (v2.6.121) Version comparison logic from monolith
const isVersionObsolete = (local, remote) => {
  try {
    const [c1, c2, c3] = local.split('.').map(Number);
    const [l1, l2, l3] = remote.split('.').map(Number);
    if (c1 < l1) return true;
    if (c1 === l1 && c2 < l2) return true;
    if (c1 === l1 && c2 === l2 && c3 <= l3 - 2) return true;
    return false;
  } catch (e) {
    return false;
  }
};

export const SyncProvider = ({ children }) => {
  const [isCloudOnline, setIsCloudOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [isUsingCloud, setIsUsingCloud] = useState(true);
  const [serverClockOffset, setServerClockOffset] = useState(0);
  const [isFullyConnected, setIsFullyConnected] = useState(true);
  const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(true);
  const [metrics, setMetrics] = useState(syncManager.getMetrics());

  const socketRef = useRef(syncManager.getSocket());
  const activeApiUrl = useMemo(() => syncManager.getActiveApiUrl(), []);
  const lastUpdateCheckRef = useRef(0);
  const isStartupCompleteRef = useRef(false);

  // Sync socketRef with Manager instance
  useEffect(() => {
    socketRef.current = syncManager.getSocket();
  }, [isCloudOnline]); // Refresh when connection status changes

  // Function to refresh metrics
  const refreshMetrics = useCallback(() => {
    setMetrics(syncManager.getMetrics());
  }, []);

  // Connectivity and Sync listeners
  useEffect(() => {
    const unsubConn = eventBus.subscribe('CONNECTIVITY_CHANGED', (e) => {
      setIsFullyConnected(e.payload.isOnline);
    });

    const unsubSync = eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
      if (e.payload.isOnline !== undefined) setIsCloudOnline(e.payload.isOnline);
      if (e.payload.isSyncing !== undefined) setIsSyncing(e.payload.isSyncing);
    });

    return () => {
      unsubConn();
      unsubSync();
    };
  }, []);

  // Hydrate local flags
  useEffect(() => {
    (async () => {
      const savedNotifs = await syncManager.getSystemFlag('isNotificationsEnabled');
      if (savedNotifs !== null) setIsNotificationsEnabled(savedNotifs);
    })();
  }, []);

  // 📶 NETWORK RECOVERY: Proactively flush pending updates on reconnection
  useEffect(() => {
    if (isFullyConnected) {
      console.log('[SyncContext] Connectivity restored. Triggering proactive cloud push...');
      syncManager.performCloudPush();
    }
  }, [isFullyConnected]);

  /**
   * Centralized sync and save engine.
   */
  const syncAndSaveData = useCallback(async (updates, isAtomic = false, isInternal = false) => {
    try {
      await syncManager.syncAndSaveData(updates, isAtomic, isInternal);
      setLastSyncTime(new Date().toISOString());
      setIsCloudOnline(true);
      return true;
    } catch (error) {
      console.error('[SyncContext] Sync failed:', error);
      return false;
    }
  }, []);

  const loadData = useCallback(async (forceCloud = false, isSilent = false) => {
    const operation = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      try {
        // 🛡️ [FLUSH_BEFORE_PULL] (v2.6.121)
        // Ensure any pending local changes (especially deletions) reach
        // the server BEFORE we pull fresh data. Otherwise the cloud still
        // has the old items and they get written right back.
        await syncManager.flushPendingPush();

        console.log('[SyncContext] loadData: Starting fetch...');
        
        const cloudUrl = config.API_BASE_URL;
        const response = await fetch(`${cloudUrl}/api/data`, {
          headers: { 'x-ace-api-key': config.ACE_API_KEY },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) throw new Error(`Network response was not ok (${response.status})`);
        
        // 🛡️ [SERVER CLOCK OFFSET] (v2.6.121)
        // Calculate and persist drift between device and server clock
        const serverOffset = calculateServerOffset(response.headers.get('Date'));
        if (Math.abs(serverOffset) > 1000) {
          setServerClockOffset(serverOffset);
        }

        const data = await response.json();

        if (data) {
          setIsCloudOnline(true);
          console.log('[SyncContext] loadData: Success, syncing to local storage...');
          // Data from pull is 'Internal' by default to prevent echo-backs
          await syncManager.syncAndSaveData(data, false, true);
          return data;
        }
        return null;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          console.warn('[SyncContext] loadData: TIMEOUT (10s reached)');
          // 🛡️ [SYNC RECOVERY] (v2.6.121) Retry after transient timeout
          setTimeout(() => {
            if (!syncManager.isSyncActive()) {
              console.log('[SyncContext] Attempting recovery pull after timeout...');
              loadData(true, true);
            }
          }, 2000);
        } else {
          console.error('[SyncContext] loadData failed:', error);
        }
        return null;
      }
    };

    if (isSilent) {
      return operation();
    } else {
      return syncManager.trackOperation('LOAD_DATA_PULL', operation);
    }
  }, []);

  /**
   * 🛡️ [VERSION CHECK] (v2.6.121)
   * Polls /api/status to detect new cloud data and version obsolescence.
   * Migrated from monolith App.js checkForUpdates.
   */
  const checkForUpdates = useCallback(async (isForce = false) => {
    try {
      if (syncManager.isSyncActive()) return;

      const now = Date.now();
      const throttleWindow = 10000; // 10s minimum between checks
      if (!isForce && (now - lastUpdateCheckRef.current < throttleWindow)) {
        return;
      }
      lastUpdateCheckRef.current = now;

      const response = await fetch(`${config.API_BASE_URL}/api/status`, {
        headers: { 'x-ace-api-key': config.ACE_API_KEY }
      });

      if (response.status === 429) {
        console.log('[SyncContext] Rate limited on status check, skipping.');
        return;
      }

      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());

      // 🛡️ [SERVER CLOCK OFFSET]
      const serverOffset = calculateServerOffset(response.headers.get('Date'));
      if (Math.abs(serverOffset) > 1000) {
        setServerClockOffset(serverOffset);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log('[SyncContext] Status check: Received non-JSON response (possible reboot).');
        logger.logAction('STATUS_CHECK_NON_JSON', { status: response.status });
        setIsCloudOnline(false);
        return;
      }

      let status;
      try {
        status = await response.json();
      } catch (jsonErr) {
        console.warn(`[SyncContext] Status check JSON parse failed: ${jsonErr.message}`);
        return;
      }

      if (status && status.latestAppVersion) {
        const currentVersion = Constants?.expoConfig?.version || '2.6.117';
        const obsolete = isVersionObsolete(currentVersion, status.latestAppVersion);
        console.log(`[SyncContext] Version Check: Local=${currentVersion}, Remote=${status.latestAppVersion}, Obsolete=${obsolete}`);
        if (obsolete) {
          logger.logAction('VERSION_OBSOLETE_TRIGGERED', { local: currentVersion, remote: status.latestAppVersion });
          // Emit event for AppContext to show force update modal
          eventBus.emit('VERSION_OBSOLETE', { latestVersion: status.latestAppVersion });
          return;
        }
      }

      // Skip self-originated updates
      const socket = syncManager.getSocket();
      if (status.lastSocketId && socket?.id && status.lastSocketId === socket.id) {
        return;
      }

      if (status.lastUpdated && status.lastUpdated !== syncManager.getLastServerUpdate()) {
        console.log('[SyncContext] New cloud data detected via status poll. Auto-refreshing...');
        logger.logAction('CLOUD_UPDATE_DETECTED', { lastUpdated: status.lastUpdated });
        await loadData(isForce, isForce);
      }
    } catch (error) {
      console.log('[SyncContext] Status check failed (silent):', error.message);
      logger.logAction('CHECK_UPDATES_FAILED', { error: error.message });
    }
  }, [loadData]);

  // 🛡️ [APPSTATE FOREGROUND SYNC] (v2.6.121)
  // When app returns from background → foreground, pull fresh data
  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && !syncManager.isSyncActive()) {
        if (!isStartupCompleteRef.current) {
          console.log('[SyncContext] Foreground: Startup incomplete, skipping loadData.');
          logger.logAction('FOREGROUND_SKIP_STARTUP_INCOMPLETE');
          return;
        }
        console.log('[SyncContext] App returned to foreground, checking for cloud updates...');
        loadData(true, true);
      }
    });

    // Mark startup complete after initial load
    loadData(true).then(() => {
      isStartupCompleteRef.current = true;
    });

    return () => subscription.remove();
  }, [loadData]);

  // 🛡️ [PERIODIC VERSION CHECK] (v2.6.121) — 2 min background polling
  useEffect(() => {
    const interval = setInterval(() => {
      if (!syncManager.isSyncActive() && isCloudOnline) {
        checkForUpdates(false);
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [isCloudOnline, checkForUpdates]);

  // 🛡️ [HIGH-FREQ TICKET POLLING] (v2.6.121) — 10s when tickets exist
  // Subscribed via EventBus to detect support ticket presence
  const [hasActiveTickets, setHasActiveTickets] = useState(false);
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      if (e.payload.entity === 'supportTickets') {
        const tickets = await syncManager.getSystemFlag('supportTickets');
        setHasActiveTickets(Array.isArray(tickets) && tickets.length > 0);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (hasActiveTickets && isCloudOnline) {
      const pollTimer = setInterval(() => {
        if (!syncManager.isSyncActive()) {
          checkForUpdates(false);
        }
      }, 10000);
      return () => clearInterval(pollTimer);
    }
  }, [hasActiveTickets, isCloudOnline, checkForUpdates]);

  // Socket data_updated → checkForUpdates
  useEffect(() => {
    const unsub = eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
      if (e.payload.source === 'socket' && e.payload.isOnline) {
        // Socket reconnected — schedule a check
        setTimeout(() => checkForUpdates(false), 2000);
      }
    });
    return unsub;
  }, [checkForUpdates]);

  const onToggleCloud = useCallback(() => {
    const nextValue = !isUsingCloud;
    setIsUsingCloud(nextValue);
    syncManager.setSystemFlag('isUsingCloud', nextValue);
    logger.logAction('CLOUD_MODE_TOGGLED', { nextValue });
  }, [isUsingCloud]);

  const onToggleNotifications = useCallback(() => {
    const nextValue = !isNotificationsEnabled;
    setIsNotificationsEnabled(nextValue);
    syncManager.setSystemFlag('isNotificationsEnabled', nextValue);
    logger.logAction('NOTIFICATIONS_TOGGLED', { nextValue });
    Alert.alert("Notifications", nextValue ? "Notifications enabled" : "Notifications muted");
  }, [isNotificationsEnabled]);

  const onLogTrace = useCallback((...args) => {
    if (logger.logTrace) {
      logger.logTrace(...args);
    } else {
      logger.logAction('TRACE_FALLBACK', { args });
    }
  }, []);

  const value = {
    isCloudOnline,
    isSyncing,
    lastSyncTime,
    isUsingCloud,
    setIsUsingCloud,
    onToggleCloud,
    isNotificationsEnabled,
    onToggleNotifications,
    serverClockOffset,
    setServerClockOffset,
    isFullyConnected,
    syncAndSaveData,
    loadData,
    checkForUpdates,
    onManualSync: loadData,
    onLogTrace,
    metrics,
    refreshMetrics,
    socketRef,
    activeApiUrl
  };

  return (
    <SyncContext.Provider value={value}>
      {children}
    </SyncContext.Provider>
  );
};
