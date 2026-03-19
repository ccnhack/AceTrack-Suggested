import React, { useState, useEffect } from 'react';
import { View, ActivityIndicator, StatusBar, StyleSheet, Alert, Platform, AppState, Text, TouchableOpacity, Modal } from 'react-native';
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
import logger from './utils/logger';
import { Ionicons } from '@expo/vector-icons';
import config from './config';

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
  const [isProfileEditActive, setIsProfileEditActive] = useState(false); // New state to track if profile edit is open
  const [pendingSync, setPendingSync] = useState([]); // Keys that need to be pushed to cloud
  const [visitedAdminSubTabs, setVisitedAdminSubTabs] = useState(new Set());
  const isSyncingRef = React.useRef(false);
  const pendingSyncRef = React.useRef([]);
  const lastServerUpdateRef = React.useRef(null);
  const syncVersion = React.useRef(0);
  const navigationRef = React.useRef();

  // Synchronous helper to update isSyncing state AND ref atomically
  const setSyncingState = (val) => {
    isSyncingRef.current = val; // Immediate ref update (no render delay)
    setIsSyncing(val);          // React state update (for UI)
  };

  useEffect(() => {
    pendingSyncRef.current = pendingSync;
  }, [pendingSync]);

  useEffect(() => {
    // 1. Polling: Check for updates every 5 seconds for real-time feel
    const pollInterval = setInterval(() => {
      // Poll if not syncing. Even if not logged in, we want to see new players/tournaments
      if (!isSyncingRef.current) {
        checkForUpdates();
      }
    }, 5000);

    // 2. AppState: Refresh when app returns from background to foreground
    const subscription = AppState.addEventListener('change', nextAppState => {
      if (nextAppState === 'active' && !isSyncingRef.current) {
        console.log("📱 App returned to foreground, checking for cloud updates...");
        loadData(true); // Don't show loading spinner for foreground return
      }
    });

    // 3. IMMEDIATE HYDRATION FROM STORAGE
    const startup = async () => {
      await logger.initialize();
      // Register auto-sync for logs when threshold hits 500
      logger.setThresholdCallback(500, async () => {
        logger.logAction('AUTO_SYNC_THRESHOLD_REACHED');
        // We use the same onUploadLogs logic but silently
        await actions.onUploadLogs(); 
      });

      await hydrateFromStorage();
      // Only after local data is visible do we attempt a cloud pull
      loadData();
    };
    startup();

    return () => {
      clearInterval(pollInterval);
      subscription.remove();
    };
  }, []); 

  // 4. PERSISTENT VERIFICATION PROMPT: Ensure it shows up if unverified
  // Fix: Don't show if user is admin OR already in the Edit Profile modal
  useEffect(() => {
    if (currentUser && currentUser.role !== 'admin' && (!currentUser.isEmailVerified || !currentUser.isPhoneVerified) && !isProfileEditActive) {
      setShowVerificationPrompt(true);
    } else {
      setShowVerificationPrompt(false);
    }
  }, [currentUser?.id, currentUser?.role, currentUser?.isEmailVerified, currentUser?.isPhoneVerified, isProfileEditActive]);


  const checkForUpdates = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/status`, {
        headers: {
          'x-ace-api-key': config.ACE_API_KEY
        }
      });
      if (response.ok) {
        const { lastUpdated } = await response.json();
        const serverTime = String(lastUpdated);
        const localTime = String(lastServerUpdateRef.current);
        
        if (serverTime && serverTime !== localTime) {
          console.log(`🔄 [Sync] Real-time Update! Server: ${serverTime.slice(-5)} vs Local: ${localTime.slice(-5)}`);
          // Use forceSync=true to bypass the isSyncingRef guard since we KNOW there's an update
          await loadData(true, true);
        }
      }
    } catch (e) {
      // Quietly log status errors to avoid console spam
      console.log("📡 Status check failed:", e.message);
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
      if (saids && Array.isArray(saids)) setSeenAdminActionIds(new Set(saids));
      if (vats && Array.isArray(vats)) setVisitedAdminSubTabs(new Set(vats));

      if (u) {
        setCurrentUser(u);
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); 

      const activeApiUrl = isUsingCloud ? 'https://acetrack-api-q39m.onrender.com' : config.API_BASE_URL;
      
      console.log(`📡 Fetching Updates from ${isUsingCloud ? 'CLOUD' : 'LOCAL'} [v${versionAtStart}]...`);
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
      }

      // Update states and storage simultaneously
      if (cloudData.players) {
        // CLEANUP: Filter out ghost players (ID: test) and nulls
        cloudData.players = cloudData.players.filter(p => p && p.id && String(p.id).toLowerCase() !== 'test');
        console.log(`👥 Cloud Sync: Received ${cloudData.players.length} players. Names: ${cloudData.players.map(p => p.name).join(', ')}`);
        logger.logAction('CLOUD_PLAYERS_SYNC', { count: cloudData.players.length, names: cloudData.players.map(p => p.name) });
        setPlayers(cloudData.players);
        storage.setItem('players', cloudData.players);
        
        // Refresh local user from cloud list if logged in
        const currentU = currentUserRef.current;
        if (currentU) {
          const cloudUser = cloudData.players.find(p => String(p.id).toLowerCase() === String(currentU.id).toLowerCase());
          if (cloudUser) {
            setCurrentUser(cloudUser);
            currentUserRef.current = cloudUser;
            setUserRole(cloudUser.role || 'user');
            storage.setItem('currentUser', cloudUser);
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
      setIsLoading(false);
      if (versionAtStart === syncVersion.current) {
        setSyncingState(false);
      }
    }
  };

  const pushStateToCloud = async (updates = {}, forceCloud = false, isRetry = false) => {
    if (Object.keys(updates).length === 0) return true;
    
    // Increment version so any pending loadData is marked as stale immediately
    const versionAtStart = ++syncVersion.current;
    if (!isRetry) setSyncingState(true);
    
    try {
      // Force Cloud for critical operations like registration
      const targetCloudUrl = 'https://acetrack-api-q39m.onrender.com';
      const activeApiUrl = (forceCloud || isUsingCloud) ? targetCloudUrl : config.API_BASE_URL;
      
      console.log(`☁️ Syncing partial state to ${ (forceCloud || isUsingCloud) ? 'CLOUD' : 'LOCAL'} [v${versionAtStart}]: ${Object.keys(updates).join(', ')}`);
      const response = await fetch(`${activeApiUrl}/api/save`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY
        },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`Cloud save failed: ${response.status}`);
      }
      console.log(`✅ Cloud push successful [v${versionAtStart}]`);
      setIsCloudOnline(true);
      setLastSyncTime(new Date().toLocaleTimeString());

      const result = await response.json();
      if (result.lastUpdated) {
        lastServerUpdateRef.current = result.lastUpdated;
      }
      return true;
    } catch (e) {
      console.error("❌ Cloud push failed:", e.message);
      setIsCloudOnline(false);
      return false;
    } finally {
      if (versionAtStart === syncVersion.current) {
        setSyncingState(false);
      }
    }
  };


  const syncAndSaveData = async (updates) => {
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
      const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages'];
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
          const final = prev.map(item => item.id === v.id ? { ...item, status: 'ready' } : item);
          pushStateToCloud({ matchVideos: final });
          storage.setItem('matchVideos', final);
          return final;
        });
        console.log(`--- VIDEO ${v.id} PROCESSING COMPLETE ---`);
      }, 5000);
    }
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
      setSeenAdminActionIds(ids);
      storage.setItem('seenAdminActionIds', Array.from(ids));
      // Cross-device sync: save to admin's profile
      if (currentUserRef.current?.role === 'admin') {
        handleBatchUpdate({ 
          currentUser: { ...currentUserRef.current, seenAdminActionIds: Array.from(ids) } 
        });
      }
    },
    visitedAdminSubTabs,
    setVisitedAdminSubTabs: (tabs) => {
      setVisitedAdminSubTabs(tabs);
      storage.setItem('visitedAdminSubTabs', Array.from(tabs));
      // Cross-device sync: save to admin's profile
      if (currentUserRef.current?.role === 'admin') {
        handleBatchUpdate({ 
          currentUser: { ...currentUserRef.current, visitedAdminSubTabs: Array.from(tabs) } 
        });
      }
    },
    setIsProfileEditActive, // Pass setter to ProfileScreen
    onSaveTournament: handleSaveTournament,
    onSaveVideo: handleSaveVideo,
    onUpdateUser: (u) => { 
      // CRITICAL: Only update currentUser if this IS the logged-in user.
      // Without this check, calling onUpdateUser for an invited player
      // would hijack the academy's session to show the player's profile!
      const loggedInUser = currentUserRef.current;
      if (loggedInUser && String(u.id).toLowerCase() === String(loggedInUser.id).toLowerCase()) {
        setCurrentUser(u); 
        currentUserRef.current = u;
        syncAndSaveData({ currentUser: u });
      }
      
      // Always update the players list regardless of who was updated
      const updatedPlayers = players.map(p => 
        String(p.id).toLowerCase() === String(u.id).toLowerCase() ? u : p
      );
      // If the user doesn't exist in the list yet, add them
      if (!players.some(p => String(p.id).toLowerCase() === String(u.id).toLowerCase())) {
        updatedPlayers.push(u);
      }
      setPlayers(updatedPlayers);
      syncAndSaveData({ players: updatedPlayers });
    },
    onLogTrace: handleLogTrace,
    onManualSync: () => {
      logger.logAction('Manual Sync Clicked');
      loadData(true, true); // Don't show full-screen loader for force sync
    },
    onRegisterUser: handleRegisterUser,
    onVerifyAccount: (type) => {
      if (!currentUser) return;
      const updatedUser = {
        ...currentUser,
        [type === 'email' ? 'isEmailVerified' : 'isPhoneVerified']: true
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
      
      const updates = { players: updatedPlayers };
      if (isMe) updates.currentUser = updatedUser;
      syncAndSaveData(updates);
    },
    onBatchUpdate: (updates) => {
      logger.logAction('Batch Update triggered', Object.keys(updates));
      const syncObj = {};
      if (updates.tournaments) {
        setTournaments(updates.tournaments);
        syncObj.tournaments = updates.tournaments;
      }
      if (updates.players) {
        setPlayers(updates.players);
        syncObj.players = updates.players;
      }
      if (updates.matches) {
        setMatches(updates.matches);
        syncObj.matches = updates.matches;
      }
      if (updates.currentUser) {
        setCurrentUser(updates.currentUser);
        currentUserRef.current = updates.currentUser;
        syncObj.currentUser = updates.currentUser;
      }
      syncAndSaveData(syncObj);
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
    onReplyTicket: (id, msg) => {
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
            return { ...p, rating: Math.round(avg) };
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
      setCurrentUser(updatedUser);
      storage.setItem('currentUser', updatedUser);
      const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
      setPlayers(updatedPlayers);
      pushStateToCloud({ players: updatedPlayers });
      storage.setItem('players', updatedPlayers);
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
      setCurrentUser(updatedUser);
      storage.setItem('currentUser', updatedUser);
      const updatedPlayers = players.map(p => p.id === currentUser.id ? updatedUser : p);
      setPlayers(updatedPlayers);
      pushStateToCloud({ players: updatedPlayers });
      storage.setItem('players', updatedPlayers);
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
        
        const targetCloudUrl = 'https://acetrack-api-q39m.onrender.com';
        const activeApiUrl = isUsingCloud ? targetCloudUrl : config.API_BASE_URL;
        
        const response = await fetch(`${activeApiUrl}/api/diagnostics`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-ace-api-key': config.ACE_API_KEY
          },
          body: JSON.stringify({
            username: activeUser.name || activeUser.email || 'Unknown User',
            logs: logs
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
    // ... add other handlers as needed by screens
  };
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer 
        ref={navigationRef}
        onStateChange={(state) => {
          if (state) {
            const route = state.routes[state.index];
            logger.logAction('NAVIGATION', { 
              screen: route.name, 
              params: route.params 
            });
          }
        }}
      >
        <StatusBar barStyle="dark-content" />
        <AppNavigator
          user={currentUser}
          role={userRole}
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
          handlers={handlers} 
        />
        {currentUser && (
          <ChatBot 
            user={currentUser} 
            evaluations={evaluations} 
            chatbotMessages={chatbotMessages}
            onSendChatMessage={handlers.onSendChatMessage}
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
                  // We need to navigate to Profile tab AND tell it to open the edit modal.
                  // We'll use the navigation reference if available or just assume it's correctly handled via params.
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
      </NavigationContainer>
    </SafeAreaProvider>
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
