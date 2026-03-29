import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Alert, Platform, Modal, Image, KeyboardAvoidingView, ActivityIndicator, AppState, PanResponder, StatusBar 
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  CURRENT_PLAYER,
  OTHER_PLAYERS,
  TOURNAMENTS,
  MATCH_VIDEOS,
  SUPPORT_TICKETS,
  MATCHES
} from './mockData';
import storage from './utils/storage';
import AppNavigator from './navigation/AppNavigator';
import ChatBot from './components/ChatBot';
import * as Updates from 'expo-updates';
import logger from './utils/logger';
import { Ionicons } from '@expo/vector-icons';
import * as Font from 'expo-font';
import config from './config';
import { io } from 'socket.io-client';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingScreen from './screens/OnboardingScreen';
import LandingScreen from './screens/LandingScreen';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import { initializeFirebase } from './utils/firebaseAuth';
import { registerForPushNotificationsAsync, sendTokenToBackend } from './services/notificationService';
import * as Notifications from 'expo-notifications';

if (Platform.OS === 'web') {
  const iconFontStyles = `@font-face {
    src: url('https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/Ionicons.ttf');
    font-family: Ionicons;
  }`;
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(iconFontStyles));
  document.head.appendChild(style);
}

const APP_VERSION = "2.3.4";

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserRef = React.useRef(null);
  const [userRole, setUserRole] = useState(null);

  // App Data State
  const [players, setPlayers] = useState([CURRENT_PLAYER, ...OTHER_PLAYERS]);
  const [tournaments, setTournaments] = useState(TOURNAMENTS);
  const [matchVideos, setMatchVideos] = useState(MATCH_VIDEOS);
  const [supportTickets, setSupportTickets] = useState(SUPPORT_TICKETS);
  const [matches, setMatches] = useState(MATCHES);
  const [evaluations, setEvaluations] = useState([]);
  const [matchmaking, setMatchmaking] = useState([]);
  const [seenAdminActionIds, setSeenAdminActionIds] = useState(new Set());
  const [reschedulingFrom, setReschedulingFrom] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isCloudOnline, setIsCloudOnline] = useState(false);
  const [isUsingCloud, setIsUsingCloud] = useState(true); // Default to CLOUD for robustness
  const [lastSyncTime, setLastSyncTime] = useState(null);
  const [chatbotMessages, setChatbotMessages] = useState({}); // { [userId]: Array<{role, text}> }
  const [showVerificationPrompt, setShowVerificationPrompt] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingLogs, setIsUploadingLogs] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingInitialStep, setOnboardingInitialStep] = useState(0);
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [latestAppVersion, setLatestAppVersion] = useState(APP_VERSION);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const [isUpdatingFromModal, setIsUpdatingFromModal] = useState(false);
  const [viewingLanding, setViewingLanding] = useState(true); // Default to landing for new users
  const [showSignup, setShowSignup] = useState(false);
  
  const localDeviceIdRef = useRef(null);
  const [isProfileEditActive, setIsProfileEditActive] = useState(false); // New state to track if profile edit is open
  const [pendingSync, setPendingSync] = useState([]); // Keys that need to be pushed to cloud
  const [visitedAdminSubTabs, setVisitedAdminSubTabs] = useState(new Set());
  const isSyncingRef = useRef(false);
  const isStartupCompleteRef = useRef(false);
  const pendingSyncRef = React.useRef([]);
  const pendingUpdateCheckRef = React.useRef(false); // New: Track missed WebSocket signals
  const lastServerUpdateRef = React.useRef(null);
  const syncVersion = React.useRef(0);
  const navigationRef = React.useRef();
  const isUsingCloudRef = React.useRef(true);
  const socketRef = React.useRef(null);
  const playersRef = React.useRef(players);

  // Synchronous helper to update isSyncing state AND ref atomically
  const setSyncingState = (val) => {
    isSyncingRef.current = val; // Immediate ref update (no render delay)
    setIsSyncing(val);          // React state update (for UI)
  };

  useEffect(() => {
    pendingSyncRef.current = pendingSync;
  }, [pendingSync]);

  useEffect(() => {
    isUsingCloudRef.current = isUsingCloud;
  }, [isUsingCloud]);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  useEffect(() => {
    // 1. WebSocket: Connect to real-time events
    const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
    socketRef.current = io(activeApiUrl, {
      transports: ['websocket'],
      reconnection: true
    });

    socketRef.current.on('connect', () => {
      console.log("🔌 WebSocket Connected for real-time sync");
      logger.logAction('WS_CONNECTED', { socketId: socketRef.current?.id, url: activeApiUrl });
    });

    socketRef.current.on('disconnect', (reason) => {
      logger.logAction('WS_DISCONNECTED', { reason });
    });

    // CATCH-ALL: Log every single event the socket receives for diagnostics
    socketRef.current.onAny((eventName, ...args) => {
      logger.logAction('WS_EVENT_RECEIVED', { event: eventName, argsPreview: JSON.stringify(args).substring(0, 200) });
    });

    socketRef.current.on('data_updated', (payload) => {
      console.log("⚡ Real-time update received via WebSocket!", payload);
      logger.logAction('WS_UPDATE_RECEIVED', { payload });
      // If not currently pushing data themselves, pull the updates
      if (!isSyncingRef.current) {
        checkForUpdates(); 
      } else {
        console.log("⏳ Sync in progress, queueing update check...");
        pendingUpdateCheckRef.current = true;
        logger.logAction('WS_UPDATE_QUEUED');
      }
    });

    socketRef.current.on('force_upload_diagnostics', async (data) => {
      if (data.targetUserId === currentUserRef.current?.id) {
        logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', { adminId: data.adminId, targetUserId: data.targetUserId, myId: currentUserRef.current?.id, targetDeviceId: data.targetDeviceId, myDeviceId: localDeviceIdRef.current });
        
        // Let all active instances bypass strict hardware locking to guarantee log delivery
        if (data.targetDeviceId && data.targetDeviceId !== localDeviceIdRef.current) {
          logger.logAction('DIAGNOSTICS_PULL_DEVICE_MISMATCH_WARN', { targetDevice: data.targetDeviceId, localDevice: localDeviceIdRef.current });
          // NO RETURN ABORT HERE - Just warn and proceed uploading logs anyway!
        }

        const logs = logger.getLogs();
        try {
          const cloudUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
          await fetch(`${cloudUrl}/api/diagnostics`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-ace-api-key': config.ACE_API_KEY
            },
            body: JSON.stringify({ 
              username: currentUserRef.current?.name || 'unknown',
              logs,
              prefix: 'admin_requested',
              deviceId: localDeviceIdRef.current
            })
          });
          logger.logAction('ADMIN_DIAGNOSTICS_PULL_SUCCESS', { count: logs.length });
        } catch (e) {
          logger.logAction('ADMIN_DIAGNOSTICS_PULL_FAILED', { error: e.message });
        }
      }
    });

    socketRef.current.on('admin_ping_device_relay', (data) => {
      // If the admin is actively checking if we are online, respond instantly!
      logger.logAction('PING_RELAY_RECEIVED', { targetUserId: data.targetUserId, myId: currentUserRef.current?.id, match: data.targetUserId === currentUserRef.current?.id });
      if (data.targetUserId === currentUserRef.current?.id) {
        logger.logAction('PING_MATCH_SENDING_PONG', { deviceId: localDeviceIdRef.current, deviceName: Constants.deviceName || Platform.OS });
        socketRef.current.emit('device_pong', {
          targetUserId: data.targetUserId,
          deviceId: localDeviceIdRef.current || 'unknown',
          deviceName: Constants.deviceName || Platform.OS,
          timestamp: Date.now()
        });
      }
    });

    // 2. AppState: Refresh when app returns from background to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && !isSyncingRef.current) {
        if (!isStartupCompleteRef.current) {
          console.log("⏳ App returned to foreground, but startup is not yet complete. Skipping loadData.");
          logger.logAction('FOREGROUND_SKIP_STARTUP_INCOMPLETE');
          return;
        }
        console.log("📱 App returned to foreground, checking for cloud updates...");
        loadData(true); 
      }
    });

    // 3. IMMEDIATE HYDRATION FROM STORAGE & DEVICE REGISTRATION
    const startup = async () => {
      try {
        // 1. EARLY INTERCEPTION: Enable immediately to catch hydration logs
        await logger.initialize();
        logger.enableInterception();
        
        const cloudUrl = 'https://acetrack-suggested.onrender.com';
        logger.checkAndUploadCrash(cloudUrl, config.ACE_API_KEY);
        if (Platform.OS === 'web') {
          // Relies on injected CSS font-face for CORS safety
          console.log("🕸️ Ionicons styling injected via CSS");
        }
        
        // STEP 1: Always ensure hardware ID exists
        let hardwareId = await AsyncStorage.getItem('acetrack_device_id');
        if (!hardwareId) {
          hardwareId = (Constants.deviceName || Platform.OS).replace(/[^a-zA-Z0-9]/g, '_');
          await AsyncStorage.setItem('acetrack_device_id', hardwareId);
        }
        localDeviceIdRef.current = hardwareId;

        // Register for Push Notifications
        if (Platform.OS !== 'web') {
          registerForPushNotificationsAsync().then(token => {
            if (token) {
              storage.setItem('push_token', token);
              if (currentUserRef.current) {
                sendTokenToBackend(currentUserRef.current.id, token);
              }
            }
          });

          // PUSH NOTIFICATION LISTENERS & LOGGING
          let receivedSubscription;
          let responseSubscription;
          try {
            if (typeof Notifications !== 'undefined' && Notifications.addNotificationReceivedListener) {
              receivedSubscription = Notifications.addNotificationReceivedListener(notification => {
                logger.logAction('PUSH_NOTIFICATION_RECEIVED', {
                  title: notification.request.content.title,
                  message: notification.request.content.body,
                  data: notification.request.content.data,
                  timestamp: new Date().toISOString()
                });
                console.log("🔔 Push Notification Received (Foreground):", notification.request.content.title);
              });
            }

            if (typeof Notifications !== 'undefined' && Notifications.addNotificationResponseReceivedListener) {
              responseSubscription = Notifications.addNotificationResponseReceivedListener(response => {
                logger.logAction('PUSH_NOTIFICATION_OPENED', {
                  actionIdentifier: response.actionIdentifier,
                  title: response.notification.request.content.title,
                  data: response.notification.request.content.data,
                  timestamp: new Date().toISOString()
                });
                console.log("🔔 Push Notification Opened:", response.notification.request.content.title);
              });
            }
          } catch (notifErr) {
            logger.logAction('NOTIFICATION_LISTENER_SETUP_FAILED', { error: notifErr.message });
            console.warn('⚠️ Push notification listeners failed to initialize:', notifErr.message);
          }
        }
        
        // Use "admin" or "samsung" or currentUser.id for label
        const getLabel = () => {
          if (currentUserRef.current) return currentUserRef.current.id;
          return Platform.OS === 'android' ? 'samsung' : 'admin';
        };

        // INITIAL ARCHITECTURAL STATUS (As requested by user for diagnostics)
        logger.logAction('SYNC_ENGINE_STATUS', { 
          version: 'v5-HARDENED', 
          appVersion: APP_VERSION,
          features: ['Ref-Mirroring', 'Atomic-Callbacks', 'Heartbeat-v36-RESTORED'],
          ota: {
            updateId: Updates.updateId || 'Built-in',
            channel: Updates.channel || 'Default',
            runtimeVersion: Updates.runtimeVersion || 'Unknown'
          },
          status: 'Operational'
        });

        // User specifically requested to disable 15s heartbeats.

        // Note: setThresholdCallback was removed due to scope-related ReferenceError in v1.0.29

        await hydrateFromStorage();
        
        // STEP 2: Tiny wait to ensure React state batching has committed the user
        await new Promise(resolve => setTimeout(resolve, 100));

        // Mark startup as complete BEFORE loadData so that any background attempts are allowed or known
        isStartupCompleteRef.current = true;
        logger.logAction('STARTUP_COMPLETE', { 
          hasUser: !!currentUserRef.current,
          userId: currentUserRef.current?.id 
        });

        // Only after local data is visible do we attempt a cloud pull
        // We pass 'true' to loadData here to avoid redundant setIsLoading calls
        await loadData(true); 

      } catch (e) {
        console.error("❌ Critical Startup Error:", e);
        // We log it only if interception is already enabled, otherwise console is the only way
        logger.logAction('CRITICAL_STARTUP_ERROR', { error: e.message, stack: e.stack });
      } finally {
        // STEP 3: Finally, reveal the app once everything is settled (GUARANTEED)
        setIsLoading(false);
      }
    };
    startup();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      subscription.remove();
    };
  }, [isUsingCloud]); 

  // 4. PERSISTENT VERIFICATION PROMPT: Ensure it shows up if unverified
  // Fix: Don't show if user is admin OR already in the Edit Profile modal
  useEffect(() => {
    // Initialize Firebase
    initializeFirebase();
    if (currentUser && currentUser.role !== 'admin' && (!currentUser.isEmailVerified || !currentUser.isPhoneVerified) && !isProfileEditActive) {
      setShowVerificationPrompt(true);
    } else {
      setShowVerificationPrompt(false);
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.isEmailVerified, currentUser?.isPhoneVerified, isProfileEditActive]);
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

  const checkForUpdates = useCallback(async () => {
    try {
      if (isSyncingRef.current) return;

      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
      const response = await fetch(`${activeApiUrl}/api/status`, {
        headers: { 'x-ace-api-key': config.ACE_API_KEY }
      });
      const status = await response.json();
      
      if (status.latestAppVersion) {
        setLatestAppVersion(status.latestAppVersion);
        if (isVersionObsolete(APP_VERSION, status.latestAppVersion)) {
          setShowForceUpdate(true);
          return; // Abort further syncs if obsolete
        }
      }

      if (status.lastUpdated && status.lastUpdated !== lastServerUpdateRef.current) {
        console.log("🆕 New cloud data available! Auto-refreshing...");
        logger.logAction('CLOUD_UPDATE_DETECTED', { lastUpdated: status.lastUpdated });
        await loadData(true, true);
      }
    } catch (error) {
      console.log("⚠️ Update check failed (silent):", error.message);
      logger.logAction('CHECK_UPDATES_FAILED', { error: error.message });
    }
  }, []); // Status check is safe to memoize broadly as it uses refs for latest values

  const hydrateFromStorage = async () => {
    console.log("📦 Hydrating app state from local storage...");
    try {
      const [p, t, v, m, st, ev, al, cm, ps, u, iuc, saids, vats, matchmakingFromStorage] = await Promise.all([
        storage.getItem('players'),
        storage.getItem('tournaments'),
        storage.getItem('matchVideos'),
        storage.getItem('matches'),
        storage.getItem('supportTickets'),
        storage.getItem('evaluations'),
        storage.getItem('auditLogs'),
        storage.getItem('chatbotMessages'),
        storage.getItem('pendingSync'),
        storage.getItem('currentUser'),
        storage.getItem('isUsingCloud'),
        storage.getItem('seenAdminActionIds'),
        storage.getItem('visitedAdminSubTabs'),
        storage.getItem('matchmaking')
      ]);

      if (p) setPlayers(p);
      if (t) setTournaments(t);
      if (v) setMatchVideos(v);
      if (m) setMatches(m);
      if (st) setSupportTickets(st);
      if (ev) setEvaluations(ev);
      if (al) setAuditLogs(al);
      if (cm) setChatbotMessages(cm);
      if (matchmakingFromStorage) setMatchmaking(matchmakingFromStorage);
      if (ps && Array.isArray(ps)) {
        setPendingSync(ps);
        pendingSyncRef.current = ps;
      }
      if (typeof iuc === 'boolean') {
        setIsUsingCloud(iuc);
      } else if (iuc && typeof iuc === 'string') {
        setIsUsingCloud(iuc === 'true');
      }
      if (saids && Array.isArray(saids)) {
        const normalized = new Set(saids.map(id => String(id)));
        setSeenAdminActionIds(normalized);
        logger.logAction('BADGE_HYDRATION_LOCAL', { key: 'seenAdminActionIds', count: normalized.size });
      }
      if (vats && Array.isArray(vats)) {
        setVisitedAdminSubTabs(new Set(vats));
        logger.logAction('BADGE_HYDRATION_LOCAL', { key: 'visitedAdminSubTabs', count: vats.length });
      }

      const rawUser = await storage.getItem('currentUser');
      logger.logAction('HYDRATION_RAW_USER', { data: rawUser ? (typeof rawUser === 'string' ? rawUser.substring(0, 100) : 'object') : 'null' });

      if (u) {
        setCurrentUser(u);
        currentUserRef.current = u;
        setViewingLanding(false);
        logger.logAction('HYDRATION_USER_RESTORED', { userId: u.id, role: u.role });
        
        // Extra check to ensure state is set
        setTimeout(() => {
          logger.logAction('HYDRATION_USER_STABILITY_CHECK', { 
            hasUser: !!u, 
            sessionValid: !!u?.id 
          });
        }, 1000);
        setUserRole(u.role || 'user');
        // Cloud-synced seen state for admins: Overwrite local if cloud data exists
        if (u.role === 'admin') {
          if (u.seenAdminActionIds && Array.isArray(u.seenAdminActionIds)) {
            setSeenAdminActionIds(new Set(u.seenAdminActionIds));
          }
          if (u.visitedAdminSubTabs && Array.isArray(u.visitedAdminSubTabs)) {
            setVisitedAdminSubTabs(new Set(u.visitedAdminSubTabs));
          }
        }
      } else {
        logger.logAction('HYDRATION_USER_MISSING', { rawFound: !!rawUser });
      }
      return true;
    } catch (e) {
      console.error("❌ Hydration failed:", e);
      return false;
    }
  };

  const syncPendingData = useCallback(async () => {
    // Read directly from storage to ensure we have the absolute latest pending list
    const latestPending = await storage.getItem('pendingSync') || [];
    if (latestPending.length === 0) return true;

    console.log("📤 Attempting to sync pending offline data:", latestPending);
    const updates = {};
    for (const key of latestPending) {
      const data = await storage.getItem(key);
      if (data) updates[key] = data;
    }

    const success = await pushStateToCloud(updates, true);
    if (success) {
      setPendingSync([]);
      pendingSyncRef.current = [];
      await storage.setItem('pendingSync', []);
      console.log("✅ [Sync] Pending data synced successfully");
    }
    return success;
  }, []);

  const loadData = useCallback(async (forceNoLoading = false, forceSync = false) => {
    if (isSyncingRef.current && !forceSync) {
      console.log("📡 Sync already in progress, skipping background loadData");
      return;
    }

    // First, try to sync any local changes.
    const syncSuccess = await syncPendingData();
    if (pendingSyncRef.current.length > 0 && !syncSuccess) {
      console.log("⏳ Local changes pending sync. Skipping cloud pull to prevent overwrite.");
      setIsCloudOnline(false);
      setIsLoading(false);
      return false;
    }

    if (!forceNoLoading) setIsLoading(true);
    const versionAtStart = ++syncVersion.current;

    try {
      setSyncingState(true);
      logger.logAction('LOAD_DATA_START', { version: versionAtStart, isBackground: forceNoLoading });
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;

      console.log(`📡 Fetching Updates from ${isUsingCloudRef.current ? 'CLOUD' : 'LOCAL'} [v${versionAtStart}]...`);
      const response = await fetch(`${activeApiUrl}/api/data`, {
        signal: controller.signal,
        headers: {
          'x-ace-api-key': config.ACE_API_KEY
        }
      });
      clearTimeout(timeoutId);

      if (!response.ok) throw new Error("Cloud fetch failed");

      const cloudData = await response.json();
      console.log(`✅ [v${versionAtStart}] Data fetched successfully [Keys: ${Object.keys(cloudData).join(', ')}]`);

      // DO NOT proceed if a newer sync has already started
      if (versionAtStart !== syncVersion.current && !forceSync) {
        console.log(`⏳ Discarding stale cloud pull [v${versionAtStart}]`);
        return false;
      }

      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());

      if (cloudData.lastUpdated) {
        lastServerUpdateRef.current = cloudData.lastUpdated;
        logger.logAction('LOAD_DATA_SUCCESS', { lastUpdated: cloudData.lastUpdated });
      }

      if (cloudData.players) {
        cloudData.players = cloudData.players.filter(p => p && p.id && String(p.id).toLowerCase() !== 'test');
        const playersChanged = JSON.stringify(cloudData.players) !== JSON.stringify(playersRef.current);
        if (playersChanged) {
          setPlayers(cloudData.players);
          storage.setItem('players', cloudData.players);
        }

        const currentU = currentUserRef.current;
        if (currentU) {
          const cloudUser = cloudData.players.find(p => String(p.id).toLowerCase() === String(currentU.id).toLowerCase());
          if (cloudUser) {
            const sanitizeUser = (u) => {
              const { devices, lastActive, ...rest } = u;
              return rest;
            };
            const hasChanged = JSON.stringify(sanitizeUser(cloudUser)) !== JSON.stringify(sanitizeUser(currentU));
            
            if (hasChanged) {
              setCurrentUser(cloudUser);
              currentUserRef.current = cloudUser;
              setUserRole(cloudUser.role || 'user');
              storage.setItem('currentUser', cloudUser);
            }
          }
        }
      }

      if (cloudData.tournaments) {
        const cleaned = cloudData.tournaments.map(t => ({
          ...t,
          registeredPlayerIds: (t.registeredPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test'),
          pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test')
        }));
        setTournaments(cleaned);
        storage.setItem('tournaments', cleaned);
      }
      if (cloudData.matchVideos) {
        setMatchVideos(cloudData.matchVideos);
        storage.setItem('matchVideos', cloudData.matchVideos);
      }
      if (cloudData.matches) {
        setMatches(cloudData.matches);
        storage.setItem('matches', cloudData.matches);
      }
      if (cloudData.matchmaking) {
        setMatchmaking(cloudData.matchmaking);
        storage.setItem('matchmaking', cloudData.matchmaking);
      }
      if (cloudData.auditLogs) {
        setAuditLogs(cloudData.auditLogs);
        storage.setItem('auditLogs', cloudData.auditLogs);
      }
      if (cloudData.chatbotMessages) {
        setChatbotMessages(cloudData.chatbotMessages);
        storage.setItem('chatbotMessages', cloudData.chatbotMessages);
      }

      return cloudData;
    } catch (e) {
      console.log("📡 Cloud unreachable or error:", e.message);
      setIsCloudOnline(false);
      return false;
    } finally {
      if (versionAtStart === syncVersion.current) {
        setSyncingState(false);
        if (!forceNoLoading) setIsLoading(false);
        if (pendingUpdateCheckRef.current) {
           pendingUpdateCheckRef.current = false;
           checkForUpdates();
        }
      }
    }
  }, [syncPendingData, checkForUpdates]);

  const pushStateToCloud = useCallback(async (updates) => {
    if (!isUsingCloudRef.current) return;
    
    const thisVersion = ++syncVersion.current;
    try {
      setSyncingState(true);
      logger.logAction('PUSH_DATA_START', { keys: Object.keys(updates), version: thisVersion });
      
      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
      const response = await fetch(`${activeApiUrl}/api/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      const result = await response.json();
      
      if (thisVersion === syncVersion.current) {
        lastServerUpdateRef.current = result.lastUpdated;
        logger.logAction('PUSH_DATA_SUCCESS', { lastUpdated: result.lastUpdated });
      }
      return true;
    } catch (error) {
      console.error("❌ Cloud Push Error:", error);
      logger.logAction('PUSH_DATA_ERROR', { error: error.message, version: thisVersion });
      return false;
    } finally {
      if (thisVersion === syncVersion.current) {
        setSyncingState(false);
        if (pendingUpdateCheckRef.current) {
           pendingUpdateCheckRef.current = false;
           checkForUpdates();
        }
      }
    }
  }, [checkForUpdates]);


  const lastActiveUpdateRef = useRef(0);
  const syncAndSaveData = useCallback(async (updates) => {
    if (updates.currentUser && localDeviceIdRef.current) {
      const now = Date.now();
      const needsTimestampUpdate = now - lastActiveUpdateRef.current > 5 * 60 * 1000;
      
      const sanitizeUser = (u) => {
        const { devices, lastActive, ...rest } = u || {};
        return rest;
      };
      const otherDataChanged = JSON.stringify(sanitizeUser(updates.currentUser)) !== JSON.stringify(sanitizeUser(currentUserRef.current));

      if (needsTimestampUpdate || otherDataChanged) {
        lastActiveUpdateRef.current = now;
        const myTracker = {
          id: localDeviceIdRef.current,
          name: Constants.deviceName || Platform.OS,
          appVersion: APP_VERSION,
          platformVersion: `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
          lastActive: now
        };
        updates.currentUser.devices = updates.currentUser.devices || [];
        const dIndex = updates.currentUser.devices.findIndex(d => d.id === localDeviceIdRef.current);
        if (dIndex >= 0) updates.currentUser.devices[dIndex] = myTracker;
        else updates.currentUser.devices.push(myTracker);
        
        if (!updates.players) {
          updates.players = [...playersRef.current];
        }
        const pIndex = updates.players.findIndex(p => p.id === updates.currentUser.id);
        if (pIndex >= 0) {
          updates.players[pIndex] = { ...updates.players[pIndex], devices: updates.currentUser.devices };
        }
      }
    }

    try {
      for (const key in updates) {
        let val = updates[key];
        if (key === 'players' && Array.isArray(val)) {
          val = val.filter(p => p && p.id && String(p.id).toLowerCase() !== 'test');
        }
        if (key === 'tournaments' && Array.isArray(val)) {
          val = val.map(t => ({
            ...t,
            registeredPlayerIds: (t.registeredPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test'),
            pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test')
          }));
        }
        await storage.setItem(key, val);
      }

      const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser', 'matchmaking'];
      const syncUpdates = {};
      let hasSyncable = false;

      for (const key in updates) {
        if (syncableKeys.includes(key)) {
          syncUpdates[key] = updates[key];
          hasSyncable = true;
        }
      }

      if (!hasSyncable) return;

      if (isUsingCloudRef.current && isCloudOnline) {
        const success = await pushStateToCloud(syncUpdates);
        if (!success) {
          setPendingSync(prev => {
            let next = [...prev];
            let changed = false;
            for (const key in syncUpdates) {
              if (!next.includes(key)) {
                next.push(key);
                changed = true;
              }
            }
            if (changed) {
              storage.setItem('pendingSync', next);
            }
            return next;
          });
        }
      }
    } catch (e) {
      console.error(`Failed to sync and save data`, e);
    }
  }, [pushStateToCloud, isCloudOnline]);

  // Handlers
  const handleLogin = useCallback(async (role, user) => {
    setCurrentUser(user);
    currentUserRef.current = user;
    setUserRole(role);
    await storage.setItem('currentUser', user);

    syncAndSaveData({ currentUser: user });
    
    const isNew = !playersRef.current.some(p => String(p.id).toLowerCase() === String(user.id).toLowerCase());
    if (user && isNew) {
      const updated = [user, ...playersRef.current];
      setPlayers(updated);
      await storage.setItem('players', updated);
      await pushStateToCloud({ players: updated });
    }
    
    await hydrateFromStorage();
    await loadData(true, true);
    
    const pushToken = await storage.getItem('push_token');
    if (pushToken && user?.id) {
      sendTokenToBackend(user.id, pushToken);
    }
  }, [hydrateFromStorage, loadData, pushStateToCloud, syncAndSaveData]);

  const handleLogout = useCallback(async () => {
    logger.logAction('USER_LOGOUT_START', { userId: currentUserRef.current?.id });
    currentUserRef.current = null;
    setCurrentUser(null);
    setUserRole(null);
    setSyncingState(false);
    
    setPlayers([CURRENT_PLAYER, ...OTHER_PLAYERS]);
    setTournaments(TOURNAMENTS);
    setMatchVideos(MATCH_VIDEOS);
    setSupportTickets(SUPPORT_TICKETS);
    setMatches(MATCHES);
    setEvaluations([]);
    setChatbotMessages({});
    setPendingSync([]);
    pendingSyncRef.current = [];
    
    await storage.removeItem('currentUser');
    await storage.removeItem('pendingSync');
  }, []);

  const handleRegisterUser = useCallback(async (newPlayer) => {
    const updatedPlayers = [newPlayer, ...playersRef.current];
    setPlayers(updatedPlayers);
    await storage.setItem('players', updatedPlayers);
    const success = await pushStateToCloud({ players: updatedPlayers }, true);
    
    logger.logAction('USER_SIGNUP', { 
      id: newPlayer.id, 
      name: newPlayer.name, 
      role: newPlayer.role,
      cloudSync: success ? 'SUCCESS' : 'PENDING'
    });
    
    if (!success) {
      setPendingSync(prev => {
        const next = [...prev];
        if (!next.includes('players')) next.push('players');
        storage.setItem('pendingSync', next);
        return next;
      });
    }
    return success;
  }, [pushStateToCloud]);

  const handleSaveTournament = useCallback((t) => {
    setTournaments(prev => {
      const updated = prev.map(item => item.id === t.id ? t : item);
      if (!prev.find(item => item.id === t.id)) updated.unshift(t);
      syncAndSaveData({ tournaments: updated });
      return updated;
    });
  }, [syncAndSaveData]);

  const handleSaveVideo = useCallback((v) => {
    const isNew = !matchVideos.find(item => item.id === v.id);
    const updatedVideos = matchVideos.map(item => item.id === v.id ? v : item);
    if (isNew) updatedVideos.unshift(v);
    
    let updatedPlayers = playersRef.current;
    const recipientIds = new Set();

    if (isNew) {
      const match = matches.find(m => m.id === v.matchId);
      const tournament = tournaments.find(t => t.id === v.tournamentId);
      
      [
        ...(match?.player1Id ? [match.player1Id] : []),
        ...(match?.player2Id ? [match.player2Id] : []),
        ...(tournament?.assignedCoachId ? [tournament.assignedCoachId] : [])
      ].forEach(id => recipientIds.add(id));

      updatedPlayers = updatedPlayers.map(p => {
        if (recipientIds.has(p.id)) {
            const notif = {
                id: `notif-${Date.now()}-${p.id}`,
                title: 'New Video Uploaded',
                message: `Recording for match ${v.matchId} is now available.`,
                date: new Date().toISOString(),
                read: false,
                type: 'video',
                tournamentId: v.tournamentId
            };
            return { ...p, notifications: [notif, ...(p.notifications || [])] };
        }
        return p;
      });
    }

    setMatchVideos(updatedVideos);
    setPlayers(updatedPlayers);

    const updates = { matchVideos: updatedVideos, players: updatedPlayers };

    if (isNew && currentUserRef.current && recipientIds.has(currentUserRef.current.id)) {
      const updatedUser = updatedPlayers.find(p => p.id === currentUserRef.current.id);
      setCurrentUser(updatedUser);
      updates.currentUser = updatedUser;
    }

    syncAndSaveData(updates);

    if (isNew) {
      setTimeout(() => {
        setMatchVideos(prev => {
          const final = prev.map(item => {
            if (item.id === v.id) {
              return { 
                ...item, 
                status: 'ready',
                videoUrl: config.sanitizeUrl(item.videoUrl),
                previewUrl: config.sanitizeUrl(item.previewUrl),
                watermarkedUrl: config.sanitizeUrl(item.watermarkedUrl)
              };
            }
            return item;
          });
          pushStateToCloud({ matchVideos: final });
          storage.setItem('matchVideos', final);
          return final;
        });
      }, 5000);
    }
  }, [matchVideos, matches, tournaments, pushStateToCloud, syncAndSaveData]);

  const handleSyncUpdate = useCallback(async (updates) => {
    const currentU = currentUserRef.current;
    const currentP = playersRef.current;
    
    logger.logAction('SYNC_UPDATE_INIT', { 
        keys: Object.keys(updates), 
        hasUser: !!updates.currentUser,
        avatar: updates.currentUser?.avatar 
    });

    // 1. Mirror components using 'players' array
    if (updates.players) {
        setPlayers(updates.players);
        playersRef.current = updates.players;
    }

    // 2. Protect current session. NEVER inherently trust updates.currentUser
    if (currentU) {
        if (currentU.role === 'admin' && updates.currentUser) {
            // ADMIN BYPASS: The Admin ghost-account is intentionally excluded from the global players array.
            setCurrentUser(updates.currentUser);
            currentUserRef.current = updates.currentUser;
        } else {
            // Soft update the local session from the matching global player record
            const matchingGlobalUser = (updates.players || currentP).find(p => String(p.id).toLowerCase() === String(currentU.id).toLowerCase());
            if (matchingGlobalUser) {
                setCurrentUser(matchingGlobalUser);
                currentUserRef.current = matchingGlobalUser;
            }
        }
    } else if (updates.currentUser && !updates.players) {
        // Edge case: Local immediate UI updates before backend turnaround
        setCurrentUser(updates.currentUser);
        currentUserRef.current = updates.currentUser;
        
        const u = updates.currentUser;
        const updatedPlayers = currentP.map(p => 
          String(p.id).toLowerCase() === String(u.id).toLowerCase() ? u : p
        );
        if (!updatedPlayers.some(p => String(p.id).toLowerCase() === String(u.id).toLowerCase())) {
          updatedPlayers.push(u);
        }
        setPlayers(updatedPlayers);
        playersRef.current = updatedPlayers;
    }

    const success = await syncAndSaveData(updates);
    logger.logAction('SYNC_UPDATE_FINISH', { success });
    return success;
  }, [syncAndSaveData]);

  const handleLogTrace = useCallback((action, targetType, targetId, details, adminId = 'system') => {
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      action,
      targetType,
      targetId,
      details: typeof details === 'string' ? details : JSON.stringify(details),
      adminId,
      timestamp: new Date().toISOString()
    };
    setAuditLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 500); // Keep last 500 logs
      syncAndSaveData({ auditLogs: updated });
      return updated;
    });
  }, [syncAndSaveData]);

  const handleUpdateMatchmaking = useCallback((newMatchmaking) => {
    setMatchmaking(newMatchmaking);
    syncAndSaveData({ matchmaking: newMatchmaking });
  }, [syncAndSaveData]);

  const handleSendUserNotification = useCallback((targetUserId, notification) => {
    const currentP = playersRef.current || players;
    const updatedPlayers = currentP.map(p => {
      if (String(p.id).toLowerCase() === String(targetUserId).toLowerCase()) {
        return {
          ...p,
          notifications: [
            {
              id: `notif-${Date.now()}`,
              read: false,
              date: new Date().toISOString(),
              ...notification
            },
            ...(p.notifications || [])
          ]
        };
      }
      return p;
    });
    
    logger.logAction('NOTIFICATION_SENT', {
      targetUserId,
      type: notification.type,
      title: notification.title,
      timestamp: new Date().toISOString()
    });

    const isMe = currentUserRef.current && String(targetUserId).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
    if (isMe) {
      const updatedUser = updatedPlayers.find(p => String(p.id).toLowerCase() === String(targetUserId).toLowerCase());
      setCurrentUser(updatedUser);
      handleSyncUpdate({ currentUser: updatedUser, players: updatedPlayers });
    } else {
      setPlayers(updatedPlayers);
      handleSyncUpdate({ players: updatedPlayers });
    }
  }, [handleSyncUpdate]);

  const handleSaveTicket = useCallback((ticket) => {
    setSupportTickets(prev => {
      const updated = prev.map(t => t.id === ticket.id ? ticket : t);
      if (!prev.find(t => t.id === ticket.id)) updated.unshift(ticket);
      syncAndSaveData({ supportTickets: updated });
      return updated;
    });
  }, [syncAndSaveData]);

  const handleConfirmCoachRequest = useCallback((t) => {
    const updated = tournaments.map(item => item.id === t.id ? { ...item, coachStatus: 'Coach Confirmed' } : item);
    setTournaments(updated);
    syncAndSaveData({ tournaments: updated });
  }, [syncAndSaveData, tournaments]);

  const handleUploadLogs = useCallback(async () => {
    setIsUploadingLogs(true);
    try {
      const logs = logger.getLogs();
      const cloudUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
      const response = await fetch(`${cloudUrl}/api/diagnostics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY
        },
        body: JSON.stringify({
          username: currentUserRef.current?.name || 'unknown',
          logs,
          prefix: 'manual_upload',
          deviceId: localDeviceIdRef.current
        })
      });
      if (!response.ok) throw new Error("Upload failed");
      Alert.alert("Success", "Logs uploaded successfully.");
    } catch (e) {
      Alert.alert("Error", "Failed to upload logs: " + e.message);
    } finally {
      setIsUploadingLogs(false);
    }
  }, []);


  const memoizedHandlers = useMemo(() => ({
    onLogin: handleLogin,
    onLogout: handleLogout,
    onResetPassword: async (userId, newPassword) => {
      const updatedPlayers = playersRef.current.map(p => p.id === userId ? { ...p, password: newPassword } : p);
      setPlayers(updatedPlayers);
      await storage.setItem('players', updatedPlayers);
      return await pushStateToCloud({ players: updatedPlayers }, true);
    },
    sendUserNotification: handleSendUserNotification,
    loadData: loadData,
    onManualSync: loadData,
    onRegisterUser: handleRegisterUser,
    onToggleCloud: () => {
      setIsUsingCloud(prev => {
        const next = !prev;
        storage.setItem('isUsingCloud', next);
        setTimeout(() => { setIsLoading(true); loadData(true, true); }, 100);
        return next;
      });
    },
    isUsingCloud,
    seenAdminActionIds,
    setSeenAdminActionIds: (ids) => {
      const normalized = new Set(Array.from(ids).map(id => String(id)));
      setSeenAdminActionIds(normalized);
      storage.setItem('seenAdminActionIds', Array.from(normalized));
      if (currentUserRef.current?.role === 'admin') {
        handleSyncUpdate({ currentUser: { ...currentUserRef.current, seenAdminActionIds: Array.from(normalized) } });
      }
    },
    visitedAdminSubTabs,
    setVisitedAdminSubTabs: (tabs) => {
      setVisitedAdminSubTabs(tabs);
      storage.setItem('visitedAdminSubTabs', Array.from(tabs));
      if (currentUserRef.current?.role === 'admin') {
        handleSyncUpdate({ currentUser: { ...currentUserRef.current, visitedAdminSubTabs: Array.from(tabs) } });
      }
    },
    setIsProfileEditActive,
    onSaveTournament: handleSaveTournament,
    onSaveVideo: handleSaveVideo,
    onUpdateUser: (u) => { 
       const updatedPlayers = playersRef.current.map(p => String(p.id).toLowerCase() === String(u.id).toLowerCase() ? u : p);
       handleSyncUpdate({ currentUser: u, players: updatedPlayers });
    },
    onLogTrace: handleLogTrace,
    onVerifyAccount: (type) => {
      const currentU = currentUserRef.current;
      if (!currentU) return;
      const updatedUser = { ...currentU, [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true };
      const updatedPlayers = playersRef.current.map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p);
      handleSyncUpdate({ currentUser: updatedUser, players: updatedPlayers });
    },
    onBatchUpdate: (updates) => handleSyncUpdate(updates),
    isCloudOnline,
    isSyncing,
    lastSyncTime,
    onTopUp: (amount) => {
      if (!currentUserRef.current) return;
      const updatedUser = {
        ...currentUserRef.current,
        credits: (currentUserRef.current.credits || 0) + amount,
        walletHistory: [{ id: Date.now().toString(), type: 'credit', amount, description: 'Wallet Top Up', date: new Date().toISOString() }, ...(currentUserRef.current.walletHistory || [])]
      };
      const updatedPlayers = playersRef.current.map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p);
      setPlayers(updatedPlayers);
      setCurrentUser(updatedUser);
      currentUserRef.current = updatedUser;
      syncAndSaveData({ players: updatedPlayers, currentUser: updatedUser });
      Alert.alert("Success", `₹${amount} added!`);
    },
    onReplyTicket: (id, text, image, replyToMsg) => {
      const msgText = typeof text === 'string' ? text : (text?.text || String(text || ''));
      const msg = { senderId: currentUserRef.current?.id || 'admin', text: msgText, timestamp: new Date().toISOString() };
      if (image) msg.image = image;
      if (replyToMsg) msg.replyTo = { text: replyToMsg.text || '', senderId: replyToMsg.senderId || '' };
      const updated = supportTickets.map(t => t.id === id ? { ...t, messages: [...t.messages, msg] } : t);
      setSupportTickets(updated);
      syncAndSaveData({ supportTickets: updated });
    },
    onUpdateTicketStatus: (id, status) => {
      const updated = supportTickets.map(t => t.id === id ? { ...t, status } : t);
      setSupportTickets(updated);
      syncAndSaveData({ supportTickets: updated });
      if (currentUserRef.current) {
          const ticket = updated.find(t => t.id === id);
          if (ticket && ticket.userId === currentUserRef.current.id) {
            const notif = { id: `notif-${Date.now()}`, title: 'Ticket Status Updated', message: `Ticket "${ticket.title}" is ${status}.`, date: new Date().toISOString(), read: false, type: 'support' };
            const updatedUser = { ...currentUserRef.current, notifications: [notif, ...(currentUserRef.current.notifications || [])] };
            setCurrentUser(updatedUser);
            currentUserRef.current = updatedUser;
            const updatedPlayers = playersRef.current.map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p);
            setPlayers(updatedPlayers);
            syncAndSaveData({ players: updatedPlayers, currentUser: updatedUser });
          }
      }
    },
    onSaveTicket: handleSaveTicket,
    onSaveEvaluation: (e) => {
      setEvaluations(prev => {
        const updated = prev.map(item => item.id === e.id ? e : item);
        if (!prev.find(item => item.id === e.id)) updated.unshift(e);
        syncAndSaveData({ evaluations: updated });
        return updated;
      });
    },
    onConfirmCoachRequest: handleConfirmCoachRequest,
    setPlayers: (updater) => {
      setPlayers(prev => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        syncAndSaveData({ players: next });
        return next;
      });
    },
    onSendChatMessage: (messages) => {
      if (!currentUserRef.current) return;
      setChatbotMessages(prev => {
        const updated = { ...prev, [currentUserRef.current.id]: messages };
        syncAndSaveData({ chatbotMessages: updated });
        return updated;
      });
    },
    onUpdateMatchmaking: handleUpdateMatchmaking,
    onUploadLogs: handleUploadLogs,
    isUploadingLogs,
    onDeclineCoachRequest: (t) => {
      const updated = tournaments.map(item => item.id === t.id ? { ...item, coachStatus: 'Declined' } : item);
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
    },
    onStartTournament: (tid) => {
      const updated = tournaments.map(t => t.id === tid ? { ...t, tournamentStarted: true } : t);
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
    },
    onEndTournament: (tid) => {
      const updated = tournaments.map(t => t.id === tid ? { ...t, status: 'completed', tournamentConcluded: true } : t);
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
    },
    onLogFailedOtp: (tid, cid, otp) => {
      setTournaments(prev => {
        const updated = prev.map(t => t.id === tid ? { ...t, failedOtps: [...(t.failedOtps || []), { coachId: cid, otp, timestamp: new Date().toISOString() }] } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onApproveCoach: (cid) => {
      setPlayers(prev => {
        const updated = prev.map(p => p.id === cid ? { ...p, coachStatus: 'approved' } : p);
        syncAndSaveData({ players: updated });
        return updated;
      });
    },
    onAssignCoach: (tid, cid) => {
      setTournaments(prev => {
        const updated = prev.map(t => t.id === tid ? { ...t, assignedCoachId: cid, coachStatus: 'Coach Assigned' } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onRemoveCoach: (tid, cid) => {
      setTournaments(prev => {
        const updated = prev.map(t => t.id === tid ? { ...t, assignedCoachId: null, coachStatus: 'Awaiting Coach Confirmation' } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onUpdateVideoStatus: (vid, status) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => v.id === vid ? { ...v, status } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onBulkUpdateVideoStatus: (ids, status) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => ids.includes(v.id) ? { ...v, status } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onForceRefundVideo: (id) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => v.id === id ? { ...v, refundsIssued: (v.refundsIssued || 0) + 1 } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onApproveDeleteVideo: (id) => {
      const video = matchVideos.find(v => v.id === id);
      if (!video) return;
      const updatedVideos = matchVideos.map(v => v.id === id ? { ...v, adminStatus: 'Removed' } : v);
      const updatedPlayers = players.map(player => {
        let credits = player.credits || 0;
        let pVideos = player.purchasedVideos || [];
        if (pVideos.includes(id)) { credits += (video.price || 0); pVideos = pVideos.filter(vid => vid !== id); }
        return { ...player, credits, purchasedVideos: pVideos };
      });
      setMatchVideos(updatedVideos); setPlayers(updatedPlayers);
      syncAndSaveData({ matchVideos: updatedVideos, players: updatedPlayers });
    },
    onRejectDeleteVideo: (id) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => v.id === id ? { ...v, adminStatus: 'Active' } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onPermanentDeleteVideo: (id) => {
      setMatchVideos(prev => {
        const updated = prev.filter(v => v.id !== id);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onCancelVideo: (id) => {
      setMatchVideos(prev => {
        const updated = prev.filter(v => v.id !== id);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onRequestDeletion: (id, reason) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => v.id === id ? { ...v, adminStatus: 'Deletion Requested', deletionReason: reason } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onUnlockVideo: (vid, price, method) => {
      if (!currentUserRef.current) return;
      const updatedUser = { ...currentUserRef.current, credits: method === 'wallet' ? (currentUserRef.current.credits || 0) - price : (currentUserRef.current.credits || 0), purchasedVideos: [...(currentUserRef.current.purchasedVideos || []), vid] };
      const updatedMatchVideos = matchVideos.map(v => v.id === vid ? { ...v, purchases: (v.purchases || 0) + 1 } : v);
      const updatedPlayers = players.map(p => p.id === currentUserRef.current.id ? updatedUser : p);
      setMatchVideos(updatedMatchVideos); setPlayers(updatedPlayers); setCurrentUser(updatedUser); currentUserRef.current = updatedUser;
      syncAndSaveData({ currentUser: updatedUser, players: updatedPlayers, matchVideos: updatedMatchVideos });
    },
    onPurchaseAiHighlights: (vid, uid, method) => {
      if (!currentUserRef.current) return;
      const updatedUser = { ...currentUserRef.current, credits: method === 'wallet' ? (currentUserRef.current.credits || 0) - 20 : (currentUserRef.current.credits || 0), purchasedHighlights: [...(currentUserRef.current.purchasedHighlights || []), vid] };
      const updatedPlayers = players.map(p => p.id === currentUserRef.current.id ? updatedUser : p);
      setPlayers(updatedPlayers); setCurrentUser(updatedUser); currentUserRef.current = updatedUser;
      syncAndSaveData({ currentUser: updatedUser, players: updatedPlayers });
    },
    onVideoPlay: (vid, uid) => {
      setMatchVideos(prev => {
        const updated = prev.map(v => {
          if (v.id === vid) { const currentViewers = v.viewerIds || []; if (!uid || currentViewers.includes(uid)) return v; return { ...v, viewerIds: [...currentViewers, uid] }; }
          return v;
        });
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onToggleFavourite: (vid) => {
      if (!currentUserRef.current) return;
      const isFav = (currentUserRef.current.favouritedVideos || []).includes(vid);
      const updatedFavs = isFav ? (currentUserRef.current.favouritedVideos || []).filter(id => id !== vid) : [...(currentUserRef.current.favouritedVideos || []), vid];
      const updatedUser = { ...currentUserRef.current, favouritedVideos: updatedFavs };
      setCurrentUser(updatedUser); currentUserRef.current = updatedUser;
      const updatedPlayers = players.map(p => p.id === currentUserRef.current.id ? updatedUser : p);
      setPlayers(updatedPlayers);
      syncAndSaveData({ players: updatedPlayers, currentUser: updatedUser });
    },
    onUpdateTournament: (t) => handleSaveTournament(t),
    onSaveCoachComment: (tid, comment) => {
      setTournaments(prev => {
        const updated = prev.map(t => t.id === tid ? { ...t, coachComments: [...(t.coachComments || []), { id: Date.now(), coachId: currentUserRef.current.id, text: comment, timestamp: new Date().toISOString() }] } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onRegister: (t, method, totalCost, isRescheduling, reschedulingFrom) => {
      if (!currentUserRef.current) return;
      const updatedUser = { ...currentUserRef.current, registeredTournamentIds: [...(currentUserRef.current.registeredTournamentIds || []), t.id] };
      const updatedTournaments = tournaments.map(item => item.id === t.id ? { ...item, registeredPlayerIds: [...(item.registeredPlayerIds || []), currentUserRef.current.id] } : item);
      setTournaments(updatedTournaments); setPlayers(players.map(p => p.id === currentUserRef.current.id ? updatedUser : p)); setCurrentUser(updatedUser);
      syncAndSaveData({ tournaments: updatedTournaments, players: playersRef.current, currentUser: updatedUser });
    },
    onReschedule: (t) => setReschedulingFrom(t.id),
    onCancelReschedule: () => setReschedulingFrom(null),
    onOptOut: (t) => {
      if (!currentUserRef.current) return;
      const updatedTournaments = tournaments.map(item => item.id === t.id ? { ...item, registeredPlayerIds: (item.registeredPlayerIds || []).filter(pid => pid !== currentUserRef.current.id) } : item);
      setTournaments(updatedTournaments);
      syncAndSaveData({ tournaments: updatedTournaments });
    },
    onBack: () => { setViewingLanding(true); setShowSignup(false); setShowOnboarding(false); },
    onSignup: () => {
      console.log("➡️ App Navigator: onSignup requested");
      setShowSignup(true);
    }
  }), [handleLogin, handleLogout, handleSendUserNotification, loadData, handleUpdateMatchmaking, handleRegisterUser, handleSaveTournament, handleSaveVideo, handleSyncUpdate, handleLogTrace, handleSaveTicket, handleConfirmCoachRequest, handleUploadLogs, isUploadingLogs, isCloudOnline, isSyncing, lastSyncTime, isUsingCloud, seenAdminActionIds, visitedAdminSubTabs, tournaments, matchVideos, matches, players, userRole, supportTickets, evaluations, chatbotMessages]);

  logger.logAction('APP_RENDER_STATE', { 
    isLoading, 
    hasUser: !!currentUser, 
    viewingLanding, 
    showSignup, 
    showOnboarding,
    timestamp: new Date().toISOString()
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingScreen 
        initialStep={onboardingInitialStep}
        onFinish={() => {
          setShowOnboarding(false);
          storage.setItem('hasCompletedOnboarding', 'true');
        }}
      />
    );
  }

  if (viewingLanding && !currentUser) {
    return (
      <LandingScreen 
        onLogin={() => {
          setViewingLanding(false);
          setShowSignup(false);
        }}
        onJoinCircle={() => {
          setViewingLanding(false);
          setShowSignup(true);
        }}
      />
    );
  }

  if (showSignup) {
    return (
      <SignupScreen 
        players={players}
        isUsingCloud={isUsingCloud}
        onToggleCloud={memoizedHandlers.onToggleCloud}
        onBack={memoizedHandlers.onBack}
        onSignupSuccess={(newUser) => {
          setShowSignup(false);
          handleRegisterUser(newUser);
          setViewingLanding(false);
        }}
        Sport={{ badminton: 'Badminton', tennis: 'Tennis', tableTennis: 'Table Tennis', cricket: 'Cricket' }}
      />
    );
  }

  if (!currentUser) {
    return (
      <LoginScreen 
        onLoginSuccess={handleLogin}
        onBack={memoizedHandlers.onBack}
        onToggleCloud={memoizedHandlers.onToggleCloud}
        isUsingCloud={isUsingCloud}
        isLoading={isLoading}
        players={players}
        onSignup={memoizedHandlers.onSignup}
        onResetPassword={memoizedHandlers.onResetPassword}
        onRefreshData={memoizedHandlers.onManualSync}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <TouchableOpacity 
          activeOpacity={1} 
          style={{ flex: 1 }} 
          onPress={() => {
            return false;
          }}
        >
        <NavigationContainer 
          ref={navigationRef}
          onStateChange={(state) => {
            if (state) {
              const route = state.routes[state.index];
              logger.logAction('NAVIGATION', { 
                screen: route.name, 
                paramKeys: route.params ? Object.keys(route.params) : [] 
              });
            }
          }}
        >
        <StatusBar barStyle="dark-content" />
        <AppNavigator
          user={currentUser}
          role={userRole}
          appVersion={APP_VERSION}
          players={players.some(p => p.id === currentUser?.id) ? players : (currentUser ? [currentUser, ...players] : players)}
          tournaments={tournaments}
          matchVideos={matchVideos}
          matches={matches}
          tickets={supportTickets}
          evaluations={evaluations}
          seenAdminActionIds={seenAdminActionIds}
          visitedAdminSubTabs={visitedAdminSubTabs}
          setVisitedAdminSubTabs={setVisitedAdminSubTabs}
          reschedulingFrom={reschedulingFrom}
          auditLogs={auditLogs} 
          onLogout={handleLogout} 
          handlers={memoizedHandlers}
          socketRef={socketRef}
          matchmaking={matchmaking}
          onUpdateMatchmaking={memoizedHandlers.onUpdateMatchmaking}
          sendUserNotification={memoizedHandlers.sendUserNotification}
          onManualSync={loadData}
        />
        {currentUser && (
          <ChatBot 
            user={currentUser} 
            userRole={userRole}
            userId={currentUser?.id}
            players={players}
            evaluations={evaluations} 
            chatbotMessages={chatbotMessages}
            onSendChatMessage={memoizedHandlers.onSendChatMessage}
            tournaments={tournaments}
            onSaveTicket={memoizedHandlers.onSaveTicket}
          />
        )}

        {/* Verification Prompt Modal */}
        <Modal
          visible={showVerificationPrompt}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowVerificationPrompt(false)}
        >
          <View style={appStyles.modalOverlay}>
            <View style={appStyles.verificationModalContent}>
              <View style={appStyles.verificationIconContainer}>
                <Ionicons name="shield-checkmark" size={40} color="#EF4444" />
              </View>
              <Text style={appStyles.verificationTitle}>Complete Verification</Text>
              <Text style={appStyles.verificationDescription}>
                Please verify your email and phone number to unlock all features, including tournament registrations.
              </Text>
              
              <TouchableOpacity 
                style={appStyles.verifyNowButton}
                onPress={() => {
                  setShowVerificationPrompt(false);
                  if (navigationRef.current) {
                    navigationRef.current.navigate('Profile', { autoEdit: true });
                  } else {
                    Alert.alert("Profile", "Please head to the Profile tab to complete verification.");
                  }
                }}
              >
                <Text style={appStyles.verifyNowText}>Complete Now</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={appStyles.maybeLaterButton}
                onPress={() => setShowVerificationPrompt(false)}
              >
                <Text style={appStyles.maybeLaterText}>Maybe Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Mandatory OTA Update Shield Modal */}
        <Modal
          visible={showForceUpdate}
          transparent={false}
          animationType="fade"
          onRequestClose={() => {}} // Un-dismissible
        >
          <View style={{ flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <Ionicons name="cloud-download" size={80} color="#38BDF8" style={{ marginBottom: 24 }} />
            <Text style={{ fontSize: 28, fontWeight: '900', color: '#FFFFFF', marginBottom: 12, textAlign: 'center', letterSpacing: 0.5 }}>Update Required</Text>
            <Text style={{ fontSize: 16, color: '#94A3B8', textAlign: 'center', marginBottom: 40, lineHeight: 24 }}>
              Your app version ({APP_VERSION}) is obsolete and unsupported. You must update to the latest network API version ({latestAppVersion}) to restore access to AceTrack.
            </Text>
            
            <TouchableOpacity 
              disabled={isUpdatingFromModal}
              onPress={async () => {
                setIsUpdatingFromModal(true);
                try {
                  const update = await Updates.checkForUpdateAsync();
                  if (update.isAvailable) {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } else {
                    Alert.alert("Update Not Found", "The OTA server did not return a manifest. Please try restarting the app or downloading from the store.");
                    setIsUpdatingFromModal(false);
                  }
                } catch (e) {
                  Alert.alert("OTA Update Failed", "Failed to physically connect to the OTA server. Error: " + e.message);
                  setIsUpdatingFromModal(false);
                }
              }}
              style={{ width: '100%', paddingVertical: 18, backgroundColor: '#10B981', borderRadius: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 }}
            >
              {isUpdatingFromModal ? <ActivityIndicator color="#FFFFFF" size="small" /> : <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Download OTA Update</Text>}
            </TouchableOpacity>
          </View>
        </Modal>

      </NavigationContainer>
        </TouchableOpacity>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const appStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  verificationModalContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    borderRadius: 32,
    padding: 32,
    alignItems: 'center',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
  },
  verificationIconContainer: {
    width: 80,
    height: 80,
    backgroundColor: '#FEF2F2',
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  verificationTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    marginBottom: 12,
    textAlign: 'center',
  },
  verificationDescription: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  verifyNowButton: {
    width: '100%',
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  verifyNowText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    textTransform: 'uppercase',
  },
  maybeLaterButton: {
    width: '100%',
    paddingVertical: 16,
    alignItems: 'center',
  },
  maybeLaterText: {
    color: '#94A3B8',
    fontWeight: 'bold',
    fontSize: 14,
    textTransform: 'uppercase',
  },
});

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF'
  }
});
