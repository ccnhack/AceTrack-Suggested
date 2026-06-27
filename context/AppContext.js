import React, { createContext, useContext, useRef, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import SyncOrchestrator from '../services/sync/SyncOrchestrator';
import { eventBus } from '../services/EventBus';
import Constants from 'expo-constants';
import logger from '../utils/logger';
import config from '../config';
import storage from '../utils/storage';

import { useAppStore } from '../stores';

let Notifications = null;
let registerForPushNotificationsAsync = null;
let sendTokenToBackend = null;

if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  const notifService = require('../services/notificationService');
  registerForPushNotificationsAsync = notifService.registerForPushNotificationsAsync;
  sendTokenToBackend = notifService.sendTokenToBackend;
} else {
  const Ionicons = require('@expo/vector-icons/Ionicons').default;
  const Font = require('expo-font');
  globalThis.IoniconsFont = Ionicons.font;
  globalThis.ExpoFont = Font;
}

const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children, initialVersion }) => {
  // Bind state from Zustand store
  const isLoading = useAppStore(state => state.isLoading);
  const isInitialized = useAppStore(state => state.isInitialized);
  const isUploadingLogs = useAppStore(state => state.isUploadingLogs);
  const appVersion = useAppStore(state => state.appVersion);
  const latestAppVersion = useAppStore(state => state.latestAppVersion);
  const showForceUpdate = useAppStore(state => state.showForceUpdate);
  const showNotifications = useAppStore(state => state.showNotifications);

  const [pushStatus, setPushStatus] = useState({ status: 'idle', token: null, error: null });
  
  const localDeviceIdRef = useRef(null);
  const isStartupCompleteRef = useRef(false);
  const notificationResponseSubRef = useRef(null);
  const notificationReceivedSubRef = useRef(null);
  const navigationRef = useRef(null);

  useEffect(() => {
    useAppStore.setState({ appVersion: initialVersion, latestAppVersion: initialVersion });
  }, [initialVersion]);

  useEffect(() => {
    const startup = async () => {
      try {
        await logger.initialize();
        logger.enableInterception();
        
        const cloudUrl = config.API_BASE_URL || 'https://acetrack-suggested.onrender.com';
        logger.checkAndUploadCrash(cloudUrl, config.PUBLIC_APP_ID);
        
        const syncOrchestrator = SyncOrchestrator.getInstance();
        let hardwareId = await syncOrchestrator.getSystemFlag('acetrack_device_id');
        if (!hardwareId) {
          hardwareId = (Constants.deviceName || Platform.OS || 'device').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6);
          await syncOrchestrator.setSystemFlag('acetrack_device_id', hardwareId);
        }
        localDeviceIdRef.current = hardwareId;

        if (Platform.OS === 'web' && globalThis.ExpoFont && globalThis.IoniconsFont) {
          try {
            await globalThis.ExpoFont.loadAsync(globalThis.IoniconsFont);
            console.log('🌐 Web fonts loaded successfully');
          } catch (fontErr) {
            console.error('❌ Failed to load web fonts:', fontErr);
          }
        }
        
        if (Platform.OS !== 'web' && Notifications) {
          notificationResponseSubRef.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            console.log('🔔 Notification Response Received:', data);
            logger.logAction('NOTIFICATION_CLICKED', { data });
            eventBus.emit('NOTIFICATION_DEEP_LINK', { data });
          });

          notificationReceivedSubRef.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('🔔 Foreground Notification Received');
            logger.logAction('NOTIFICATION_FOREGROUND_RECEIVED', { 
              id: notification.request.identifier,
              title: notification.request.content.title 
            });
            eventBus.emit('NOTIFICATION_FOREGROUND_PULL', {});
          });
        }

        isStartupCompleteRef.current = true;
        useAppStore.setState({ isInitialized: true });
      } catch (e) {
        console.error("❌ Critical AppProvider Startup Error:", e);
        logger.logAction('CRITICAL_STARTUP_ERROR', { error: e.message });
      } finally {
        useAppStore.setState({ isLoading: false });
      }
    };

    startup();

    return () => {
      if (notificationResponseSubRef.current) notificationResponseSubRef.current.remove();
      if (notificationReceivedSubRef.current) notificationReceivedSubRef.current.remove();
    };
  }, []);

  useEffect(() => {
    if (!isInitialized || Platform.OS === 'web' || !registerForPushNotificationsAsync) return;

    const registerPush = async () => {
      setPushStatus(prev => ({ ...prev, status: 'requesting' }));
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          setPushStatus({ status: 'success', token, error: null });
          await storage.setItem('push_token', token);
          console.log(`📡 [NOTIFY_DEBUG] Push token acquired: ${token.substring(0, 20)}...`);
          
          const syncOrchestrator = SyncOrchestrator.getInstance();
          const currentUser = await syncOrchestrator.getSystemFlag('currentUser');
          if (currentUser?.id && sendTokenToBackend) {
            console.log(`📡 [NOTIFY_DEBUG] Syncing push token for ${currentUser.id}`);
            sendTokenToBackend(currentUser.id, token);
          }
        } else {
          setPushStatus({ status: 'failed', token: null, error: 'Token generation failed' });
        }
      } catch (err) {
        console.error('❌ [NOTIFY_DEBUG] Push Registration Exception:', err);
        setPushStatus({ status: 'error', token: null, error: err.message });
      }
    };

    registerPush();
  }, [isInitialized]);

  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      if (e.payload.entity === 'currentUser') {
        const syncOrchestrator = SyncOrchestrator.getInstance();
        const user = await syncOrchestrator.getSystemFlag('currentUser');
        if (user?.id && localDeviceIdRef.current) {
          const cloudUrl = config.API_BASE_URL || 'https://acetrack-suggested.onrender.com';
          logger.initAutoFlush(
            cloudUrl,
            config.PUBLIC_APP_ID,
            user.name || user.id,
            localDeviceIdRef.current
          );
        }
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = eventBus.subscribe('VERSION_OBSOLETE', (e) => {
      if (e.payload.latestVersion) {
        useAppStore.setState({ 
          latestAppVersion: e.payload.latestVersion,
          showForceUpdate: true 
        });
      }
    });
    return unsub;
  }, []);

  const value = {
    isLoading,
    setIsLoading: (v) => useAppStore.setState({ isLoading: v }),
    isInitialized,
    setIsInitialized: (v) => useAppStore.setState({ isInitialized: v }),
    isUploadingLogs,
    setIsUploadingLogs: (v) => useAppStore.setState({ isUploadingLogs: v }),
    pushStatus,
    setPushStatus,
    appVersion,
    latestAppVersion,
    setLatestAppVersion: (v) => useAppStore.setState({ latestAppVersion: v }),
    showForceUpdate,
    setShowForceUpdate: (v) => useAppStore.setState({ showForceUpdate: v }),
    localDeviceIdRef,
    isStartupCompleteRef,
    navigationRef,
    showNotifications,
    setShowNotifications: (v) => useAppStore.setState({ showNotifications: v })
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
