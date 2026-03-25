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

const APP_VERSION = Platform.OS === 'web' ? '2.0.0-web' : '2.0.0';

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
  const [appVersion, setAppVersion] = useState(APP_VERSION);
  const [latestAppVersion, setLatestAppVersion] = useState(APP_VERSION);
  const [showForceUpdate, setShowForceUpdate] = useState(false);
  const [isUpdatingFromModal, setIsUpdatingFromModal] = useState(false);
  
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
    const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;
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
          const cloudUrl = isUsingCloudRef.current ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;
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
        
        const cloudUrl = 'https://acetrack-api-q39m.onrender.com';
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

      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;
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

      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;

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
      
      const activeApiUrl = isUsingCloudRef.current ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;
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

  const onUpdateSeenAdminActions = async (userId, actionIds) => {
     if (userRole !== 'admin') return;
     const normalized = Array.from(actionIds).map(id => String(id));
     setSeenAdminActionIds(new Set(normalized));
     await storage.setItem('seenAdminActionIds', normalized);
     
     // CRITICAL: Push updated badge state to the admin's cloud profile
     if (currentUser) {
        const updatedUser = { ...currentUser, seenAdminActionIds: normalized };
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
        syncAndSaveData({ currentUser: updatedUser });
     }
  };

  const onUpdateVisitedAdminSubTabs = async (tabs) => {
     if (userRole !== 'admin') return;
     const normalized = Array.from(tabs);
     setVisitedAdminSubTabs(new Set(normalized));
     await storage.setItem('visitedAdminSubTabs', normalized);
     
     // CRITICAL: Push updated badge state to the admin's cloud profile
     if (currentUser) {
        const updatedUser = { ...currentUser, visitedAdminSubTabs: normalized };
        setCurrentUser(updatedUser);
        currentUserRef.current = updatedUser;
        syncAndSaveData({ currentUser: updatedUser });
     }
  };

  const onVerifyAccount = (type) => {
    if (!currentUser) return;
    const updated = { 
      ...currentUser, 
      [`is${type.charAt(0).toUpperCase() + type.slice(1)}Verified`]: true 
    };
    
    // PERMANENCE FIX: Update both currentUser session and global players array
    setCurrentUser(updated);
    currentUserRef.current = updated;
    
    // Sync to cloud IMMEDIATELY to prevent state loss on re-login
    const updatedPlayers = players.map(p => 
      String(p.id).toLowerCase() === String(updated.id).toLowerCase() ? updated : p
    );
    setPlayers(updatedPlayers);
    
    syncAndSaveData({ 
      currentUser: updated, 
      players: updatedPlayers 
    });
    
    logger.logAction('ACCOUNT_VERIFIED', { type, userId: updated.id });
  };

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0F172A', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={{ color: '#94A3B8', marginTop: 16, fontWeight: 'bold', letterSpacing: 1 }}>INITIALIZING ACETRACK...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <StatusBar barStyle="light-content" />
          <NavigationContainer ref={navigationRef}>
            <View style={{ flex: 1 }}>
              <AppNavigator 
                user={currentUser}
                userRole={userRole}
                players={players}
                tournaments={tournaments}
                matchVideos={matchVideos}
                supportTickets={supportTickets}
                evaluations={evaluations}
                matches={matches}
                auditLogs={auditLogs}
                onLogin={handleLogin}
                onLogout={handleLogout}
                onRegisterUser={handleRegisterUser}
                onSaveEvaluation={(ev) => syncAndSaveData({ evaluations: [ev, ...evaluations] })}
                onSaveTicket={(st) => syncAndSaveData({ supportTickets: [st, ...supportTickets] })}
                onReplyTicket={(id, msg) => {
                  const updated = supportTickets.map(t => t.id === id ? { ...t, messages: [...t.messages, msg], lastUpdated: new Date().toISOString() } : t);
                  setSupportTickets(updated);
                  syncAndSaveData({ supportTickets: updated });
                }}
                onUpdateTournament={(t) => {
                  const updated = tournaments.map(item => item.id === t.id ? t : item);
                  setTournaments(updated);
                  syncAndSaveData({ tournaments: updated });
                }}
                onStartTournament={(t) => {
                  const updated = tournaments.map(item => item.id === t.id ? { ...item, status: 'ongoing', tournamentStarted: true, startTime: new Date().toISOString() } : item);
                  setTournaments(updated);
                  syncAndSaveData({ tournaments: updated });
                }}
                onEndTournament={(t) => {
                  const updated = tournaments.map(item => item.id === t.id ? { ...item, status: 'completed', tournamentConcluded: true, endTime: new Date().toISOString() } : item);
                  setTournaments(updated);
                  syncAndSaveData({ tournaments: updated });
                }}
                onAssignCoach={(tid, cid) => {
                  const updated = tournaments.map(t => t.id === tid ? { ...t, assignedCoachId: cid, coachStatus: 'Assigned' } : t);
                  setTournaments(updated);
                  syncAndSaveData({ tournaments: updated });
                }}
                onConfirmCoachRequest={(t) => {
                   const updated = tournaments.map(item => item.id === t.id ? { ...item, assignedCoachId: currentUser.id, coachStatus: 'Confirmed' } : item);
                   setTournaments(updated);
                   syncAndSaveData({ tournaments: updated });
                }}
                onDeclineCoachRequest={(t) => {
                   const declined = [...(t.declinedCoachIds || []), currentUser.id];
                   const updated = tournaments.map(item => item.id === t.id ? { ...item, declinedCoachIds: declined } : item);
                   setTournaments(updated);
                   syncAndSaveData({ tournaments: updated });
                }}
                onSaveCoachComment={(tid, comment) => {
                  const updated = tournaments.map(t => t.id === tid ? { ...t, coachComment: comment } : t);
                  setTournaments(updated);
                  syncAndSaveData({ tournaments: updated });
                }}
                onRegister={(t, method, fee, isReschedule, rescheduleFrom) => {
                  const updatedTournaments = tournaments.map(item => {
                    if (item.id === t.id) {
                      return { ...item, registeredPlayerIds: [...(item.registeredPlayerIds || []), user.id] };
                    }
                    if (isReschedule && item.id === rescheduleFrom) {
                       return { ...item, registeredPlayerIds: (item.registeredPlayerIds || []).filter(id => id !== user.id) };
                    }
                    return item;
                  });
                  setTournaments(updatedTournaments);
                  const updatedUser = { ...currentUser, credits: (currentUser.credits || 0) - fee };
                  setCurrentUser(updatedUser);
                  syncAndSaveData({ tournaments: updatedTournaments, currentUser: updatedUser });
                }}
                onReschedule={(t) => setReschedulingFrom(t.id)}
                onCancelReschedule={() => setReschedulingFrom(null)}
                onOptOut={(t) => {
                   const updated = tournaments.map(item => item.id === t.id ? { ...item, registeredPlayerIds: (item.registeredPlayerIds || []).filter(id => id !== user.id), pendingPaymentPlayerIds: (item.pendingPaymentPlayerIds || []).filter(id => id !== user.id) } : item);
                   setTournaments(updated);
                   syncAndSaveData({ tournaments: updated });
                }}
                isCloudOnline={isCloudOnline}
                lastSyncTime={lastSyncTime}
                isSyncing={isSyncing}
                isUploadingLogs={isUploadingLogs}
                chatbotMessages={chatbotMessages}
                onSendChatMessage={(msg) => {
                  const userId = currentUser?.id || 'anonymous';
                  const updatedMap = { ...chatbotMessages, [userId]: msg };
                  setChatbotMessages(updatedMap);
                  syncAndSaveData({ chatbotMessages: updatedMap });
                }}
                onVerifyAccount={onVerifyAccount}
                seenAdminActionIds={seenAdminActionIds}
                onUpdateSeenAdminActions={onUpdateSeenAdminActions}
                visitedAdminSubTabs={visitedAdminSubTabs}
                onUpdateVisitedAdminSubTabs={onUpdateVisitedAdminSubTabs}
                onLogFailedOtp={(tid, cid, otp) => {
                   const log = { id: `log_${Date.now()}`, type: 'FAILED_OTP', tournamentId: tid, coachId: cid, otp, timestamp: new Date().toISOString() };
                   syncAndSaveData({ auditLogs: [log, ...auditLogs] });
                }}
                onSetProfileEditActive={setIsProfileEditActive}
              />
              
              {/* Global AI Assistant */}
              {currentUser && (
                <ChatBot 
                  user={currentUser}
                  userRole={userRole}
                  userId={currentUser?.id}
                  evaluations={evaluations}
                  chatbotMessages={chatbotMessages}
                  onSendChatMessage={(msg) => {
                    const userId = currentUser.id;
                    const updatedMap = { ...chatbotMessages, [userId]: msg };
                    setChatbotMessages(updatedMap);
                    syncAndSaveData({ chatbotMessages: updatedMap });
                  }}
                  tournaments={tournaments}
                  onSaveTicket={(st) => syncAndSaveData({ supportTickets: [st, ...supportTickets] })}
                  players={players}
                />
              )}
            </View>
          </NavigationContainer>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
