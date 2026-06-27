import React, { createContext, useContext, useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import { calculateServerOffset } from '../utils/tournamentUtils';
import config from '../config';
import logger from '../utils/logger';

import { useSyncStore } from '../stores';

const SyncContext = createContext(null);

export const useSync = () => useContext(SyncContext);

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
  // Bind state from Zustand store
  const isCloudOnline = useSyncStore(state => state.isCloudOnline);
  const isSyncing = useSyncStore(state => state.isSyncing);
  const lastSyncTime = useSyncStore(state => state.lastSyncTime);
  const isUsingCloud = useSyncStore(state => state.isUsingCloud);
  const serverClockOffset = useSyncStore(state => state.serverClockOffset);
  const isFullyConnected = useSyncStore(state => state.isFullyConnected);
  const isNotificationsEnabled = useSyncStore(state => state.isNotificationsEnabled);

  // We keep metrics local to context to avoid excessive Zustand updates for simple performance traces
  const [metrics, setMetrics] = useState(syncOrchestrator.getMetrics());
  const socketRef = useRef(syncOrchestrator.getSocket());
  const activeApiUrl = useMemo(() => syncOrchestrator.getActiveApiUrl(), []);
  const lastUpdateCheckRef = useRef(0);
  const isStartupCompleteRef = useRef(false);

  const refreshMetrics = useCallback(() => {
    setMetrics(syncOrchestrator.getMetrics());
  }, []);

  useEffect(() => {
    const unsubConn = eventBus.subscribe('CONNECTIVITY_CHANGED', (e) => {
      useSyncStore.setState({ isFullyConnected: e.payload.isOnline });
    });

    const unsubSync = eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
      if (e.payload.isOnline !== undefined) useSyncStore.setState({ isCloudOnline: e.payload.isOnline });
      if (e.payload.isSyncing !== undefined) useSyncStore.setState({ isSyncing: e.payload.isSyncing });
      socketRef.current = syncOrchestrator.getSocket();
    });

    socketRef.current = syncOrchestrator.getSocket();

    return () => {
      unsubConn();
      unsubSync();
    };
  }, []);

  useEffect(() => {
    (async () => {
      await useSyncStore.getState().hydrate();

      const savedUsingCloud = await syncOrchestrator.getSystemFlag('isUsingCloud');
      if (savedUsingCloud !== null && __DEV__) {
        useSyncStore.setState({ isUsingCloud: savedUsingCloud });
        config.API_BASE_URL = savedUsingCloud ? config.CLOUD_API_URL : config.LOCAL_API_URL;
        console.log(`[SyncContext] Hydrated API URL Mode: ${savedUsingCloud ? 'CLOUD' : 'LOCAL'} (${config.API_BASE_URL})`);
      }
    })();
  }, []);

  useEffect(() => {
    if (isFullyConnected) {
      console.log('[SyncContext] Connectivity restored. Triggering proactive cloud push...');
      syncOrchestrator.performCloudPush();
    }
  }, [isFullyConnected]);

  const syncAndSaveData = useCallback(async (updates, isAtomic = false, isInternal = false) => {
    try {
      await syncOrchestrator.syncAndSaveData(updates, isAtomic, isInternal);
      useSyncStore.getState().setLastSyncTime(new Date().toLocaleTimeString());
      return true;
    } catch (error) {
      console.error('[SyncContext] Sync failed:', error);
      return false;
    }
  }, []);

  const loadDataRetryCountRef = useRef(0);
  const MAX_LOAD_RETRIES = 3;

  const loadData = useCallback(async (forceCloud = false, isSilent = false) => {
    const operation = async () => {
      try {
        await syncOrchestrator.flushPendingPush();
        console.log('[SyncContext] loadData: Delegating to SyncOrchestrator.forcePullData...');
        const data = await syncOrchestrator.forcePullData();

        if (data) {
          useSyncStore.setState({ isCloudOnline: true });
          console.log('[SyncContext] loadData: Success via orchestrator delta pipeline.');
          loadDataRetryCountRef.current = 0;
          return data;
        }
        return null;
      } catch (error) {
        if (error.name === 'AbortError') {
          console.warn('[SyncContext] loadData: TIMEOUT (30s reached)');
          if (loadDataRetryCountRef.current < MAX_LOAD_RETRIES) {
            loadDataRetryCountRef.current++;
            console.log(`[SyncContext] Retry ${loadDataRetryCountRef.current}/${MAX_LOAD_RETRIES} after timeout...`);
            setTimeout(() => {
              if (!syncOrchestrator.isSyncActive()) {
                loadData(true, true);
              }
            }, 2000 * loadDataRetryCountRef.current);
          } else {
            console.warn('[SyncContext] Max retries reached. Stopping retry loop.');
            loadDataRetryCountRef.current = 0;
          }
        } else {
          console.error('[SyncContext] loadData failed:', error);
        }
        return null;
      }
    };

    if (isSilent) {
      return operation();
    } else {
      return syncOrchestrator.trackOperation('LOAD_DATA_PULL', operation);
    }
  }, []);

  const checkForUpdates = useCallback(async (isForce = false) => {
    try {
      if (syncOrchestrator.isSyncActive()) return;

      const now = Date.now();
      const throttleWindow = 10000;
      if (!isForce && (now - lastUpdateCheckRef.current < throttleWindow)) {
        return;
      }
      lastUpdateCheckRef.current = now;

      const token = await syncOrchestrator.getSystemFlag('userToken');
      const headers = { 
        'x-ace-api-key': config.PUBLIC_APP_ID,
        'x-user-id': syncOrchestrator.getUserId() || 'guest'
      };
      if (token && Platform.OS !== 'web') headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`${config.API_BASE_URL}${config.getEndpoint('STATUS')}`, {
        headers,
        credentials: 'include'
      });

      if (response.status === 429) {
        console.log('[SyncContext] Rate limited on status check, skipping.');
        return;
      }

      useSyncStore.setState({ isCloudOnline: true });
      useSyncStore.getState().setLastSyncTime(new Date().toLocaleTimeString());

      const serverOffset = calculateServerOffset(response.headers.get('Date'));
      if (Math.abs(serverOffset) > 1000) {
        useSyncStore.getState().setServerClockOffset(serverOffset);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log('[SyncContext] Status check: Received non-JSON response (possible reboot).');
        logger.logAction('STATUS_CHECK_NON_JSON', { status: response.status });
        useSyncStore.setState({ isCloudOnline: false });
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
        const currentVersion = config.APP_VERSION;
        const obsolete = isVersionObsolete(currentVersion, status.latestAppVersion);
        console.log(`[SyncContext] Version Check: Local=${currentVersion}, Remote=${status.latestAppVersion}, Obsolete=${obsolete}`);
        if (obsolete) {
          logger.logAction('VERSION_OBSOLETE_TRIGGERED', { local: currentVersion, remote: status.latestAppVersion });
          eventBus.emit('VERSION_OBSOLETE', { latestVersion: status.latestAppVersion });
          return;
        }
      }

      const socket = syncOrchestrator.getSocket();
      if (status.lastSocketId && socket?.id && status.lastSocketId === socket.id) {
        return;
      }

      if (status.lastUpdated && status.lastUpdated !== syncOrchestrator.getLastServerUpdate()) {
        console.log('[SyncContext] New cloud data detected via status poll. Auto-refreshing...');
        logger.logAction('CLOUD_UPDATE_DETECTED', { lastUpdated: status.lastUpdated });
        
        const isStale = status.lastUpdated !== syncOrchestrator.getLastServerUpdate();
        if (isStale || isForce) {
          if (!syncOrchestrator.getUserId() || syncOrchestrator.getUserId() === 'guest') {
            console.log('[SyncContext] checkForUpdates: No active user, skipping data load.');
            return;
          }
          await loadData(isForce, isForce);
        }
      }
    } catch (error) {
      console.log('[SyncContext] Status check failed (silent):', error.message);
      logger.logAction('CHECK_UPDATES_FAILED', { error: error.message });
    }
  }, [loadData]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && !syncOrchestrator.isSyncActive()) {
        if (!isStartupCompleteRef.current) {
          console.log('[SyncContext] Foreground: Startup incomplete, skipping loadData.');
          logger.logAction('FOREGROUND_SKIP_STARTUP_INCOMPLETE');
          return;
        }
        console.log('[SyncContext] App returned to foreground, checking for cloud updates...');
        loadData(true, true);
      }
    });

    loadData(true).then(() => {
      isStartupCompleteRef.current = true;
    });

    return () => subscription.remove();
  }, [loadData]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!syncOrchestrator.isSyncActive() && isCloudOnline) {
        checkForUpdates(false);
      }
    }, 120000);
    return () => clearInterval(interval);
  }, [isCloudOnline, checkForUpdates]);

  const [hasActiveTickets, setHasActiveTickets] = useState(false);
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      if (e.payload.entity === 'supportTickets') {
        const tickets = await syncOrchestrator.getSystemFlag('supportTickets');
        setHasActiveTickets(Array.isArray(tickets) && tickets.length > 0);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (hasActiveTickets && isCloudOnline) {
      const pollTimer = setInterval(() => {
        if (!syncOrchestrator.isSyncActive()) {
          checkForUpdates(false);
        }
      }, 30000);
      return () => clearInterval(pollTimer);
    }
  }, [hasActiveTickets, isCloudOnline, checkForUpdates]);

  useEffect(() => {
    const unsub = eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
      if (e.payload.source === 'socket' && e.payload.isOnline) {
        setTimeout(() => checkForUpdates(false), 2000);
      }
    });
    return unsub;
  }, [checkForUpdates]);

  const onToggleCloud = useCallback(() => {
    useSyncStore.getState().toggleCloud();
    if (__DEV__) {
      config.API_BASE_URL = useSyncStore.getState().isUsingCloud ? config.CLOUD_API_URL : config.LOCAL_API_URL;
      syncOrchestrator.reconnect();
    }
    logger.logAction('CLOUD_MODE_TOGGLED', { nextValue: useSyncStore.getState().isUsingCloud, newUrl: config.API_BASE_URL });
  }, []);

  const onToggleNotifications = useCallback(() => {
    useSyncStore.getState().toggleNotifications();
    logger.logAction('NOTIFICATIONS_TOGGLED', { nextValue: useSyncStore.getState().isNotificationsEnabled });
    Alert.alert("Notifications", useSyncStore.getState().isNotificationsEnabled ? "Notifications enabled" : "Notifications muted");
  }, []);

  const onLogTrace = useCallback((...args) => {
    if (logger.logTrace) {
      logger.logTrace(...args);
    } else {
      logger.logAction('TRACE_FALLBACK', { args });
    }
  }, []);

  const setIsUsingCloud = useCallback((val) => {
    useSyncStore.setState({ isUsingCloud: val });
  }, []);

  const setServerClockOffset = useCallback((val) => {
    useSyncStore.getState().setServerClockOffset(val);
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
