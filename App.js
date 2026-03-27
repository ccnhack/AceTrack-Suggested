import React, { useState, useEffect, useRef } from 'react';
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
import SignupScreen from './screens/SignupScreen';
import { initializeFirebase } from './utils/firebaseAuth';

if (Platform.OS === 'web') {
  const iconFontStyles = `@font-face {
    src: url('https://unpkg.com/react-native-vector-icons@10.0.3/Fonts/Ionicons.ttf');
    font-family: Ionicons;
  }`;
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(iconFontStyles));
  document.head.appendChild(style);
}

const APP_VERSION = Platform.OS === 'web' ? '2.1.4-web' : '2.1.4';

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
  const isSyncingRef = React.useRef(false);
  const pendingSyncRef = React.useRef([]);
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
        console.log("📱 App returned to foreground, checking for cloud updates...");
        loadData(true); // Don't show loading spinner for foreground return
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

  const checkForUpdates = async () => {
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
  };

  const hydrateFromStorage = async () => {
    console.log("📦 Hydrating app state from local storage...");
    try {
      const [p, t, v, m, st, ev, al, cm, ps, u, iuc, saids, vats] = await Promise.all([
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
        storage.getItem('visitedAdminSubTabs')
      ]);

      if (p) setPlayers(p);
      if (t) setTournaments(t);
      if (v) setMatchVideos(v);
      if (m) setMatches(m);
      if (st) setSupportTickets(st);
      if (ev) setEvaluations(ev);
      if (al) setAuditLogs(al);
      if (cm) setChatbotMessages(cm);
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

      if (u) {
        setCurrentUser(u);
        currentUserRef.current = u;
        logger.logAction('HYDRATION_USER_RESTORED', { userId: u.id, role: u.role });
        
        // IMMEDIATE SYNC: Update device footprint upon startup restore
        syncAndSaveData({ currentUser: u });
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
        logger.logAction('HYDRATION_USER_MISSING');
      }
      return true;
    } catch (e) {
      console.error("❌ Hydration failed:", e);
      return false;
    }
  };

  const syncPendingData = async () => {
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
      // Note: We don't call loadData() here because syncPendingData
      // is usually called FROM loadData() which will continue its fetch.
    }
    return success;
  };

  const loadData = async (forceNoLoading = false, forceSync = false) => {
    if (isSyncingRef.current && !forceSync) {
      console.log("📡 Sync already in progress, skipping background loadData");
      return;
    }

    // First, try to sync any local changes.
    // If we have pending data and sync fails, we MUST NOT pull from cloud
    // because cloud data is now "stale" compared to our local offline work.
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
      console.log("✅ Cloud data received. Keys:", Object.keys(cloudData));
      if (cloudData.tournaments) console.log(`🏆 Cloud Tournaments: ${cloudData.tournaments.length}`);

      // DO NOT proceed if a newer sync has already started
      if (versionAtStart !== syncVersion.current && !forceSync) {
        console.log(`⏳ Discarding stale cloud pull [v${versionAtStart}]`);
        return false;
      }

      console.log("✅ Cloud data received. Applying updates...");
      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());

      if (cloudData.lastUpdated) {
        lastServerUpdateRef.current = cloudData.lastUpdated;
        logger.logAction('LOAD_DATA_SUCCESS', { lastUpdated: cloudData.lastUpdated });
      } else {
        logger.logAction('LOAD_DATA_LOCAL_ONLY');
      }

      // Update states and storage simultaneously
      if (cloudData.players) {
        // CLEANUP: Filter out ghost players (ID: test) and nulls
        cloudData.players = cloudData.players.filter(p => p && p.id && String(p.id).toLowerCase() !== 'test');
        console.log(`👥 Cloud Sync: Received ${cloudData.players.length} players.`);
        logger.logAction('CLOUD_PLAYERS_SYNC', { 
          count: cloudData.players.length, 
          players: cloudData.players.map(p => ({ id: p.id, name: p.name, avatar: p.avatar })) 
        });
        setPlayers(cloudData.players);
        storage.setItem('players', cloudData.players);

        // Refresh local user from cloud list if logged in
        const currentU = currentUserRef.current;
        if (currentU) {
          const cloudUser = cloudData.players.find(p => String(p.id).toLowerCase() === String(currentU.id).toLowerCase());
          if (cloudUser) {
            if (cloudUser.avatar !== currentU.avatar) {
              logger.logAction('USER_AVATAR_CLOUD_OVERWRITE', { 
                 old: currentU.avatar, 
                 new: cloudUser.avatar 
              });
            }
            // ONLY update if data actually changed to prevent render loops
            const hasChanged = JSON.stringify(cloudUser) !== JSON.stringify(currentU);
            if (hasChanged) {
              console.log("🔄 Cloud user data differ from local. Updating state.");
              setCurrentUser(cloudUser);
              currentUserRef.current = cloudUser;
              setUserRole(cloudUser.role || 'user');
              storage.setItem('currentUser', cloudUser);
            }
            
            // CRITICAL FIX: Update independent admin states and their storage keys from the cloud profile
            if (cloudUser.role === 'admin') {
              if (cloudUser.seenAdminActionIds) {
                const normalized = new Set(cloudUser.seenAdminActionIds.map(id => String(id)));
                setSeenAdminActionIds(normalized);
                storage.setItem('seenAdminActionIds', Array.from(normalized));
                logger.logAction('BADGE_HYDRATION_CLOUD', { count: normalized.size, sample: Array.from(normalized).slice(0, 3) });
              }
              if (cloudUser.visitedAdminSubTabs) {
                const vats = new Set(cloudUser.visitedAdminSubTabs);
                setVisitedAdminSubTabs(vats);
                storage.setItem('visitedAdminSubTabs', Array.from(vats));
              }
            }
          }
        }
      }

      if (cloudData.tournaments) {
        // CLEANUP: Filter out 'test' from all player lists
        cloudData.tournaments = cloudData.tournaments.map(t => ({
          ...t,
          registeredPlayerIds: (t.registeredPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test'),
          pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => pid && String(pid).toLowerCase() !== 'test')
        }));
        setTournaments(cloudData.tournaments);
        storage.setItem('tournaments', cloudData.tournaments);
      }
      if (cloudData.matchVideos) {
        setMatchVideos(cloudData.matchVideos);
        storage.setItem('matchVideos', cloudData.matchVideos);
      }
      if (cloudData.matches) {
        setMatches(cloudData.matches);
        storage.setItem('matches', cloudData.matches);
      }
      if (cloudData.supportTickets) {
        setSupportTickets(cloudData.supportTickets);
        storage.setItem('supportTickets', cloudData.supportTickets);
      }
      if (cloudData.evaluations) {
        setEvaluations(cloudData.evaluations);
        storage.setItem('evaluations', cloudData.evaluations);
      }
      if (cloudData.auditLogs) {
        setAuditLogs(cloudData.auditLogs);
        storage.setItem('auditLogs', cloudData.auditLogs);
      }
      if (cloudData.chatbotMessages) {
        setChatbotMessages(cloudData.chatbotMessages);
        storage.setItem('chatbotMessages', cloudData.chatbotMessages);
      }

      console.log(`✅ [v${versionAtStart}] loadData completed successfully`);
      return cloudData;
    } catch (e) {
      console.log("📡 Cloud unreachable or error:", e.message);
      setIsCloudOnline(false);
      await hydrateFromStorage();
      return false;
    } finally {
      if (versionAtStart === syncVersion.current) {
        setSyncingState(false);
        // Only hide loading if this was a blocking load (sync version matches)
        if (!forceNoLoading) setIsLoading(false);
      }
    }
  };

  const pushStateToCloud = async (updates) => {
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

      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      const result = await response.json();
      
      if (thisVersion === syncVersion.current) {
        lastServerUpdateRef.current = result.lastUpdated;
        logger.logAction('PUSH_DATA_SUCCESS', { lastUpdated: result.lastUpdated });
      } else {
        console.log(`☁️ [v${thisVersion}] finished, but v${syncVersion.current} is now active.`);
      }
      return true;
    } catch (error) {
      console.error("❌ Cloud Push Error:", error);
      logger.logAction('PUSH_DATA_ERROR', { error: error.message, version: thisVersion });
      return false;
    } finally {
      // Failsafe: only clear syncing if this was the latest intended push
      if (thisVersion === syncVersion.current) {
        setSyncingState(false);
      }
    }
  };


  const syncAndSaveData = async (updates) => {
    // 0. Transparently inject this device hardware footprint into the cloud update
    if (updates.currentUser && localDeviceIdRef.current) {
      const myTracker = {
        id: localDeviceIdRef.current,
        name: Constants.deviceName || Platform.OS,
        appVersion: APP_VERSION,
        platformVersion: `${Platform.OS === 'ios' ? 'iOS' : 'Android'} ${Platform.Version}`,
        lastActive: Date.now()
      };
      updates.currentUser.devices = updates.currentUser.devices || [];
      const dIndex = updates.currentUser.devices.findIndex(d => d.id === localDeviceIdRef.current);
      if (dIndex >= 0) updates.currentUser.devices[dIndex] = myTracker;
      else updates.currentUser.devices.push(myTracker);
      
      // MIRROR TO GLOBAL PLAYERS ARRAY FOR PERMANENT ANCHORING
      if (!updates.players) {
        updates.players = [...playersRef.current];
      }
      const pIndex = updates.players.findIndex(p => p.id === updates.currentUser.id);
      if (pIndex >= 0) {
        updates.players[pIndex] = { ...updates.players[pIndex], devices: updates.currentUser.devices };
        setPlayers(updates.players);
      }
    }

    try {
      // 1. Save all keys to local storage for offline support
      for (const key in updates) {
        let val = updates[key];
        // SAFETY: Filter out ghost data during sync
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

      // 2. Identify syncable keys
      const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser'];
      const syncUpdates = {};
      let hasSyncable = false;

      for (const key in updates) {
        if (syncableKeys.includes(key)) {
          syncUpdates[key] = updates[key];
          hasSyncable = true;
        }
      }

      if (!hasSyncable) return;

      // 3. IMMEDIATE SYNC: Always push if there's a synced key. 
      // pushStateToCloud increments versioning to handle stale background pulls.
      if (isUsingCloudRef.current && isCloudOnline) {
        const success = await pushStateToCloud(syncUpdates);
        if (!success) {
          // If push failed, mark all syncable keys as "dirty" for later retry
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
          console.log(`⚠️ Updates for ${Object.keys(syncUpdates).join(', ')} marked as pending sync (offline)`);
        }
      }
    } catch (e) {
      console.error(`Failed to sync and save data`, e);
    }
  };

  // Handlers
  const handleLogin = async (role, user) => {
    setCurrentUser(user);
    currentUserRef.current = user;
    setUserRole(role);
    await storage.setItem('currentUser', user);

    // IMMEDIATE SYNC: Update device footprint upon login
    syncAndSaveData({ currentUser: user });
    
    // Ensure logged in user is in players list (case-insensitive check)
    const isNew = !players.some(p => String(p.id).toLowerCase() === String(user.id).toLowerCase());
    if (user && isNew) {
      const updated = [user, ...players];
      setPlayers(updated);
      await storage.setItem('players', updated);
      await pushStateToCloud({ players: updated });
    }
    
    // STEP 1: Immediately hydrate from local storage for instant UI.
    // This gives users data right away, even if cloud is slow.
    await hydrateFromStorage();
    
    // STEP 2: Then attempt cloud pull to get the absolute latest data.
    // Use 30s timeout for Render.com cold starts.
    await loadData(true, true);
    console.log('✅ Login sync complete.');

    // STEP 3: Check for verification status
    // This is now handled by a useEffect hook to ensure it triggers consistently
    // after all data is loaded and currentUser is stable.
  };

  const handleLogout = async () => {
    // 1. Clear auth state FIRST so polling guard stops immediately
    currentUserRef.current = null;
    setCurrentUser(null);
    setUserRole(null);
    
    // 2. Reset sync state to prevent any stuck locks
    setSyncingState(false);
    
    // 3. Reset state to mock data so LoginScreen can still validate credentials.
    //    We do NOT clear shared data from storage — tournaments, players, etc. are
    //    GLOBAL shared data (not per-user). Keeping them in storage means the next
    //    login will show data instantly via hydrateFromStorage(), even if the cloud
    //    is slow or unreachable (Render cold start).
    setPlayers([CURRENT_PLAYER, ...OTHER_PLAYERS]);
    setTournaments(TOURNAMENTS);
    setMatchVideos(MATCH_VIDEOS);
    setSupportTickets(SUPPORT_TICKETS);
    setMatches(MATCHES);
    setEvaluations([]);
    setChatbotMessages({});
    setPendingSync([]);
    pendingSyncRef.current = [];
    
    // 4. Only clear user-specific storage key. Shared data stays for next login.
    await storage.removeItem('currentUser');
    await storage.removeItem('pendingSync');
    console.log("🧹 Auth state cleared on logout (shared data preserved in storage)");
  };

  const handleRegisterUser = async (newPlayer) => {
    // 1. Update local state
    const updatedPlayers = [newPlayer, ...players];
    setPlayers(updatedPlayers);
    
    // 2. Persist to storage
    await storage.setItem('players', updatedPlayers);
    
    // 3. Sync to cloud IMMEDIATELY and wait for it
    console.log(`📝 Registering new user to CLOUD: ${newPlayer.id}`);
    const success = await pushStateToCloud({ players: updatedPlayers }, true); // FORCE CLOUD for registration
    
    logger.logAction('USER_SIGNUP', { 
      id: newPlayer.id, 
      name: newPlayer.name, 
      role: newPlayer.role,
      cloudSync: success ? 'SUCCESS' : 'PENDING'
    });
    
    if (!success) {
      // If sync fails, mark as pending
      setPendingSync(prev => {
        const next = [...prev];
        if (!next.includes('players')) next.push('players');
        storage.setItem('pendingSync', next);
        return next;
      });
    }
    return success;
  };

  const handleSaveTournament = (t) => {
    const updated = tournaments.map(item => item.id === t.id ? t : item);
    if (!tournaments.find(item => item.id === t.id)) updated.unshift(t);
    setTournaments(updated);
    syncAndSaveData({ tournaments: updated });
  };

  const handleSaveVideo = (v) => {
    const isNew = !matchVideos.find(item => item.id === v.id);
    const updatedVideos = matchVideos.map(item => item.id === v.id ? v : item);
    if (isNew) updatedVideos.unshift(v);
    
    let updatedPlayers = players;
    const recipientIds = new Set();

    if (isNew) {
      const match = matches.find(m => m.id === v.matchId);
      const tournament = tournaments.find(t => t.id === v.tournamentId);
      
      [
        ...(match?.player1Id ? [match.player1Id] : []),
        ...(match?.player2Id ? [match.player2Id] : []),
        ...(tournament?.assignedCoachId ? [tournament.assignedCoachId] : [])
      ].forEach(id => recipientIds.add(id));

      updatedPlayers = players.map(p => {
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

    const updates = {
      matchVideos: updatedVideos,
      players: updatedPlayers
    };

    if (isNew && currentUser && recipientIds.has(currentUser.id)) {
      const updatedUser = updatedPlayers.find(p => p.id === currentUser.id);
      setCurrentUser(updatedUser);
      updates.currentUser = updatedUser;
    }

    syncAndSaveData(updates);

    if (isNew && recipientIds.size > 0) {
      Alert.alert(
        "Video Uploaded",
        `Notifications sent to ${recipientIds.size} participants for match ${v.matchId}.`
      );
    }

    // Processing simulation (remains local-only until finished)
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
        console.log(`--- VIDEO ${v.id} PROCESSING COMPLETE ---`);
      }, 5000);
    }
  };

  const handleSyncUpdate = async (updates) => {
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
  };

  const handleLogTrace = (action, targetType, targetId, details, adminId = 'system') => {
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
  };

  const handlers = {
    onLogin: (role, user) => {
      logger.logAction('USER_LOGIN', { id: user.id, email: user.email, role: role });
      handleLogin(role, user);
    },
    onLogout: () => {
      if (currentUser) logger.logAction('USER_LOGOUT', { id: currentUser.id });
      handleLogout();
    },
    onResetPassword: async (userId, newPassword) => {
      const updatedPlayers = players.map(p => 
        p.id === userId ? { ...p, password: newPassword } : p
      );
      setPlayers(updatedPlayers);
      await storage.setItem('players', updatedPlayers);
      return await pushStateToCloud({ players: updatedPlayers }, true);
    },
    loadData: loadData,
    onToggleCloud: () => {
      const newValue = !isUsingCloud;
      setIsUsingCloud(newValue);
      storage.setItem('isUsingCloud', newValue);
      logger.logAction('ENV_SWITCH', { isUsingCloud: newValue });
      // Give state a moment to settle then reload
      setTimeout(() => {
        setIsLoading(true);
        loadData(true, true);
      }, 100);
    },
    isUsingCloud,
    seenAdminActionIds,
    setSeenAdminActionIds: (ids) => {
      const normalized = new Set(Array.from(ids).map(id => String(id)));
      setSeenAdminActionIds(normalized);
      storage.setItem('seenAdminActionIds', Array.from(normalized));
      if (currentUserRef.current?.role === 'admin') {
        handleSyncUpdate({ 
          currentUser: { ...currentUserRef.current, seenAdminActionIds: Array.from(normalized) } 
        });
      }
    },
    visitedAdminSubTabs,
    setVisitedAdminSubTabs: (tabs) => {
      setVisitedAdminSubTabs(tabs);
      storage.setItem('visitedAdminSubTabs', Array.from(tabs));
      if (currentUserRef.current?.role === 'admin') {
        handleSyncUpdate({ 
          currentUser: { ...currentUserRef.current, visitedAdminSubTabs: Array.from(tabs) } 
        });
      }
    },
    setIsProfileEditActive, // Pass setter to ProfileScreen
    onSaveTournament: handleSaveTournament,
    onSaveVideo: handleSaveVideo,
    onUpdateUser: (u) => { 
       // Required for new Session Sandbox: mutating local currentUser requires explicitly matching the global players array
       const currentP = playersRef.current;
       const updatedPlayers = currentP.map(p => 
          String(p.id).toLowerCase() === String(u.id).toLowerCase() ? u : p
       );
       handleSyncUpdate({ currentUser: u, players: updatedPlayers });
    },
    onLogTrace: handleLogTrace,
    onManualSync: () => {
      logger.logAction('Manual Sync Clicked');
      loadData(true, true); // Don't show full-screen loader for force sync
    },
    onRegisterUser: handleRegisterUser,
    onVerifyAccount: (type) => {
      const currentU = currentUserRef.current;
      const currentP = playersRef.current;
      if (!currentU) return;
      
      const updatedUser = {
        ...currentU,
        [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true
      };
      
      const updatedPlayers = currentP.map(p => 
        String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
      );
      
      handleSyncUpdate({ currentUser: updatedUser, players: updatedPlayers });
      console.log(`✅ ${type} verification synchronized for user ${updatedUser.id}`);
    },
    onBatchUpdate: (updates) => {
        handleSyncUpdate(updates);
    },
    isCloudOnline,
    isSyncing,
    lastSyncTime,
    onTopUp: (amount) => {
      if (!currentUser) return;
      const updatedUser = {
        ...currentUser,
        credits: (currentUser.credits || 0) + amount,
        walletHistory: [
          {
            id: Date.now().toString(),
            type: 'credit',
            amount: amount,
            description: 'Wallet Top Up',
            date: new Date().toISOString()
          },
          ...(currentUser.walletHistory || [])
        ]
      };
      const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
      if (isMe) {
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
      }

      const updatedPlayers = players.map(p => 
        String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
      );
      setPlayers(updatedPlayers);
      
      // Unified Sync & Save
      const updates = { players: updatedPlayers };
      if (isMe) updates.currentUser = updatedUser;
      syncAndSaveData(updates);
      
      Alert.alert("Success", `₹${amount} added to your AceTrack wallet!`);
    },
    onReplyTicket: (id, text, image, replyToMsg) => {
      const msgText = typeof text === 'string' ? text : (text?.text || String(text || ''));
      const msg = {
        senderId: currentUserRef.current?.id || 'admin',
        text: msgText,
        timestamp: new Date().toISOString()
      };
      if (image) msg.image = image;
      if (replyToMsg) msg.replyTo = { text: replyToMsg.text || '', senderId: replyToMsg.senderId || '' };
      logger.logAction('SUPPORT_MSG_SENT', { ticketId: id, hasImage: !!image, hasReply: !!replyToMsg, textLen: msgText.length });
      const updated = supportTickets.map(t => t.id === id ? { ...t, messages: [...t.messages, msg] } : t);
      setSupportTickets(updated);
      syncAndSaveData({ supportTickets: updated });
    },
    onUpdateTicketStatus: (id, status) => {
      const updated = supportTickets.map(t => t.id === id ? { ...t, status } : t);
      setSupportTickets(updated);
      syncAndSaveData({ supportTickets: updated });

      if (currentUser) {
          const ticket = updated.find(t => t.id === id);
          if (ticket && ticket.userId === currentUser.id) {
            const notif = {
                id: `notif-${Date.now()}`,
                title: 'Ticket Status Updated',
                message: `Your ticket "${ticket.title}" is now ${status}.`,
                date: new Date().toISOString(),
                read: false,
                type: 'support'
            };
            const updatedUser = { ...currentUser, notifications: [notif, ...(currentUser.notifications || [])] };
            const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
            if (isMe) {
              setCurrentUser(updatedUser);
              currentUserRef.current = updatedUser;
            }
            
            const updatedPlayers = players.map(p => 
              String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
            );
            setPlayers(updatedPlayers);
            
            // Unified Sync & Save
            const userUpdates = { players: updatedPlayers };
            if (isMe) userUpdates.currentUser = updatedUser;
            syncAndSaveData(userUpdates);
          }
      }
    },
    onSaveTicket: (ticket) => {
      const newTicket = {
        ...ticket,
        id: `ticket-${Date.now()}`,
        status: 'Open',
        createdAt: new Date().toISOString(),
      };
      const updated = [newTicket, ...supportTickets];
      setSupportTickets(updated);
      syncAndSaveData({ supportTickets: updated });

      if (currentUser) {
          const notif = {
              id: `notif-${Date.now()}`,
              title: 'Support Ticket Raised',
              message: `Your ticket "${ticket.title}" has been created successfully.`,
              date: new Date().toISOString(),
              read: false,
              type: 'support'
          };
          const updatedUser = { ...currentUser, notifications: [notif, ...(currentUser.notifications || [])] };
          const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
          if (isMe) {
            setCurrentUser(updatedUser);
            currentUserRef.current = updatedUser;
            storage.setItem('currentUser', updatedUser);
          }
          
          const updatedPlayers = players.map(p => 
            String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p
          );
          setPlayers(updatedPlayers);
          storage.setItem('players', updatedPlayers);
          
          // IMMEDIATE SYNC
          const saveUpdates = { players: updatedPlayers };
          if (isMe) saveUpdates.currentUser = updatedUser;
          pushStateToCloud(saveUpdates);
      }
    },
    onSaveEvaluation: (e) => {
      const updated = evaluations.map(item => item.id === e.id ? e : item);
      if (!evaluations.find(item => item.id === e.id)) updated.unshift(e);
      setEvaluations(updated);
      pushStateToCloud({ evaluations: updated });
      storage.setItem('evaluations', updated);
    },
    onConfirmCoachRequest: (t) => {
      if (!currentUser) return;

      Alert.alert(
        "Confirm Assignment",
        "Are you sure you want to accept this coaching assignment?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Accept",
            onPress: () => {
              const startOtp = Math.floor(100000 + Math.random() * 900000).toString();
              const endOtp = Math.floor(100000 + Math.random() * 900000).toString();

              const updatedTournament = {
                ...t,
                coachStatus: 'Coach Assigned',
                assignedCoachId: currentUser.id,
                assignedCoachIds: [...(t.assignedCoachIds || []), currentUser.id],
                startOtp,
                endOtp,
                tournamentStarted: false,
                ratingsModified: false
              };

              const updatedTournaments = tournaments.map(item => item.id === t.id ? updatedTournament : item);
              setTournaments(updatedTournaments);
              pushStateToCloud({ tournaments: updatedTournaments });
              storage.setItem('tournaments', updatedTournaments);
              Alert.alert("Success", "Successfully assigned as coach!");
            }
          }
        ]
      );
    },
    onDeclineCoachRequest: (t) => {
      if (!currentUser) return;
      const updated = tournaments.map(item => {
        if (item.id === t.id) {
          return {
            ...item,
            declinedCoachIds: [...(item.declinedCoachIds || []), currentUser.id]
          };
        }
        return item;
      });
      setTournaments(updated);
      pushStateToCloud({ tournaments: updated });
      storage.setItem('tournaments', updated);
      Alert.alert("Declined", "You have declined this coaching request.");
    },
    onStartTournament: (t) => {
      const updated = tournaments.map(item => item.id === t.id ? { ...item, tournamentStarted: true, status: 'ongoing', currentRound: item.currentRound || 1 } : item);
      setTournaments(updated);
      pushStateToCloud({ tournaments: updated });
      storage.setItem('tournaments', updated);
      Alert.alert("Success", "Tournament started!");
    },
    onEndTournament: (t) => {
      // Aggregate evaluations for final rating
      const tournamentEvals = evaluations.filter(e => e.tournamentId === t.id);
      const playerFinalRatings = {};

      tournamentEvals.forEach(e => {
        if (!playerFinalRatings[e.playerId]) playerFinalRatings[e.playerId] = [];
        playerFinalRatings[e.playerId].push(e.averageScore);
      });

      // Update player ratings in state if we have evaluations
      let updatedPlayers = players;
      if (Object.keys(playerFinalRatings).length > 0) {
        updatedPlayers = players.map(p => {
          if (playerFinalRatings[p.id]) {
            const avg = playerFinalRatings[p.id].reduce((a, b) => a + b, 0) / playerFinalRatings[p.id].length;
            return { ...p, rating: 1000 + Math.round(avg) };
          }
          return p;
        });
        setPlayers(updatedPlayers);
      }

      const updated = tournaments.map(item => item.id === t.id ? { ...item, tournamentStarted: false, tournamentConcluded: true, status: 'completed' } : item);
      setTournaments(updated);
      
      const updatePayload = { tournaments: updated };
      if (Object.keys(playerFinalRatings).length > 0) {
        updatePayload.players = updatedPlayers;
      }
      
      pushStateToCloud(updatePayload);
      storage.setItem('tournaments', updated);
      if (updatePayload.players) storage.setItem('players', updatedPlayers);
      
      Alert.alert("Success", "Tournament concluded successfully!");
    },
    onApproveCoach: (id, status, reason) => {
      const updated = players.map(p => 
        p.id === id 
          ? { ...p, coachStatus: status, coachRejectReason: reason, isApprovedCoach: status === 'approved' } 
          : p
      );
      setPlayers(updated);
      pushStateToCloud({ players: updated });
      storage.setItem('players', updated);
    },
    onAssignCoach: (tid, cid) => {
      const updated = tournaments.map(t => t.id === tid ? { ...t, assignedCoachId: cid, coachStatus: 'Coach Assigned' } : t);
      setTournaments(updated);
      pushStateToCloud({ tournaments: updated });
      storage.setItem('tournaments', updated);
    },
    onRemoveCoach: (tid) => {
      const updated = tournaments.map(t => t.id === tid ? { ...t, assignedCoachId: null, coachStatus: 'Awaiting Assignment' } : t);
      setTournaments(updated);
      pushStateToCloud({ tournaments: updated });
      storage.setItem('tournaments', updated);
    },
    onUpdateVideoStatus: (id, status) => {
      const updated = matchVideos.map(v => v.id === id ? { ...v, adminStatus: status } : v);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onBulkUpdateVideoStatus: (ids, status) => {
      const updated = matchVideos.map(v => ids.includes(v.id) ? { ...v, adminStatus: status } : v);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onForceRefundVideo: (id) => {
      const updated = matchVideos.map(v => v.id === id ? { ...v, refundsIssued: (v.refundsIssued || 0) + 1 } : v);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onApproveDeleteVideo: (id) => {
      const video = matchVideos.find(v => v.id === id);
      if (!video) return;

      // 1. Move to Removed status in matchVideos
      const updatedVideos = matchVideos.map(v => v.id === id ? { ...v, adminStatus: 'Removed' } : v);

      // 2. Process refunds for ALL players
      const updatedPlayers = players.map(player => {
        let credits = player.credits || 0;
        let pVideos = player.purchasedVideos || [];
        let pHighlights = player.purchasedHighlights || [];
        let history = player.walletHistory || [];
        let notifs = player.notifications || [];
        let modified = false;

        // Refund for Full Video
        if (pVideos.includes(id)) {
          const amount = video.price || 0;
          credits += amount;
          pVideos = pVideos.filter(vid => vid !== id);
          history = [{
            id: `ref-${Date.now()}-${Math.random()}`,
            type: 'credit',
            amount: amount,
            description: `Refund: Match Deletion (${video.matchId})`,
            date: new Date().toISOString()
          }, ...history];
          notifs = [{
            id: `notif-${Date.now()}`,
            title: 'Refund Issued',
            message: `Video #${video.matchId} was removed. ₹${amount} refunded to wallet.`,
            date: new Date().toISOString(),
            read: false,
            type: 'system'
          }, ...notifs];
          modified = true;
        }

        // Refund for Highlights
        if (pHighlights.includes(id)) {
          const hAmount = 20; // Standard highlight price
          credits += hAmount;
          pHighlights = pHighlights.filter(vid => vid !== id);
          history = [{
            id: `refh-${Date.now()}-${Math.random()}`,
            type: 'credit',
            amount: hAmount,
            description: `Refund: AI Highlights (${video.matchId})`,
            date: new Date().toISOString()
          }, ...history];
          modified = true;
        }

        if (modified) {
          return {
            ...player,
            credits,
            purchasedVideos: pVideos,
            purchasedHighlights: pHighlights,
            walletHistory: history,
            notifications: notifs
          };
        }
        return player;
      });

      setMatchVideos(updatedVideos);
      setPlayers(updatedPlayers);

      pushStateToCloud({
        matchVideos: updatedVideos,
        players: updatedPlayers
      });

      storage.setItem('matchVideos', updatedVideos);
      storage.setItem('players', updatedPlayers);
      
      Alert.alert("Deletion Approved", "Video moved to trash and refunds issued to all purchasers.");
    },
    onRejectDeleteVideo: (id) => {
      const updated = matchVideos.map(v => v.id === id ? { ...v, adminStatus: 'Active' } : v);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onPermanentDeleteVideo: (id) => {
      const updated = matchVideos.filter(v => v.id !== id);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onCancelVideo: (id) => {
      const updated = matchVideos.filter(v => v.id !== id);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onRequestDeletion: (id, reason) => {
      const updated = matchVideos.map(v => v.id === id ? { ...v, adminStatus: 'Deletion Requested', deletionReason: reason } : v);
      setMatchVideos(updated);
      pushStateToCloud({ matchVideos: updated });
      storage.setItem('matchVideos', updated);
    },
    onUnlockVideo: (vid, price, method) => {
      if (!currentUser) return;
      const notif = {
        id: `notif-${Date.now()}`,
        title: 'Video Unlocked',
        message: `You have successfully unlocked a match recording.`,
        date: new Date().toISOString(),
        read: false,
        type: 'video'
      };
      const updatedUser = {
        ...currentUser,
        credits: method === 'wallet' ? (currentUser.credits || 0) - price : (currentUser.credits || 0),
        purchasedVideos: [...(currentUser.purchasedVideos || []), vid],
        notifications: [notif, ...(currentUser.notifications || [])],
        walletHistory: method === 'wallet' ? [
          {
            id: Date.now().toString(),
            type: 'debit',
            amount: price,
            description: `Unlocked Match Recording`,
            date: new Date().toISOString()
          },
          ...(currentUser.walletHistory || [])
        ] : (currentUser.walletHistory || [])
      };
      const updatedMatchVideos = matchVideos.map(v => 
        v.id === vid ? { 
          ...v, 
          purchases: (v.purchases || 0) + 1, 
          revenue: (v.revenue || 0) + price 
        } : v
      );
      setMatchVideos(updatedMatchVideos);
      
      const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
      setPlayers(updatedPlayers);

      syncAndSaveData({
        currentUser: updatedUser,
        players: updatedPlayers,
        matchVideos: updatedMatchVideos
      });

      Alert.alert("Success", "Match recording unlocked successfully!");
    },
    onPurchaseAiHighlights: (vid, uid, method) => {
      if (!currentUser) return;
      const price = 20;
      const notif = {
        id: `notif-${Date.now()}`,
        title: 'AI Highlights Ready',
        message: `Your AI highlights for video ${vid} have been generated.`,
        date: new Date().toISOString(),
        read: false,
        type: 'video'
      };
      const updatedUser = {
        ...currentUser,
        credits: method === 'wallet' ? (currentUser.credits || 0) - price : (currentUser.credits || 0),
        purchasedHighlights: [...(currentUser.purchasedHighlights || []), vid],
        notifications: [notif, ...(currentUser.notifications || [])],
        walletHistory: method === 'wallet' ? [
          {
            id: Date.now().toString(),
            type: 'debit',
            amount: price,
            description: `AI Highlights Unlock`,
            date: new Date().toISOString()
          },
          ...(currentUser.walletHistory || [])
        ] : (currentUser.walletHistory || [])
      };
      const updatedMatchVideos = matchVideos.map(v => 
        v.id === vid ? { 
          ...v, 
          revenue: (v.revenue || 0) + price 
        } : v
      );
      setMatchVideos(updatedMatchVideos);

      const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
      setPlayers(updatedPlayers);

      syncAndSaveData({
        currentUser: updatedUser,
        players: updatedPlayers,
        matchVideos: updatedMatchVideos
      });
      Alert.alert("Success", "AI Highlights generated successfully!");
    },
    onVideoPlay: (vid, uid) => {
      const updated = matchVideos.map(v => {
        if (v.id === vid) {
          const currentViewers = v.viewerIds || [];
          if (!uid || currentViewers.includes(uid)) return v;
          return { ...v, viewerIds: [...currentViewers, uid] };
        }
        return v;
      });
      setMatchVideos(updated);
      syncAndSaveData({ matchVideos: updated });
    },
    onToggleFavourite: (vid) => {
      if (!currentUser) return;
      const isFav = (currentUser.favouritedVideos || []).includes(vid);
      const updatedFavs = isFav 
        ? (currentUser.favouritedVideos || []).filter(id => id !== vid)
        : [...(currentUser.favouritedVideos || []), vid];
      
      const updatedUser = { ...currentUser, favouritedVideos: updatedFavs };
      setCurrentUser(updatedUser);
      const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
      setPlayers(updatedPlayers);
      syncAndSaveData({ 
        players: updatedPlayers,
        currentUser: updatedUser 
      });
    },
    onUpdateTournament: (t) => {
      handleSaveTournament(t);
    },
    onSaveCoachComment: (tid, comment) => {
      const updated = tournaments.map(t => {
        if (t.id === tid) {
          return {
            ...t,
            coachComments: [...(t.coachComments || []), {
              id: Date.now(),
              coachId: currentUser.id,
              text: comment,
              timestamp: new Date().toISOString()
            }]
          };
        }
        return t;
      });
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
    },
    onRegister: (t, method, totalCost, isRescheduling, reschedulingFrom) => {
      if (!currentUser) return;

      logger.logAction('TOURNAMENT_ENROLL', { 
        tournamentId: t.id, 
        name: t.name, 
        method, 
        cost: totalCost,
        isRescheduling 
      });

      // 1. Calculate Updated Tournaments
      const updatedTournaments = tournaments.map(item => {
        if (isRescheduling && item.id === reschedulingFrom) {
          return { ...item, registeredPlayerIds: (item.registeredPlayerIds || []).filter(id => id !== currentUser.id) };
        }
        if (item.id === t.id) {
          const updatedStatuses = { ...(item.playerStatuses || {}) };
          updatedStatuses[currentUser.id] = 'Registered';

          return {
            ...item,
            registeredPlayerIds: [...(item.registeredPlayerIds || []), currentUser.id],
            pendingPaymentPlayerIds: (item.pendingPaymentPlayerIds || []).filter(id => id !== currentUser.id),
            playerStatuses: updatedStatuses
          };
        }
        return item;
      });

      // 2. Calculate Updated User
      let newCredits = currentUser.credits || 0;
      if (totalCost < 0) {
        newCredits += Math.abs(totalCost);
      } else if (totalCost > 0 && method === 'credits') {
        newCredits -= totalCost;
      }

      const newRescheduleCounts = { ...(currentUser.rescheduleCounts || {}) };
      if (isRescheduling) {
        newRescheduleCounts[t.id] = (newRescheduleCounts[reschedulingFrom] || 0) + 1;
        delete newRescheduleCounts[reschedulingFrom];
      }

      const newHistory = [...(currentUser.walletHistory || [])];
      if (totalCost !== 0 && method === 'credits') {
        newHistory.unshift({
          id: Date.now().toString(),
          type: totalCost < 0 ? 'credit' : 'debit',
          amount: Math.abs(totalCost),
          description: isRescheduling ? `Arena Swap: ${t.title}` : `Registration: ${t.title}`,
          date: new Date().toISOString()
        });
      }

      const notif = {
        id: `notif-${Date.now()}`,
        title: isRescheduling ? 'Arena Swapped' : 'Registration Confirmed',
        message: isRescheduling ? `Your registration has been moved to ${t.title}.` : `You are successfully registered for ${t.title}.`,
        date: new Date().toISOString(),
        read: false,
        type: 'general',
        tournamentId: t.id
      };
      const updatedUser = {
        ...currentUser,
        credits: newCredits,
        rescheduleCounts: newRescheduleCounts,
        walletHistory: newHistory,
        registeredTournamentIds: [...(currentUser.registeredTournamentIds || []), t.id],
        notifications: [notif, ...(currentUser.notifications || [])]
      };

      // 3. Calculate Updated Players list
      const isExistingPlayer = players.some(p => String(p.id).toLowerCase() === String(currentUser.id).toLowerCase());
      const updatedPlayers = isExistingPlayer 
        ? players.map(p => String(p.id).toLowerCase() === String(currentUser.id).toLowerCase() ? updatedUser : p)
        : [updatedUser, ...players];

      // 4. Apply all State Updates
      setTournaments(updatedTournaments);
      setPlayers(updatedPlayers);
      if (isRescheduling) setReschedulingFrom(null);

      const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
      if (isMe) {
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
      }

      // 5. Unified Sync & Save
      const syncUpdates = {
        tournaments: updatedTournaments,
        players: updatedPlayers
      };
      if (isMe) syncUpdates.currentUser = updatedUser;
      syncAndSaveData(syncUpdates);
    },
    onReschedule: (t) => {
      setReschedulingFrom(t.id);
    },
    onCancelReschedule: () => setReschedulingFrom(null),
    onOptOut: (t) => {
      if (!currentUser) return;

      const confirmCancel = () => {
        if (currentUser.role === 'coach') {
          const updatedTournaments = tournaments.map(item => {
            if (item.id === t.id) {
              const newCoachOtps = { ...(item.coachOtps || {}) };
              delete newCoachOtps[currentUser.id];
              return {
                ...item,
                assignedCoachId: item.assignedCoachId === currentUser.id ? undefined : item.assignedCoachId,
                assignedCoachIds: (item.assignedCoachIds || []).filter(id => id !== currentUser.id),
                coachOtps: newCoachOtps,
                coachStatus: 'Awaiting Coach Confirmation'
              };
            }
            return item;
          });
          setTournaments(updatedTournaments);
          syncAndSaveData({ tournaments: updatedTournaments });
          Alert.alert("Success", "Coach assignment cancelled. Your OTP has been invalidated.");
          return;
        }

        const isRegistered = (t.registeredPlayerIds || []).includes(currentUser.id);

        const getUpdatedTournaments = () => {
          return tournaments.map(item => {
            if (item.id === t.id) {
              const isActuallyRegistered = (item.registeredPlayerIds || []).includes(currentUser.id);
              const updatedStatuses = { ...(item.playerStatuses || {}) };
              updatedStatuses[currentUser.id] = isActuallyRegistered ? 'Opted-Out' : 'Denied';

              return {
                ...item,
                registeredPlayerIds: (item.registeredPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(currentUser.id).toLowerCase()),
                pendingPaymentPlayerIds: (item.pendingPaymentPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(currentUser.id).toLowerCase()),
                playerStatuses: updatedStatuses
              };
            }
            return item;
          });
        };

        if (!isRegistered) {
          const updatedTournaments = getUpdatedTournaments();
          setTournaments(updatedTournaments);
          syncAndSaveData({ tournaments: updatedTournaments });
          Alert.alert("Success", "Invitation/Request cancelled successfully.");
          return;
        }

        // If registered, ask for refund choice
        Alert.alert(
          "Refund Method",
          "How would you like to receive your refund?",
          [
            {
              text: "Refund to Wallet",
              onPress: () => {
                const updatedTournaments = getUpdatedTournaments();
                const updatedUser = {
                  ...currentUser,
                  credits: (currentUser.credits || 0) + (t.entryFee || 0),
                  cancelledTournamentIds: [...(currentUser.cancelledTournamentIds || []), t.id],
                  walletHistory: [
                    {
                      id: Date.now().toString(),
                      type: 'credit',
                      amount: t.entryFee,
                      description: `Refund: ${t.title}`,
                      date: new Date().toISOString()
                    },
                    ...(currentUser.walletHistory || [])
                  ]
                };
                const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
                
                setTournaments(updatedTournaments);
                setPlayers(updatedPlayers);
                
                const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
                if (isMe) {
                  setCurrentUser(updatedUser);
                  currentUserRef.current = updatedUser;
                }

                const syncUpdates = { 
                  tournaments: updatedTournaments, 
                  players: updatedPlayers
                };
                if (isMe) syncUpdates.currentUser = updatedUser;
                syncAndSaveData(syncUpdates);
                
                Alert.alert("Success", `₹${t.entryFee} credited to your AceTrack wallet.`);
              }
            },
            {
              text: "Refund to Source Account",
              onPress: () => {
                const updatedTournaments = getUpdatedTournaments();
                const updatedUser = {
                  ...currentUser,
                  cancelledTournamentIds: [...(currentUser.cancelledTournamentIds || []), t.id]
                };
                const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
                
                setTournaments(updatedTournaments);
                setPlayers(updatedPlayers);
                
                const isMe = currentUserRef.current && String(updatedUser.id).toLowerCase() === String(currentUserRef.current.id).toLowerCase();
                if (isMe) {
                  setCurrentUser(updatedUser);
                  currentUserRef.current = updatedUser;
                }

                const syncUpdates = { 
                  tournaments: updatedTournaments, 
                  players: updatedPlayers
                };
                if (isMe) syncUpdates.currentUser = updatedUser;
                syncAndSaveData(syncUpdates);
                
                Alert.alert("Refund Initiated", "Refund will be processed to your source account within 5-7 working days.");
              }
            },
            { text: "Keep Registration", style: "cancel" }
          ]
        );
      };

      Alert.alert(
        "Confirm Opt-out",
        currentUser.role === 'coach' ? "Are you sure you want to cancel this coaching assignment?" : "Are you sure you want to opt-out of this tournament?",
        [
          { text: "No, Keep it", style: "cancel" },
          { text: "Yes, Proceed", onPress: confirmCancel }
        ]
      );
    },
    onLogFailedOtp: (tid, cid, otp) => {
      const updated = tournaments.map(t => {
        if (t.id === tid) {
          return {
            ...t,
            failedOtpAttempts: [
              ...(t.failedOtpAttempts || []),
              { coachId: cid, otp, timestamp: new Date().toISOString() }
            ]
          };
        }
        return t;
      });
      setTournaments(updated);
      syncAndSaveData({ tournaments: updated });
      console.log(`Failed OTP logged for tournament ${tid}, coach ${cid}`);
    },
    setPlayers: (updater) => {
      const updated = typeof updater === 'function' ? updater(players) : updater;
      setPlayers(updated);
      syncAndSaveData({ players: updated });
    },
    onSendChatMessage: (messages) => {
      if (!currentUser) return;
      const updated = {
        ...chatbotMessages,
        [currentUser.id]: messages
      };
      setChatbotMessages(updated);
      syncAndSaveData({ chatbotMessages: updated });
    },
    onUploadLogs: async () => {
      const activeUser = currentUserRef.current || currentUser; // Fallback to state
      
      logger.logAction('DIAGNOSTICS_UPLOAD_CLICK', { 
        hasRef: !!currentUserRef.current, 
        hasState: !!currentUser,
        userId: activeUser?.id 
      });

      console.log("📤 Attempting to upload diagnostics...");
      
      if (!activeUser) {
        console.warn("🛑 No user detected in Ref or State during upload.");
        logger.logAction('DIAGNOSTICS_UPLOAD_ABORT', { error: 'No user detected' });
        Alert.alert("Error", "No user logged in. Please log in again to send diagnostics.");
        return;
      }
      
      setIsUploadingLogs(true);
      try {
        const logs = logger.getLogs();
        console.log(`📋 Sending ${logs.length} log entries...`);
        
        const targetCloudUrl = 'https://acetrack-suggested.onrender.com';
        const activeApiUrl = isUsingCloud ? targetCloudUrl : config.API_BASE_URL;
        
        const response = await fetch(`${activeApiUrl}/api/diagnostics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': config.ACE_API_KEY
          },
          body: JSON.stringify({
            username: activeUser.name || activeUser.email || 'Unknown User',
            logs: logs,
            state: {
              currentUser: activeUser,
              tournamentsCount: tournaments.length,
              matchVideosCount: matchVideos.length,
              matchesCount: matches.length,
              role: userRole,
              isUsingCloud,
              appVersion: APP_VERSION
            },
            prefix: 'user_report',
            deviceId: localDeviceIdRef.current
          })
        });

        if (response.ok) {
          const result = await response.json();
          logger.logAction('DIAGNOSTICS_UPLOAD_SUCCESS', { filename: result.filename });
          console.log("✅ Diagnostics uploaded successfully:", result.filename);
          Alert.alert("Success", "Diagnostic logs have been sent to the cloud.");
        } else {
          const errData = await response.text();
          logger.logAction('DIAGNOSTICS_UPLOAD_FAIL', { status: response.status, error: errData });
          console.error("❌ Diagnostics upload failed:", errData);
          throw new Error("Failed to upload logs");
        }
      } catch (err) {
        logger.logAction('DIAGNOSTICS_UPLOAD_ERROR', { error: err.message });
        Alert.alert("Error", "Could not upload logs. Please check your internet connection.");
      } finally {
        setIsUploadingLogs(false);
      }
    },
    isUploadingLogs
  };

  console.log("🛠️ App Render Check:", { 
    isLoading, 
    hasUser: !!currentUser, 
    viewingLanding, 
    showSignup, 
    showOnboarding 
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  // FINAL RENDER LOGIC: Mutually Exclusive Branches
  if (showSignup) {
    console.log("📝 App: Rendering SignupScreen");
    return (
      <SignupScreen 
        players={players}
        isUsingCloud={isUsingCloud}
        onToggleCloud={() => {
          const newValue = !isUsingCloud;
          setIsUsingCloud(newValue);
          storage.setItem('isUsingCloud', newValue);
          loadData(true, true);
        }}
        onBack={() => {
          console.log("📝 App: Signup back pressed - returning to landing");
          setShowSignup(false);
          setViewingLanding(true);
        }}
        onSignupSuccess={(newUser) => {
          console.log("📝 App: Signup success - registering user:", newUser.id);
          setShowSignup(false);
          handleRegisterUser(newUser);
          setViewingLanding(false);
        }}
        Sport={{ badminton: 'Badminton', tennis: 'Tennis', tableTennis: 'Table Tennis', cricket: 'Cricket' }}
      />
    );
  }

  if (showOnboarding) {
    return (
      <OnboardingScreen 
        initialStep={onboardingInitialStep}
        onFinish={() => {
          setShowOnboarding(false);
          setViewingLanding(false);
        }} 
      />
    );
  }

  if (!currentUser && viewingLanding) {
    console.log("🏠 App: Rendering LandingScreen", { showSignup, viewingLanding });
    return (
      <LandingScreen 
        onLogin={() => {
          console.log("🏠 App: onLogin -> Transitioning to Login Flow");
          setShowSignup(false);
          setShowOnboarding(false);
          setViewingLanding(false);
        }} 
        onJoinCircle={() => {
          console.log("🏠 App: onJoinCircle -> Transitioning to Signup");
          setViewingLanding(false);
          setShowOnboarding(false);
          setShowSignup(true);
        }} 
      />
    );
  }

  console.log("🎯 App: Falling through to Parent Navigation Container (Login Flow)");

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <View 
        style={{ flex: 1 }}
        onStartShouldSetResponderCapture={(evt) => {
          try {
            const { pageX, pageY } = evt.nativeEvent;
            logger.logAction('USER_TAP', { 
              x: Math.round(pageX), 
              y: Math.round(pageY)
            });
          } catch(e) {}
          return false; // Do not block actual interactions
        }}
      >
        <NavigationContainer 
          ref={navigationRef}
          onStateChange={(state) => {
            if (state) {
              const route = state.routes[state.index];
              logger.logAction('NAVIGATION', { 
                screen: route.name, 
                // Omitting full params to save log space if they are huge, but let's log keys
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
          handlers={{
            ...handlers,
            onSignup: () => {
              console.log("➡️ App Navigator: onSignup requested from screen");
              setShowSignup(true);
            },
            onBack: () => {
              console.log("🔙 AppNavigator: onBack triggered - returning to landing");
              setViewingLanding(true);
              setShowSignup(false);
              setShowOnboarding(false);
            }
          }}
          socketRef={socketRef}
        />
        {currentUser && (
          <ChatBot 
            user={currentUser} 
            userRole={userRole}
            userId={currentUser?.id}
            players={players}
            evaluations={evaluations} 
            chatbotMessages={chatbotMessages}
            onSendChatMessage={handlers.onSendChatMessage}
            tournaments={tournaments}
            onSaveTicket={handlers.onSaveTicket}
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
      </View>
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
