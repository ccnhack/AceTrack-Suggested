import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { Platform } from 'react-native';
import SyncManager from '../services/SyncManager';
import { eventBus } from '../services/EventBus';
import Constants from 'expo-constants';
import logger from '../utils/logger';
import config from '../config';
import storage from '../utils/storage';

// 🛡️ [PUSH NOTIFICATIONS] (v2.6.121) Conditional imports for native platforms only
let Notifications = null;
let registerForPushNotificationsAsync = null;
let sendTokenToBackend = null;

if (Platform.OS !== 'web') {
  Notifications = require('expo-notifications');
  const notifService = require('../services/notificationService');
  registerForPushNotificationsAsync = notifService.registerForPushNotificationsAsync;
  sendTokenToBackend = notifService.sendTokenToBackend;
}

const AppContext = createContext(null);

export const useApp = () => useContext(AppContext);

export const AppProvider = ({ children, initialVersion }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isUploadingLogs, setIsUploadingLogs] = useState(false);
  const [pushStatus, setPushStatus] = useState({ status: 'idle', token: null, error: null });
  const [appVersion, setAppVersion] = useState(initialVersion);
  const [latestAppVersion, setLatestAppVersion] = useState(initialVersion);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  
  const localDeviceIdRef = useRef(null);
  const isStartupCompleteRef = useRef(false);
  const notificationResponseSubRef = useRef(null);
  const notificationReceivedSubRef = useRef(null);
  const navigationRef = useRef(null); // Populated by App.js via context

  // Initialization Logic
  useEffect(() => {
    const startup = async () => {
      try {
        await logger.initialize();
        logger.enableInterception();
        
        const cloudUrl = 'https://acetrack-suggested.onrender.com';
        logger.checkAndUploadCrash(cloudUrl, config.ACE_API_KEY);
        
        const syncManager = SyncManager.getInstance();
        let hardwareId = await syncManager.getSystemFlag('acetrack_device_id');
        if (!hardwareId) {
          hardwareId = (Constants.deviceName || Platform.OS || 'device').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now() + '_' + Math.random().toString(16).slice(2, 6);
          await syncManager.setSystemFlag('acetrack_device_id', hardwareId);
        }
        localDeviceIdRef.current = hardwareId;
        
        // 🛡️ [NOTIFICATION LISTENERS] (v2.6.121) — deep-link on tap, foreground refresh
        if (Platform.OS !== 'web' && Notifications) {
          // 1. Background/killed notification click → navigate to relevant tab
          notificationResponseSubRef.current = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data;
            console.log('🔔 Notification Response Received:', data);
            logger.logAction('NOTIFICATION_CLICKED', { data });
            
            // Deep-link navigation handled via EventBus since we don't have navigationRef here
            eventBus.emit('NOTIFICATION_DEEP_LINK', { data });
          });

          // 2. Foreground notification received → trigger silent data pull
          notificationReceivedSubRef.current = Notifications.addNotificationReceivedListener(notification => {
            console.log('🔔 Foreground Notification Received');
            logger.logAction('NOTIFICATION_FOREGROUND_RECEIVED', { 
              id: notification.request.identifier,
              title: notification.request.content.title 
            });
            // Emit to trigger data refresh
            eventBus.emit('NOTIFICATION_FOREGROUND_PULL', {});
          });
        }

        isStartupCompleteRef.current = true;
        setIsInitialized(true);
      } catch (e) {
        console.error("❌ Critical AppProvider Startup Error:", e);
        logger.logAction('CRITICAL_STARTUP_ERROR', { error: e.message });
      } finally {
        setIsLoading(false);
      }
    };

    startup();

    return () => {
      if (notificationResponseSubRef.current) notificationResponseSubRef.current.remove();
      if (notificationReceivedSubRef.current) notificationReceivedSubRef.current.remove();
    };
  }, []);

  // 🛡️ [PUSH NOTIFICATION REGISTRATION] (v2.6.121)
  // Register for push token AFTER initialization is complete and user is hydrated
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
          
          // Try to sync with backend if user is known
          const syncManager = SyncManager.getInstance();
          const currentUser = await syncManager.getSystemFlag('currentUser');
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

  // 🛡️ [LOGGER AUTO-FLUSH] (v2.6.121)
  // Start auto-flushing diagnostic logs once user is known
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      if (e.payload.entity === 'currentUser') {
        const syncManager = SyncManager.getInstance();
        const user = await syncManager.getSystemFlag('currentUser');
        if (user?.id && localDeviceIdRef.current) {
          const cloudUrl = 'https://acetrack-suggested.onrender.com';
          logger.initAutoFlush(
            cloudUrl,
            config.ACE_API_KEY,
            user.name || user.id,
            localDeviceIdRef.current
          );
        }
      }
    });
    return unsub;
  }, []);

  // 🛡️ [VERSION OBSOLETE LISTENER] (v2.6.121)
  // Listen for version obsolete events from SyncContext's checkForUpdates
  useEffect(() => {
    const unsub = eventBus.subscribe('VERSION_OBSOLETE', (e) => {
      if (e.payload.latestVersion) {
        setLatestAppVersion(e.payload.latestVersion);
        setShowForceUpdate(true);
      }
    });
    return unsub;
  }, []);

  const value = {
    isLoading,
    setIsLoading,
    isInitialized,
    setIsInitialized,
    isUploadingLogs,
    setIsUploadingLogs,
    pushStatus,
    setPushStatus,
    appVersion,
    latestAppVersion,
    setLatestAppVersion,
    showForceUpdate,
    setShowForceUpdate,
    localDeviceIdRef,
    isStartupCompleteRef,
    navigationRef,
    showNotifications,
    setShowNotifications
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};
