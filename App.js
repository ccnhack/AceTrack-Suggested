import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, 
  SafeAreaView, Alert, Platform, Modal, Image, KeyboardAvoidingView, ActivityIndicator, AppState, PanResponder, StatusBar, InteractionManager 
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

const APP_VERSION = "2.5.1";

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
  const [verificationLatch, setVerificationLatch] = useState({ email: false, phone: false });
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
  const lastSyncRef = React.useRef(0);
  const lastManualSyncTimeRef = React.useRef(0);
  const pendingSyncRef = React.useRef([]);
  const pendingUpdateCheckRef = React.useRef(false); // New: Track missed WebSocket signals
  const lastServerUpdateRef = React.useRef(null);
  const syncVersion = React.useRef(0);
  const navigationRef = React.useRef();
  const isUsingCloudRef = React.useRef(true);
  const socketRef = React.useRef(null);
  const playersRef = React.useRef(players);
  const matchVideosRef = React.useRef(matchVideos); // New ref for video sync
  const matchesRef = React.useRef(matches);
  const tournamentsRef = React.useRef(tournaments);
  const lastBackgroundSyncRef = React.useRef(0); 
  const updateCheckTimeoutRef = React.useRef(null); // DEBOUNCE: Groups WebSocket signals
  const syncLockRef = React.useRef(false); // MUTEX: Ensures push and pull don't overlap
  const globalBackoffUntilRef = React.useRef(0); // BACKOFF: 429 recovery timer

  const notificationReceivedSubscription = useRef(null);
  const notificationResponseSubscription = useRef(null);

  // Synchronous helper to update isSyncing state AND ref atomically
  const setSyncingState = (val) => {
    isSyncingRef.current = val; // Immediate ref update (no render delay)
    syncLockRef.current = val;  // Mutex lock
    setIsSyncing(val);          // React state update (for UI)
  };

  // Unified Ref Synchronization
  useEffect(() => {
    pendingSyncRef.current = pendingSync;
    isUsingCloudRef.current = isUsingCloud;
    playersRef.current = players;
    matchVideosRef.current = matchVideos;
    matchesRef.current = matches;
    tournamentsRef.current = tournaments;
  }, [pendingSync, isUsingCloud, players, matchVideos, matches, tournaments]);

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
      setIsCloudOnline(true); // Proactively warm up the UI badge
    });

    socketRef.current.on('disconnect', (reason) => {
      logger.logAction('WS_DISCONNECTED', { reason });
    });

    // CATCH-ALL: Log every single event the socket receives for diagnostics
    socketRef.current.onAny((eventName, ...args) => {
      if (eventName === 'SYNC_READY' || eventName === 'DATA_UPDATE') {
        clearTimeout(updateCheckTimeoutRef.current);
        updateCheckTimeoutRef.current = setTimeout(() => checkForUpdates(), 500); 
      }
    });

    socketRef.current.on('data_updated', (payload) => {
      console.log("⚡ Real-time update received via WebSocket!", payload);
      logger.logAction('WS_UPDATE_RECEIVED', { payload });
      
      // DEBOUNCED: Group multiple WebSocket signals into one check
      if (updateCheckTimeoutRef.current) clearTimeout(updateCheckTimeoutRef.current);
      updateCheckTimeoutRef.current = setTimeout(() => {
        updateCheckTimeoutRef.current = null;
        if (!syncLockRef.current) {
          checkForUpdates(); 
        } else {
          console.log("⏳ Sync in progress, queueing update check...");
          pendingUpdateCheckRef.current = true;
          logger.logAction('WS_UPDATE_QUEUED');
        }
      }, 5000); // 5s quiet period for rapid changes
    });

    socketRef.current.on('force_upload_diagnostics', async (data) => {
      if (data.targetUserId === currentUserRef.current?.id) {
        logger.logAction('ADMIN_DIAGNOSTICS_PULL_RECEIVED', { adminId: data.adminId, targetUserId: data.targetUserId, myId: currentUserRef.current?.id, targetDeviceId: data.targetDeviceId, myDeviceId: localDeviceIdRef.current });
        
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
        await logger.initialize();
        logger.enableInterception();
        
        const cloudUrl = 'https://acetrack-suggested.onrender.com';
        logger.checkAndUploadCrash(cloudUrl, config.ACE_API_KEY);
        
        let hardwareId = await AsyncStorage.getItem('acetrack_device_id');
        if (!hardwareId) {
          hardwareId = (Constants.deviceName || Platform.OS || 'device').replace(/[^a-zA-Z0-9]/g, '_') + '_' + Math.random().toString(36).substr(2, 5);
          await AsyncStorage.setItem('acetrack_device_id', hardwareId);
        }
        localDeviceIdRef.current = hardwareId;

        if (Platform.OS !== 'web') {
          registerForPushNotificationsAsync().then(token => {
            if (token) {
              storage.setItem('push_token', token);
              if (currentUserRef.current) sendTokenToBackend(currentUserRef.current.id, token);
            }
          });
        }
        
        await hydrateFromStorage();
        isStartupCompleteRef.current = true;
        await loadData(true); 

      } catch (e) {
        console.error("❌ Critical Startup Error:", e);
        logger.logAction('CRITICAL_STARTUP_ERROR', { error: e.message });
      } finally {
        setIsLoading(false);
      }
    };
    startup();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      subscription.remove();
    };
  }, []); // Only once at mount

  // TRACE: Monitor isUsingCloud state changes
  useEffect(() => {
    console.log(`📡 [isUsingCloud TRACE] State changed to: ${isUsingCloud}`);
    logger.logAction('STATE_TRACE_CLOUD_MODE', { 
        value: isUsingCloud, 
        reason: isSyncingRef.current ? 'hydrating/syncing' : 'manual/active' 
    });
  }, [isUsingCloud]);

  // 4. PERSISTENT VERIFICATION PROMPT: Ensure it shows up if unverified
  // Fix: Don't show if user is admin OR already in the Edit Profile modal OR recently verified (latch)
  useEffect(() => {
    // Initialize Firebase
    initializeFirebase();
    const isEmailUnverified = currentUser && !currentUser.isEmailVerified && !verificationLatch.email;
    const isPhoneUnverified = currentUser && !currentUser.isPhoneVerified && !verificationLatch.phone;

    if (currentUser && currentUser.role !== 'admin' && (isEmailUnverified || isPhoneUnverified) && !isProfileEditActive) {
      setShowVerificationPrompt(true);
    } else {
      setShowVerificationPrompt(false);
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.isEmailVerified, currentUser?.isPhoneVerified, isProfileEditActive, verificationLatch]);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout for status check

      const response = await fetch(`${activeApiUrl}/api/status`, {
        signal: controller.signal,
        headers: { 'x-ace-api-key': config.ACE_API_KEY }
      });
      clearTimeout(timeoutId);
      
      if (response.status === 429) {
        console.log("🛑 Rate limited on status check, skipping.");
        return;
      }
      
      // Proactively update online status since we reached the server
      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());
      
      let status;
      try {
        status = await response.json();
      } catch (jsonErr) {
        // Fallback for non-JSON content (e.g. HTML error pages)
        const text = await response.text();
        const snippet = text.substring(0, 100).replace(/\n/g, ' ');
        console.warn(`⚠️ Update check received non-JSON (${response.status}): ${snippet}`);
        logger.logAction('CHECK_UPDATES_PARSE_ERROR', { 
            status: response.status, 
            url: response.url,
            bodyPrefix: snippet 
        });
        return; // Silent fail for background check
      }
      
      if (status.latestAppVersion) {
        setLatestAppVersion(status.latestAppVersion);
        if (isVersionObsolete(APP_VERSION, status.latestAppVersion)) {
          setShowForceUpdate(true);
          return; // Abort further syncs if obsolete
        }
      }

      const isInternalChange = status.lastSocketId === socketRef.current?.id;
      if (isInternalChange && status.lastUpdated) {
          lastServerUpdateRef.current = status.lastUpdated;
          console.log("🛡️ Internal change detected via status check. Skipping pull.");
          return;
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
  }, [loadData]); // Note: loadData is stable via useCallback

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

      // 🛡️ STORAGE NUKE: For version 2.4.9+, force-clear any 'false' setting one time
      const hasNuked = await AsyncStorage.getItem('cloud_nuke_v249');
      let effectiveIwc = iuc;
      if (!hasNuked) {
        console.log("💣 ONE-TIME STORAGE NUKE: Clearing old cloud preference...");
        await storage.removeItem('isUsingCloud');
        await AsyncStorage.setItem('cloud_nuke_v249', 'true');
        effectiveIwc = null; // Forces default to TRUE below
      }

      if (p) setPlayers(p);
      if (t) setTournaments(t);
      if (v) setMatchVideos(v);
      if (m) setMatches(m);
      if (st) setSupportTickets(st);
      if (ev) setEvaluations(ev);
      if (al) setAuditLogs(al);
      if (cm) setChatbotMessages(cm);
      if (matchmakingFromStorage) setMatchmaking(matchmakingFromStorage);
      
        // 🛡️ STALE SYNC GUARD REMOVED in v2.5.1 in favor of Master Merge
        setPendingSync(ps);
        pendingSyncRef.current = ps;
      if (typeof effectiveIwc === 'boolean') {
        console.log("☁️ Hydrated isUsingCloud:", effectiveIwc);
        logger.logAction('HYDRATION_IS_USING_CLOUD', { value: effectiveIwc });
        setIsUsingCloud(effectiveIwc);
        isUsingCloudRef.current = effectiveIwc; // 🛡️ ATOMIC SYNC
      } else if (effectiveIwc && typeof effectiveIwc === 'string') {
        const val = effectiveIwc === 'true';
        console.log("☁️ Hydrated isUsingCloud (string):", val);
        logger.logAction('HYDRATION_IS_USING_CLOUD', { value: val, raw: effectiveIwc });
        setIsUsingCloud(val);
        isUsingCloudRef.current = val; // 🛡️ ATOMIC SYNC
      } else {
        // DEFAULT: Force cloud for new versions if no preference found
        console.log("☁️ No stored cloud preference, defaulting to TRUE");
        setIsUsingCloud(true);
        isUsingCloudRef.current = true; // 🛡️ ATOMIC SYNC
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
    const now = Date.now();
    console.log(`📡 [Sync] loadData called. forceNoLoading=${forceNoLoading}, forceSync=${forceSync}`);
    
    if (syncLockRef.current && !forceSync) {
      console.log("📡 Sync Mutex active, skipping pull.");
      return null;
    }
    
    if (now < globalBackoffUntilRef.current && !forceSync) {
      console.log("⏳ Backoff active, skipping pull until:", new Date(globalBackoffUntilRef.current).toLocaleTimeString());
      return null;
    }

    // First, try to sync any local changes.
    const syncSuccess = await syncPendingData();
    
    // THROTTLE: Prevent background sync more than once every 15 seconds unless forced
    const timeSinceLastSync = now - lastBackgroundSyncRef.current;
    if (!forceSync && timeSinceLastSync < 15000) {
      console.log(`⏱️ Background sync throttled (${timeSinceLastSync}ms since last sync < 15s)`);
      return null;
    }
    
    console.log("🚀 [Sync] Throttle bypassed. Starting cloud fetch...");
    if (!forceNoLoading || forceSync) {
        // Manual or foreground syncs reset the manual timer
        lastManualSyncTimeRef.current = now;
    }
    lastBackgroundSyncRef.current = now;

    if (pendingSyncRef.current.length > 0 && !syncSuccess) {
      console.log("⏳ Local changes pending sync. Keeping current connection state.");
      return false;
    }

    if (!forceNoLoading) setIsLoading(true);
    const versionAtStart = ++syncVersion.current;

    try {
      setSyncingState(true);
      logger.logAction('LOAD_DATA_START', { version: versionAtStart, isBackground: forceNoLoading, forceSync });
      
      if (forceSync && currentUserRef.current) {
        // When manually forcing a sync, also push our latest device info to the cloud
        logger.logAction('MANUAL_SYNC_PUSH_DEVICE_INFO');
        syncAndSaveData({ currentUser: currentUserRef.current });
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 🛡️ Increased to 60s for Render cold starts

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
      
      // CRITICAL: Successfully reached the server, so we ARE online.
      // We set this even if the version below is stale, to ensure UI accuracy.
      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());

      const cloudData = await response.json();
      if (!cloudData || typeof cloudData !== 'object') {
        throw new Error("Invalid data format received from cloud");
      }
      console.log(`✅ [v${versionAtStart}] Data fetched successfully [Keys: ${Object.keys(cloudData).join(', ')}]`);

      // DO NOT proceed with data application if a newer sync has already started
      if (versionAtStart !== syncVersion.current && !forceSync) {
        console.log(`⏳ Discarding stale cloud pull [v${versionAtStart}]`);
        return false;
      }

      if (cloudData.lastUpdated) {
        lastServerUpdateRef.current = cloudData.lastUpdated;
        logger.logAction('LOAD_DATA_SUCCESS', { lastUpdated: cloudData.lastUpdated });
      }

      if (Array.isArray(cloudData.players)) {
        const cleanedPlayers = cloudData.players.filter(p => !!(p && p.id));
        
        // 🛡️ MASTER MERGE: Cloud is the Single Source of Truth
        const localPlayers = playersRef.current || [];
        const playerMap = new Map();

        // 1. Start with Local State (to preserve references/ui state if needed)
        localPlayers.forEach(p => { if (p && p.id) playerMap.set(String(p.id).toLowerCase(), p); });

        // 2. Overlay Cloud State (Cloud always wins on conflict)
        cleanedPlayers.forEach(p => { if (p && p.id) playerMap.set(String(p.id).toLowerCase(), p); });

        const mergedPlayers = Array.from(playerMap.values());
        setPlayers(mergedPlayers);
        storage.setItem('players', mergedPlayers);

        // If cloud had updates for players, we clear any 'pending' player push to prevent rollback
        if (pendingSyncRef.current.includes('players')) {
           setPendingSync(prev => {
             const next = prev.filter(k => k !== 'players');
             storage.setItem('pendingSync', next);
             pendingSyncRef.current = next;
             return next;
           });
        }

        const currentU = currentUserRef.current;
        if (currentU) {
          const currentIdLower = String(currentU.id).toLowerCase();
          const cloudUser = cleanedPlayers.find(p => String(p.id).toLowerCase() === currentIdLower);
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

      if (Array.isArray(cloudData.tournaments) && !pendingSyncRef.current.includes('tournaments')) {
        const cleaned = cloudData.tournaments.map(t => ({
          ...t,
          registeredPlayerIds: Array.isArray(t.registeredPlayerIds) ? t.registeredPlayerIds.filter(pid => !!pid) : [],
          pendingPaymentPlayerIds: Array.isArray(t.pendingPaymentPlayerIds) ? t.pendingPaymentPlayerIds.filter(pid => !!pid) : []
        })).filter(t => t.status !== 'deleted' && !t.isDeleted);
        setTournaments(cleaned);
        storage.setItem('tournaments', cleaned);
      }
      if (cloudData.matchVideos && !pendingSyncRef.current.includes('matchVideos')) {
        setMatchVideos(cloudData.matchVideos);
        storage.setItem('matchVideos', cloudData.matchVideos);
      }
      if (cloudData.matches && !pendingSyncRef.current.includes('matches')) {
        setMatches(cloudData.matches);
        storage.setItem('matches', cloudData.matches);
      }
      if (cloudData.matchmaking && !pendingSyncRef.current.includes('matchmaking')) {
        setMatchmaking(cloudData.matchmaking);
        storage.setItem('matchmaking', cloudData.matchmaking);
      }
      // Write data directly to avoid interaction blocks during initial load
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
      logger.logAction('LOAD_DATA_ERROR', { error: e.message });
      
      // 🛡️ LATENCY HARDENING: Don't flip to "Local" if it's just a timeout or abort
      const isTimeout = e.message?.includes('Aborted') || e.message?.includes('timeout') || e.message?.includes('Network request failed');
      const isRateLimit = e.message?.includes('429');
      
      if (!isRateLimit && !isTimeout) {
        // Only set offline if WebSocket is ALSO dead
        if (socketRef.current?.connected) {
          console.log("📡 HTTP failed but WebSocket alive. Staying online.");
          setIsCloudOnline(true);
        } else {
          setIsCloudOnline(false);
        }
      } else {
        console.log("⏳ Sync delayed by network/latency, keeping state.");
      }
      return false;
    } finally {
      // 🛡️ CRITICAL FIX: Always release the lock regardless of outcome
      if (versionAtStart === syncVersion.current) {
        setSyncingState(false);
        if (!forceNoLoading) setIsLoading(false);
        if (pendingUpdateCheckRef.current) {
           pendingUpdateCheckRef.current = false;
           // Use a small delay to ensure React has finished state updates
           setTimeout(() => checkForUpdates(), 100);
        }
      } else {
        // If versions mismatch, we still need to unlock if THIS sync was the one holding the lock
        setSyncingState(false);
      }
    }
  }, [syncPendingData, checkForUpdates]);
  const pushStateToCloud = useCallback(async (updates) => {
    if (!isUsingCloudRef.current) return;
    
    if (syncLockRef.current) {
      console.log("📡 Sync Mutex active, skipping push.");
      return false;
    }

    const now = Date.now();
    if (now < globalBackoffUntilRef.current) {
      console.log("⏳ Backoff active, skipping push.");
      return false;
    }

    const thisVersion = ++syncVersion.current;
    syncLockRef.current = true;
    try {
      setSyncingState(true);
      logger.logAction('PUSH_DATA_START', { keys: Object.keys(updates), version: thisVersion });
      
      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-suggested.onrender.com' : config.API_BASE_URL;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout for push

      const response = await fetch(`${activeApiUrl}/api/save`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          'x-socket-id': socketRef.current?.id || ''
        },
        body: JSON.stringify(updates)
      });
      clearTimeout(timeoutId);

      if (response.status === 429) {
        console.log("🛑 Server Rate Limit (429). Engaging 60s Global Backoff.");
        globalBackoffUntilRef.current = Date.now() + 60000;
        throw new Error("Server returned 429: Too many requests.");
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server returned ${response.status}: ${errorText}`);
      }
      
      const result = await response.json();
      
      // Clear pending keys ONCE cloud confirms success
      if (updates && typeof updates === 'object' && !Array.isArray(updates)) {
        const keys = Object.keys(updates).filter(k => k !== 'atomicKeys');
        setPendingSync(prev => {
          const next = (prev || []).filter(k => !keys.includes(k));
          storage.setItem('pendingSync', next);
          pendingSyncRef.current = next;
          return next;
        });
      }

      // CRITICAL: Successfully reached the server, so we ARE online.
      setIsCloudOnline(true);

      if (thisVersion === syncVersion.current) {
        lastServerUpdateRef.current = result.lastUpdated;
        logger.logAction('PUSH_DATA_SUCCESS', { lastUpdated: result.lastUpdated });
      }
      return true;
    } catch (error) {
      console.error("❌ Cloud Push Error:", error);
      // 🛡️ LATENCY HARDENING: Don't flip to "Local" if it's just a timeout or abort
      if (!isRateLimit && !isTimeout) {
        if (socketRef.current?.connected) {
           setIsCloudOnline(true);
        } else {
           setIsCloudOnline(false);
        }
      }
      logger.logAction('PUSH_DATA_ERROR', { error: error.message, version: thisVersion });
      return false;
    } finally {
      if (thisVersion === syncVersion.current) {
        setSyncingState(false);
        if (pendingUpdateCheckRef.current) {
           pendingUpdateCheckRef.current = false;
           setTimeout(() => checkForUpdates(), 100);
        }
      } else {
        setSyncingState(false);
      }
    }
  }, [checkForUpdates]);


  const lastActiveUpdateRef = useRef(0);
  const pendingSyncUpdatesRef = useRef({});
  const isPendingAtomicRef = useRef(false);
  const syncTimeoutRef = useRef(null);

  const syncAndSaveData = useCallback(async (updates, isAtomic = false) => {
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
          platformVersion: Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.constants?.Release || Platform.Version} (API ${Platform.Version})`,
          lastActive: now
        };
        updates.currentUser.devices = updates.currentUser.devices || [];
        const dIndex = updates.currentUser.devices.findIndex(d => d.id === localDeviceIdRef.current);
        if (dIndex >= 0) updates.currentUser.devices[dIndex] = myTracker;
        else updates.currentUser.devices.push(myTracker);
        
        // 🛡️ REFINEMENT: Don't force-push the entire players array on every tiny currentUser update
        // This was causing stale local player lists (9) to overwrite cloud lists (14).
        // Only update the specific player record in the local list, but don't mark 'players' as pending.
        const currentP = [...playersRef.current || []];
        const pIndex = currentP.findIndex(p => p.id === updates.currentUser.id);
        if (pIndex >= 0) {
          const updatedP = { ...currentP[pIndex], devices: updates.currentUser.devices };
          currentP[pIndex] = updatedP;
          setPlayers(currentP);
          storage.setItem('players', currentP);
          // Note: We deliberately DON'T add 'players' to 'updates' here 
          // unless it was already part of the requested sync.
        }
      }
    }

    try {
      for (const key in updates) {
        let val = updates[key];
        if (key === 'players' && Array.isArray(val)) {
          val = val.filter(p => !!(p && p.id));
        }
        if (key === 'tournaments' && Array.isArray(val)) {
          val = val.map(t => ({
            ...t,
            registeredPlayerIds: (t.registeredPlayerIds || []).filter(pid => !!pid),
            pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => !!pid)
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

      if (isUsingCloudRef.current) {
        // [Sync Guard] Add modified keys to pendingSync immediately to prevent overwrite by background pull
        const keysToGuard = Object.keys(syncUpdates);
        setPendingSync(prev => {
          const next = [...(prev || [])];
          keysToGuard.forEach(k => { if (!next.includes(k)) next.push(k); });
          storage.setItem('pendingSync', next);
          pendingSyncRef.current = next;
          return next;
        });

        // Collect updates into the pending ref
        Object.assign(pendingSyncUpdatesRef.current, syncUpdates);
        if (isAtomic) isPendingAtomicRef.current = true;

        // ATOMIC ACTION: Bypass debounce and push IMMEDIATELY
        if (isAtomic) {
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;

          const finalUpdates = { ...pendingSyncUpdatesRef.current };
          finalUpdates.atomicKeys = Object.keys(finalUpdates).filter(k => k !== 'atomicKeys');
          
          // Reset trackers BEFORE push to allow next cycle to start fresh
          pendingSyncUpdatesRef.current = {};
          isPendingAtomicRef.current = false;
          
          console.log("🚀 [SyncEngine] Atomic Update Detected. Pushing Immediately:", finalUpdates.atomicKeys);
          await pushStateToCloud(finalUpdates);
        } else {
          // STANDBY: Debounce minor updates (e.g. log traces, simple field edits)
          if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = setTimeout(async () => {
            const finalUpdates = { ...pendingSyncUpdatesRef.current };
            const finalAtomic = isPendingAtomicRef.current;
            
            pendingSyncUpdatesRef.current = {};
            isPendingAtomicRef.current = false;
            syncTimeoutRef.current = null;

            if (finalAtomic) {
              finalUpdates.atomicKeys = Object.keys(finalUpdates).filter(k => k !== 'atomicKeys');
            }
            
            console.log("⏱️ [SyncEngine] Debounced Push Executing...");
            await pushStateToCloud(finalUpdates);
          }, 3000); 
        }
      }
    } catch (error) {
      console.error(`Failed to sync and save data`, error);
    }
  }, [pushStateToCloud, isCloudOnline]);

  // Handlers
  const handleLogin = useCallback(async (role, user) => {
    setCurrentUser(user);
    currentUserRef.current = user;
    setUserRole(role);
    await storage.setItem('currentUser', user);

    syncAndSaveData({ currentUser: user });
    
    setPlayers(prev => {
      const isNew = !(prev || []).some(p => String(p.id).toLowerCase() === String(user.id).toLowerCase());
      if (user && isNew) {
        const updated = [user, ...(prev || [])];
        storage.setItem('players', updated);
        // CRITICAL FIX: Use syncAndSaveData (sets pendingSync guard) instead of pushStateToCloud directly
        syncAndSaveData({ players: updated }, true);
        return updated;
      }
      return prev || [];
    });
    
    await hydrateFromStorage();
    await loadData(true, true);
    
    const pushToken = await storage.getItem('push_token');
    if (pushToken && user?.id) {
      sendTokenToBackend(user.id, pushToken);
    }
  }, [hydrateFromStorage, loadData, syncAndSaveData]);

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
    return new Promise((resolve, reject) => {
      setPlayers(prev => {
        const updatedPlayers = [newPlayer, ...(prev || [])];
        storage.setItem('players', updatedPlayers);
        
        // CRITICAL FIX: Use syncAndSaveData with atomic=true instead of pushStateToCloud directly.
        // This ensures: 1) pendingSync guard is set (blocks background overwrites)
        //               2) atomicKeys are sent in the request body
        //               3) Push happens immediately without debounce
        try {
          syncAndSaveData({ players: updatedPlayers }, true);
          logger.logAction('USER_SIGNUP', { 
            id: newPlayer.id, 
            name: newPlayer.name, 
            role: newPlayer.role,
            cloudSync: 'ATOMIC_PUSH'
          });
          resolve(true);
        } catch (err) {
          console.error('❌ Registration cloud sync failed:', err);
          setPendingSync(prevP => {
            const next = [...(prevP || [])];
            if (!next.includes('players')) next.push('players');
            storage.setItem('pendingSync', next);
            pendingSyncRef.current = next;
            return next;
          });
          resolve(false); // Don't reject — user is still registered locally
        }
        return updatedPlayers;
      });
    });
  }, [syncAndSaveData]);

  const handleSaveTournament = useCallback((t) => {
    setTournaments(prev => {
      const updated = prev.map(item => item.id === t.id ? t : item);
      if (!prev.find(item => item.id === t.id)) updated.unshift(t);
      syncAndSaveData({ tournaments: updated });
      return updated;
    });
  }, [syncAndSaveData]);

  const handleSaveVideo = useCallback((v) => {
    setMatchVideos(prevVideos => {
      const isNew = !(prevVideos || []).find(item => item.id === v.id);
      const updatedVideos = (prevVideos || []).map(item => item.id === v.id ? v : item);
      if (isNew) updatedVideos.unshift(v);
      
      setPlayers(prevPlayers => {
        let updatedPlayers = prevPlayers || [];
        const recipientIds = new Set();

        if (isNew) {
          const match = (matchesRef.current || []).find(m => m.id === v.matchId);
          const tournament = (tournamentsRef.current || []).find(t => t.id === v.tournamentId);
          
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

        const updates = { matchVideos: updatedVideos, players: updatedPlayers };
        
        if (isNew && currentUserRef.current && recipientIds.has(currentUserRef.current.id)) {
          const updatedUser = updatedPlayers.find(p => p.id === currentUserRef.current.id);
          if (updatedUser) {
            setCurrentUser(updatedUser);
            currentUserRef.current = updatedUser;
            updates.currentUser = updatedUser;
          }
        }

        syncAndSaveData(updates);
        return updatedPlayers;
      });

      return updatedVideos;
    });

    setTimeout(() => {
      setMatchVideos(prev => {
        const final = (prev || []).map(item => item.id === v.id ? { ...item, status: 'ready' } : item);
        syncAndSaveData({ matchVideos: final });
        return final;
      });
    }, 5000);
  }, [syncAndSaveData]);

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
    setMatchmaking(prev => {
      syncAndSaveData({ matchmaking: newMatchmaking });
      return newMatchmaking;
    });
  }, [syncAndSaveData]);

  const handleSendUserNotification = useCallback((targetUserId, notification) => {
    setPlayers(prevPlayers => {
      const currentP = prevPlayers || [];
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

      const isMe = currentUserRef.current && String(targetUserId).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
      const targetUser = updatedPlayers.find(p => String(p.id).toLowerCase() === String(targetUserId).toLowerCase());

      if (isMe && targetUser) {
        setCurrentUser(targetUser);
        currentUserRef.current = targetUser;
        syncAndSaveData({ currentUser: targetUser, players: updatedPlayers });
      } else {
        syncAndSaveData({ players: updatedPlayers });
      }
      
      return updatedPlayers;
    });
  }, [syncAndSaveData]);

  const handleSaveTicket = useCallback((ticket) => {
    setSupportTickets(prev => {
      const updated = prev.map(t => t.id === ticket.id ? ticket : t);
      if (!prev.find(t => t.id === ticket.id)) updated.unshift(ticket);
      syncAndSaveData({ supportTickets: updated });
      return updated;
    });
  }, [syncAndSaveData]);

  const handleConfirmCoachRequest = useCallback((t) => {
    if (!currentUserRef.current) return;
    setTournaments(prev => {
      const updated = (prev || []).map(item => item.id === t.id ? { ...item, assignedCoachId: currentUserRef.current.id, coachStatus: 'Coach Confirmed' } : item);
      syncAndSaveData({ tournaments: updated });
      return updated;
    });
  }, [syncAndSaveData]);

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


  const memoizedUser = useMemo(() => {
    if (!currentUser) return null;
    return {
      ...currentUser,
      isEmailVerified: currentUser.isEmailVerified || verificationLatch.email,
      isPhoneVerified: currentUser.isPhoneVerified || verificationLatch.phone,
    };
  }, [currentUser, verificationLatch]);

  const memoizedHandlers = useMemo(() => ({
    onLogin: handleLogin,
    onLogout: handleLogout,
    onResetPassword: async (userId, newPassword) => {
       return new Promise((resolve, reject) => {
         setPlayers(prev => {
           const updatedPlayers = (prev || []).map(p => p.id === userId ? { ...p, password: newPassword } : p);
           storage.setItem('players', updatedPlayers);
           pushStateToCloud({ players: updatedPlayers }, true)
             .then(resolve)
             .catch(reject);
           return updatedPlayers;
         });
       });
     },
    sendUserNotification: handleSendUserNotification,
    loadData: loadData,
    onManualSync: loadData,
    onRegisterUser: handleRegisterUser,
    onToggleCloud: () => {
      setIsUsingCloud(prev => {
        const next = !prev;
        isUsingCloudRef.current = next; // 🛡️ ATOMIC SYNC: Update ref before async load
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
       setPlayers(prev => {
         const updatedPlayers = (prev || []).map(p => String(p.id).toLowerCase() === String(u.id).toLowerCase() ? u : p);
         if (currentUserRef.current?.id === u.id) {
           setCurrentUser(u);
           currentUserRef.current = u;
           syncAndSaveData({ currentUser: u, players: updatedPlayers });
         } else {
           syncAndSaveData({ players: updatedPlayers });
         }
         return updatedPlayers;
       });
    },
    onLogTrace: handleLogTrace,
    onVerifyAccount: (type) => {
        // Latch the local state to prevent flip-flopping during cloud sync
        setVerificationLatch(prev => ({ ...prev, [type]: true }));
        
        setPlayers(prev => {
          const currentU = currentUserRef.current;
          if (!currentU) return prev || [];
          const updatedUser = { ...currentU, [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true };
          const updatedPlayers = (prev || []).map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p);
          
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          syncAndSaveData({ currentUser: updatedUser, players: updatedPlayers });
          
          return updatedPlayers;
        });

        // Release latch after 5 minutes (more than enough for cloud sync to settle)
        setTimeout(() => {
          setVerificationLatch(prev => ({ ...prev, [type]: false }));
        }, 300000);
    },
    onBatchUpdate: (updates) => handleSyncUpdate(updates),
    isCloudOnline,
    isSyncing,
    lastSyncTime,
    isUsingCloud,
    onTopUp: (amount) => {
       setPlayers(prev => {
         if (!currentUserRef.current) return prev || [];
         const uid = currentUserRef.current.id;
         const user = (prev || []).find(p => p.id === uid);
         if (!user) return prev || [];

         const updatedUser = {
           ...user,
           credits: (user.credits || 0) + amount,
           walletHistory: [
             { id: Date.now().toString(), type: 'credit', amount, description: 'Wallet Top Up', date: new Date().toISOString() }, 
             ...(user.walletHistory || [])
           ]
         };

         const updatedPlayers = (prev || []).map(p => String(p.id).toLowerCase() === String(uid).toLowerCase() ? updatedUser : p);
         
         setCurrentUser(updatedUser);
         currentUserRef.current = updatedUser;
         syncAndSaveData({ players: updatedPlayers, currentUser: updatedUser });
         
         Alert.alert("Success", `₹${amount} added!`);
         return updatedPlayers;
       });
     },
    onReplyTicket: (id, text, image, replyToMsg) => {
       setSupportTickets(prev => {
         const msgText = typeof text === 'string' ? text : (text?.text || String(text || ''));
         const msg = { senderId: currentUserRef.current?.id || 'admin', text: msgText, timestamp: new Date().toISOString() };
         if (image) msg.image = image;
         if (replyToMsg) msg.replyTo = { text: replyToMsg.text || '', senderId: replyToMsg.senderId || '' };
         
         const updated = (prev || []).map(t => t && t.id === id ? { ...t, messages: [...(t.messages || []), msg] } : t);
         syncAndSaveData({ supportTickets: updated });
         return updated;
       });
     },
    onUpdateTicketStatus: (id, status) => {
      setSupportTickets(prev => {
        const updated = (prev || []).map(t => t && t.id === id ? { ...t, status } : t);
        syncAndSaveData({ supportTickets: updated });
        return updated;
      });
    },
    onSaveTicket: handleSaveTicket,
    onSaveEvaluation: (e) => {
      setEvaluations(prevEval => {
        const updatedEval = prevEval.map(item => item.id === e.id ? e : item);
        if (!prevEval.find(item => item.id === e.id)) updatedEval.unshift(e);
        syncAndSaveData({ evaluations: updatedEval });
        
        // Finalize Referral Rewards if this is proof of participation
        setPlayers(prevPlayers => {
          const referee = prevPlayers.find(p => p.id === e.playerId);
          if (referee && referee.referredBy) {
            // Check if this is the first evaluation for this player across all tournaments
            const prevEvalsRec = updatedEval.filter(ev => ev.playerId === e.playerId);
            if (prevEvalsRec.length === 1) { // This is their first match evaluation
              const updatedPlayers = prevPlayers.map(p => {
                // Finalize Referee
                if (p.id === referee.id) {
                  const refereePendingId = `ref-pending-${p.id}`;
                  const history = p.walletHistory || [];
                  const entryIdx = history.findIndex(h => h.id === refereePendingId && h.status === 'Pending');
                  if (entryIdx > -1) {
                    const newHistory = [...history];
                    newHistory[entryIdx] = { ...newHistory[entryIdx], status: 'Completed', description: 'Referral Reward (Completed - Played Tournament)' };
                    return { ...p, walletHistory: newHistory, credits: (p.credits || 0) + 100 };
                  }
                }
                // Finalize Referrer
                if (p.id === referee.referredBy) {
                  const referrerPendingId = `bonus-pending-${referee.id}`;
                  const history = p.walletHistory || [];
                  const entryIdx = history.findIndex(h => h.id === referrerPendingId && h.status === 'Pending');
                  if (entryIdx > -1) {
                    const newHistory = [...history];
                    newHistory[entryIdx] = { ...newHistory[entryIdx], status: 'Completed', description: `Referral Bonus: ${referee.id} (Tournament Played)` };
                    return { ...p, walletHistory: newHistory, credits: (p.credits || 0) + 100 };
                  }
                }
                return p;
              });
              
              // If current user is either referee or referrer, update their session too
              if (currentUserRef.current) {
                const me = updatedPlayers.find(p => p.id === currentUserRef.current.id);
                if (me) {
                  setCurrentUser(me);
                  currentUserRef.current = me;
                }
              }
              
              syncAndSaveData({ players: updatedPlayers, currentUser: currentUserRef.current });
              return updatedPlayers;
            }
          }
          return prevPlayers;
        });

        return updatedEval;
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
      if (!t || !Array.isArray(tournaments)) return;
      const updated = tournaments.map(item => item && item.id === t.id ? { ...item, coachStatus: 'Declined' } : item);
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
    },
    onStartTournament: (tid) => {
      setTournaments(prev => {
        const updated = (prev || []).map(t => t.id === tid ? { ...t, tournamentStarted: true, status: 'ongoing' } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onEndTournament: (tid) => {
      setTournaments(prev => {
        const updated = (prev || []).map(t => t.id === tid ? { ...t, status: 'completed', tournamentConcluded: true } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
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
    onDeleteTournament: (tid) => {
      setTournaments(prev => {
        const list = prev || [];
        // Soft delete: Mark it as deleted so the server knows to remove it from DB
        const softDeletedList = list.map(t => t.id === tid ? { ...t, status: 'deleted', isDeleted: true } : t);
        
        // Filter out for immediate local UI update
        const updated = softDeletedList.filter(t => t.id !== tid);
        
        // PUSH the soft-deleted list to ensure server gets the deletion signal
        syncAndSaveData({ tournaments: softDeletedList }, true);
        
        return updated;
      });
    },
    onUpdateVideoStatus: (vid, status) => {
      setMatchVideos(prev => {
        const updated = (prev || []).map(v => v && v.id === vid ? { ...v, adminStatus: status } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onBulkUpdateVideoStatus: (ids, status) => {
      setMatchVideos(prev => {
        const updated = (prev || []).map(v => v && ids.includes(v.id) ? { ...v, adminStatus: status } : v);
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onBulkPermanentDeleteVideos: (ids) => {
      setMatchVideos(prev => {
        const updated = (prev || []).filter(v => v && !ids.includes(v.id));
        syncAndSaveData({ matchVideos: updated }, true); 
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
      setMatchVideos(prevVideos => {
        const video = prevVideos.find(v => v.id === id);
        if (!video) return prevVideos;

        const updatedVideos = prevVideos.map(v => v.id === id ? { ...v, adminStatus: 'Removed' } : v);
        
        setPlayers(prevPlayers => {
          const updatedPlayers = (prevPlayers || []).map(player => {
            let credits = player.credits || 0;
            let pVideos = player.purchasedVideos || [];
            if (pVideos.includes(id)) { 
              credits += (video.price || 0); 
              pVideos = pVideos.filter(vid => vid !== id); 
            }
            return { ...player, credits, purchasedVideos: pVideos };
          });
          
          syncAndSaveData({ matchVideos: updatedVideos, players: updatedPlayers });
          return updatedPlayers;
        });

        return updatedVideos;
      });
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
        syncAndSaveData({ matchVideos: updated }, true);
        return updated;
      });
    },
    onCancelVideo: (id) => {
      setMatchVideos(prev => {
        const updated = prev.filter(v => v.id !== id);
        syncAndSaveData({ matchVideos: updated }, true);
        return updated;
      });
    },
    onRequestDeletion: (id, reason) => {
      setMatchVideos(prev => {
        const updated = (prev || []).map(v => v && v.id === id ? { ...v, adminStatus: 'Deletion Requested', deletionReason: reason } : v);
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
      
      setPlayers(prev => {
        const updatedUser = { 
          ...currentUserRef.current, 
          credits: method === 'wallet' ? (currentUserRef.current.credits || 0) - 20 : (currentUserRef.current.credits || 0), 
          purchasedHighlights: [...(currentUserRef.current.purchasedHighlights || []), vid] 
        };
        const updatedPlayers = prev.map(p => p.id === currentUserRef.current.id ? updatedUser : p);
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
        syncAndSaveData({ currentUser: updatedUser, players: updatedPlayers });
        return updatedPlayers;
      });
    },
    onVideoPlay: (vid, uid) => {
      if (!Array.isArray(matchVideos)) return;
      setMatchVideos(prev => {
        const updated = (prev || []).map(v => {
          if (v && v.id === vid) { const currentViewers = v.viewerIds || []; if (!uid || currentViewers.includes(uid)) return v; return { ...v, viewerIds: [...currentViewers, uid] }; }
          return v;
        });
        syncAndSaveData({ matchVideos: updated });
        return updated;
      });
    },
    onToggleFavourite: (vid) => {
      if (!currentUserRef.current) return;
      
      setPlayers(prev => {
        const currentU = currentUserRef.current;
        if (!currentU) return prev || [];
        const isFav = (currentU.favouritedVideos || []).includes(vid);
        const updatedFavs = isFav ? (currentU.favouritedVideos || []).filter(id => id !== vid) : [...(currentU.favouritedVideos || []), vid];
        const updatedUser = { ...currentU, favouritedVideos: updatedFavs };
        const updatedPlayers = (prev || []).map(p => p && String(p.id).toLowerCase() === String(currentU.id).toLowerCase() ? updatedUser : p);
        
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
        syncAndSaveData({ players: updatedPlayers, currentUser: updatedUser });
        return updatedPlayers;
      });
    },
    onUpdateTournament: (t) => handleSaveTournament(t),
    onSaveCoachComment: (tid, comment) => {
      if (!currentUserRef.current) return;
      setTournaments(prev => {
        const updated = (prev || []).map(t => t && t.id === tid ? { ...t, coachComments: [...(t.coachComments || []), { id: Date.now(), coachId: currentUserRef.current.id, text: comment, timestamp: new Date().toISOString() }] } : t);
        syncAndSaveData({ tournaments: updated });
        return updated;
      });
    },
    onRegister: (t, method, totalCost, isRescheduling, reschedulingFrom) => {
      if (!currentUserRef.current || !t) return;
      
      const userId = currentUserRef.current.id;
      
      setTournaments(prevT => {
        const updatedT = (prevT || []).map(item => {
          if (item && item.id === t.id) {
            return {
              ...item,
              registeredPlayerIds: [...new Set([...(item.registeredPlayerIds || []), userId])]
            };
          }
          return item;
        });

        setPlayers(prevP => {
          if (!currentUserRef.current) return prevP || [];
          
          const isFirstRegistration = (currentUserRef.current.registeredTournamentIds || []).length === 0;
          const referralBonus = (isFirstRegistration && currentUserRef.current.referredBy) ? 100 : 0;
          
          let updatedUser = {
            ...currentUserRef.current,
            registeredTournamentIds: [...new Set([...(currentUserRef.current.registeredTournamentIds || []), t.id])]
          };
          
          if (referralBonus > 0) {
            updatedUser.credits = (updatedUser.credits || 0) + referralBonus;
            updatedUser.walletHistory = [
              { id: `ref-ref-${Date.now()}`, amount: referralBonus, type: 'credit', description: `Referral Reward (Referee Bonus)`, date: new Date().toISOString() },
              ...(updatedUser.walletHistory || [])
            ];
          }

          let updatedPlayers = (prevP || []).map(p => p && String(p.id).toLowerCase() === String(userId).toLowerCase() ? updatedUser : p);
          
          // If referral bonus applies, also reward the referrer
          if (referralBonus > 0 && currentUserRef.current.referredBy) {
            const referrerId = currentUserRef.current.referredBy;
            updatedPlayers = updatedPlayers.map(p => {
              if (String(p.id).toLowerCase() === String(referrerId).toLowerCase()) {
                return {
                  ...p,
                  credits: (p.credits || 0) + 100,
                  walletHistory: [
                    { id: `ref-sor-${Date.now()}`, amount: 100, type: 'credit', description: `Referral Reward (Referrer Bonus for ${updatedUser.name})`, date: new Date().toISOString() },
                    ...(p.walletHistory || [])
                  ]
                };
              }
              return p;
            });
          }

          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          
          syncAndSaveData({ 
            tournaments: updatedT, 
            players: updatedPlayers, 
            currentUser: updatedUser 
          });
          
          if (referralBonus > 0) {
            Alert.alert("Referral Reward!", "You and your referrer have both earned ₹100 for your first tournament registration!");
          }

          return updatedPlayers;
        });
        
        return updatedT;
      });
    },
    onReschedule: (t) => setReschedulingFrom(t.id),
    onCancelReschedule: () => setReschedulingFrom(null),
    onOptOut: (t) => {
      if (!currentUserRef.current || !t) return;
      const userId = currentUserRef.current.id;
      
      setTournaments(prevT => {
        const updatedTournaments = (prevT || []).map(item => 
          item && item.id === t.id ? { ...item, registeredPlayerIds: (item.registeredPlayerIds || []).filter(pid => pid !== userId) } : item
        );
        
        setPlayers(prevP => {
          if (!currentUserRef.current) return prevP || [];
          const updatedUser = {
            ...currentUserRef.current,
            registeredTournamentIds: (currentUserRef.current.registeredTournamentIds || []).filter(id => id !== t.id)
          };
          const updatedPlayers = (prevP || []).map(p => p && String(p.id).toLowerCase() === String(userId).toLowerCase() ? updatedUser : p);
          
          setCurrentUser(updatedUser);
          currentUserRef.current = updatedUser;
          
          syncAndSaveData({ 
            tournaments: updatedTournaments,
            players: updatedPlayers,
            currentUser: updatedUser
          });
          
          return updatedPlayers;
        });

        return updatedTournaments;
      });
    },
    onBack: () => { setViewingLanding(true); setShowSignup(false); setShowOnboarding(false); },
    onSignup: () => {
      console.log("➡️ App Navigator: onSignup requested");
      setShowSignup(true);
    }
  }), [
    handleLogin, handleLogout, handleSendUserNotification, loadData, handleUpdateMatchmaking, 
    handleRegisterUser, handleSaveTournament, handleSaveVideo, handleSyncUpdate, handleLogTrace, 
    handleSaveTicket, handleConfirmCoachRequest, handleUploadLogs, isUploadingLogs, isCloudOnline, 
    isSyncing, lastSyncTime, isUsingCloud, players, tournaments, seenAdminActionIds, visitedAdminSubTabs,
    matchVideos, matches, supportTickets, evaluations, chatbotMessages, verificationLatch
  ]);


  const memoizedPlayers = useMemo(() => {
    if (!currentUser) return players;
    const exists = players.some(p => String(p.id).toLowerCase() === String(currentUser.id).toLowerCase());
    if (exists) return players;
    return [currentUser, ...players];
  }, [players, currentUser]);

  // Migration: Ensure all players have referral codes EXACTLY ONCE
  React.useEffect(() => {
    if (!isLoading && players.length > 0 && players.some(p => !p.referralCode)) {
      setPlayers(prev => {
        const needsUpdate = prev.some(p => !p.referralCode);
        if (!needsUpdate) return prev;
        
        const updated = prev.map(p => {
          if (!p.referralCode) {
            return {
              ...p,
              referralCode: `ACE-${(p.id || 'PLAYER').substring(0, 5).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
            };
          }
          return p;
        });
        syncAndSaveData({ players: updated });
        return updated;
      });
    }
  }, [isLoading, players.length]);

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

  if (viewingLanding && !memoizedUser) {
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

  if (!memoizedUser) {
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
        onRefreshData={async () => {
          const result = await loadData(true, true);
          return result;
        }}
      />
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
          user={memoizedUser}
          isCloudOnline={isCloudOnline}
          isUsingCloud={isUsingCloud}
          lastSyncTime={lastSyncTime}
          role={userRole}
          appVersion={APP_VERSION}
          players={memoizedPlayers}
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
