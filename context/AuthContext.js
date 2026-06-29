import React, { createContext, useContext, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert, Platform } from 'react-native';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import { eventBus } from '../services/EventBus';
import PlayerService from '../services/PlayerService';
import storage from '../utils/storage';
import logger from '../utils/logger';
import config from '../config';

import { useSync } from './SyncContext';
import { useAuthStore, usePlayersStore, useTournamentsStore, useSupportStore, useVideoStore, useMatchmakingStore, useAdminStore, useEvaluationsStore } from '../stores';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  // Bind state from Zustand store instead of local useState
  const currentUser = useAuthStore(state => state.currentUser);
  const userRole = useAuthStore(state => state.userRole);
  const verificationLatch = useAuthStore(state => state.verificationLatch);
  const viewingLanding = useAuthStore(state => state.viewingLanding);
  const showSignup = useAuthStore(state => state.showSignup);
  const isAuthReady = useAuthStore(state => state.isAuthReady);
  
  const { setCurrentUser, setUserRole, setVerificationLatch, setViewingLanding, setShowSignup, setIsAuthReady } = useAuthStore.getState();

  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const { syncAndSaveData, loadData } = useSync();
  const onLogoutRef = useRef(null);

  useEffect(() => {
    const hydrateSession = async () => {
      try {
          let rawUser = await storage.getItem('currentUser');
          let token = await storage.getItem('userToken');

          if (Platform.OS === 'web' && token) {
             console.log(`[AuthContext] Sweeping legacy localStorage token to enforce cookies...`);
             await storage.removeItem('userToken');
             token = null;
          }

          const hasLocalSession = rawUser && typeof rawUser === 'object' && token;
          if (Platform.OS === 'web' && !hasLocalSession) {
            console.log(`[AuthContext] No local session on web, checking cookies via /auth/me...`);
            try {
              const apiUrl = config.API_BASE_URL || 'https://acetrack-suggested.onrender.com';
              const response = await fetch(`${apiUrl}/api/v1/auth/me`, {
                headers: { 
                  'x-ace-api-key': config.PUBLIC_APP_ID || 'AceTrack_Client_v2_Production',
                  'Accept': 'application/json'
                },
                credentials: 'include'
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                  console.log(`[AuthContext] Cookie session found for: ${data.user.id}`);
                  rawUser = data.user;
                }
              }
            } catch (authErr) {
              console.warn(`[AuthContext] Cookie session check failed:`, authErr.message);
            }
          }

          if (rawUser) {
            console.log(`[AuthContext] Hydrating session for: ${rawUser.id}`);
            useAuthStore.getState().login(rawUser);

            syncOrchestrator.init(rawUser.id, rawUser.role);
            if (token) syncOrchestrator.setUserToken(token);
          }

          await Promise.all([
             usePlayersStore.getState().hydrate(),
             useTournamentsStore.getState().hydrate(),
             useSupportStore.getState().hydrate(),
             useVideoStore.getState().hydrate(),
             useMatchmakingStore.getState().hydrate(),
             // 🛡️ [MIGRATION FIX] (v2.6.802): useAdminStore was omitted during AdminContext→Zustand migration,
             // causing seenAdminActionIds/auditLogs/visitedAdminSubTabs to start empty on every login.
             useAdminStore.getState().hydrate(),
             // 🛡️ [ENHANCEMENT] (v2.6.804): evaluations were lazy-hydrated only on first screen access;
             // now pre-warmed on login so evaluation-dependent screens render instantly.
             useEvaluationsStore.getState().hydrate()
          ]);

          if (rawUser && (rawUser.role === 'admin' || rawUser.role === 'support')) {
            setTimeout(() => {
              if (loadData) {
                console.log('[AuthContext] Triggering instant data pull for staff...');
                loadData(true, true);
              }
            }, 100);
          }
      } catch (e) {
        console.error("[AuthContext] Hydration failed:", e);
      } finally {
        setIsAuthReady(true);
      }
    };
    hydrateSession();
  }, []);

  useEffect(() => {
    if (currentUser?.id) {
      console.log(`[AuthContext] Initializing SyncOrchestrator for ${currentUser.id}`);
      syncOrchestrator.init(currentUser.id, currentUser.role);
    }
    return () => {
      syncOrchestrator.destroy();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (entity === 'currentUser' && (source === 'socket' || source === 'api' || source === 'internal' || source === 'local')) {
        const freshData = await syncOrchestrator.getSystemFlag('currentUser');
        if (freshData) {
          if (currentUser && freshData.id && freshData.id === currentUser.id) {
            useAuthStore.getState().setCurrentUser(freshData);
          } else if (!currentUser) {
            useAuthStore.getState().setCurrentUser(freshData);
          } else {
            console.warn(`[AuthContext] [SESSION_HIJACK_PREVENTED] Rejection mismatced user update. Expected: ${currentUser?.id}, Got: ${freshData.id}`);
          }
        }
      }
    });
    return unsub;
  }, [currentUser]);

  useEffect(() => {
    const unsub = eventBus.subscribe('AUTH_FAILURE', (e) => {
      console.warn(`[AuthContext] 🛑 Terminal Auth Failure detected on ${e.payload.endpoint}.`);
      if (currentUserRef.current && onLogoutRef.current) {
        Alert.alert(
          "Session Expired",
          "Your security session has expired or is no longer valid. Please login again to continue syncing.",
          [{ text: "OK", onPress: () => onLogoutRef.current() }]
        );
        if (Platform.OS === 'web') {
          onLogoutRef.current();
        }
      }
    });
    return unsub;
  }, []);

  const onLogin = useCallback((arg1, arg2) => {
    const user = arg2 && typeof arg2 === 'object' ? arg2 : arg1;
    const token = (arg2 && typeof arg2 === 'object') ? null : (arg1 && arg1.token ? arg1.token : null);
    
    if (user && typeof user === 'object') {
      console.log(`[AuthContext] Login success for user: ${user.id} (${user.role})`);
      logger.logAction('LOGIN_SUCCESS', { userId: user.id, role: user.role });
      
      useAuthStore.getState().login(user);

      syncOrchestrator.setSystemFlag('currentUser', user);
      syncOrchestrator.init(user.id, user.role);
      
      if (user.token || token) {
        const activeToken = user.token || token;
        syncOrchestrator.setUserToken(activeToken);
        if (Platform.OS !== 'web') {
          syncOrchestrator.setSystemFlag('userToken', activeToken);
        }
      }
      syncAndSaveData({ currentUser: user });
      
      setTimeout(async () => {
        if (loadData) {
          await loadData(true, true);
          await Promise.all([
             useSupportStore.getState().hydrate(),
             usePlayersStore.getState().hydrate(),
             useTournamentsStore.getState().hydrate(),
             useAdminStore.getState().hydrate(),
             useEvaluationsStore.getState().hydrate()
          ]);
        }
      }, 500);
      
      if (Platform.OS !== 'web') {
        storage.getItem('push_token').then(pushToken => {
          if (pushToken && user?.id) {
            try {
              const { sendTokenToBackend } = require('../services/notificationService');
              console.log(`📡 [NOTIFY_DEBUG] Syncing push token for logged-in user: ${user.id}`);
              sendTokenToBackend(user.id, pushToken);
            } catch (e) {
              console.warn('[AuthContext] Push token sync deferred:', e.message);
            }
          }
        });
      }
    } else {
      console.warn('[AuthContext] onLogin called with invalid user object:', user);
    }
  }, [syncAndSaveData]);

  const onLogout = useCallback(() => {
    useAuthStore.getState().logout();
    
    const syncableKeys = [
      'currentUser', 'userToken', 'players', 'tournaments', 'matchVideos', 'matches', 
      'matchmaking', 'evaluations', 'supportTickets', 'auditLogs', 
      'chatbotMessages', 'isUsingCloud', 'seenAdminActionIds', 
      'visitedAdminSubTabs', 'sessionCustomAvatar', 'pendingSync'
    ];
    
    syncableKeys.forEach(key => {
      syncOrchestrator.removeSystemFlag(key);
    });

    syncOrchestrator.setUserToken(null);
    syncOrchestrator.reset();
    
    usePlayersStore.getState().setPlayers([]);
    useTournamentsStore.getState().setTournaments([]);
    
    if (Platform.OS === 'web') {
      fetch(`${config.API_BASE_URL}/api/v1/logout`, { method: 'POST' }).catch(() => {});
    }
    
    console.log('[AuthContext] Privacy Guard: All session and sync state cleared.');
  }, []);

  onLogoutRef.current = onLogout;

  const onUpdateUser = useCallback((updatedUser) => {
    useAuthStore.getState().setCurrentUser(updatedUser);
    syncAndSaveData({ currentUser: updatedUser, players: [updatedUser] });
  }, [syncAndSaveData]);

  const onVerifyAccount = useCallback((type) => {
    if (!currentUserRef.current) return;
    const isEmail = type === 'email';
    const updated = { 
      ...currentUserRef.current, 
      [isEmail ? 'isEmailVerified' : 'isPhoneVerified']: true 
    };
    console.log(`[AuthContext] Verifying ${type} for ${currentUserRef.current.id}. New State: E:${!!updated.isEmailVerified} P:${!!updated.isPhoneVerified}`);
    logger.logAction('ACCOUNT_VERIFIED', { type, userId: updated.id, isEmailVerified: updated.isEmailVerified, isPhoneVerified: updated.isPhoneVerified });
    onUpdateUser(updated);
  }, [onUpdateUser]);

  const onRegisterUser = useCallback((newUser, players) => {
    const result = PlayerService.register(newUser, players);
    if (result.success) {
      syncAndSaveData({ players: result.players });
      if (Platform.OS !== 'web' && newUser?.id) {
        storage.getItem('push_token').then(pushToken => {
          if (pushToken) {
            try {
              const { sendTokenToBackend } = require('../services/notificationService');
              sendTokenToBackend(newUser.id, pushToken);
            } catch (e) {
              console.warn('[AuthContext] Push token sync deferred:', e.message);
            }
          }
        });
      }
      return true;
    }
    return false;
  }, [syncAndSaveData]);

  const onResetPassword = useCallback((userId, newPassword, players) => {
    const result = PlayerService.resetPassword(userId, newPassword, players);
    if (result.success) {
      syncAndSaveData({ players: result.players });
      return true;
    }
    return false;
  }, [syncAndSaveData]);

  const onTopUp = useCallback((amount, players) => {
    if (!currentUserRef.current) return;
    const result = PlayerService.topUpWallet(amount, currentUserRef.current, players);
    if (result.success) {
      useAuthStore.getState().setCurrentUser(result.user);
      syncAndSaveData({ players: result.players, currentUser: result.user });
      Alert.alert("Success", `₹${amount} added!`);
    } else {
      Alert.alert("Error", result.message || "Top up failed");
    }
  }, [syncAndSaveData]);

  const onMarkNotificationsRead = useCallback(async () => {
    if (!currentUserRef.current) return;
    const updated = {
      ...currentUserRef.current,
      notifications: (currentUserRef.current.notifications || []).map(n => ({ ...n, read: true }))
    };
    onUpdateUser(updated);
    
    try {
      const token = await storage.getItem('userToken');
      await fetch(`${config.API_BASE_URL}/api/v1/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        credentials: 'include'
      });
    } catch (e) {
      console.warn("[AuthContext] Failed to mark notifications as read on backend", e);
    }
  }, [onUpdateUser]);

  const onMarkSingleNotificationRead = useCallback(async (notifId) => {
    if (!currentUserRef.current) return;
    const updated = {
      ...currentUserRef.current,
      notifications: (currentUserRef.current.notifications || []).map(n => 
        n.id === notifId ? { ...n, read: true } : n
      )
    };
    onUpdateUser(updated);

    try {
      const token = await storage.getItem('userToken');
      await fetch(`${config.API_BASE_URL}/api/v1/mark-read`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.ACE_API_KEY,
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ notifId }),
        credentials: 'include'
      });
    } catch (e) {
      console.warn("[AuthContext] Failed to mark single notification as read on backend", e);
    }
  }, [onUpdateUser]);

  const value = useMemo(() => ({
    currentUser,
    userId: currentUser?.id,
    currentUserRef,
    userRole,
    setUserRole,
    verificationLatch,
    setVerificationLatch,
    viewingLanding,
    setViewingLanding,
    showSignup,
    setShowSignup,
    onLogin,
    onLogout,
    onUpdateUser,
    onVerifyAccount,
    onRegisterUser,
    onResetPassword,
    onTopUp,
    onMarkNotificationsRead,
    onMarkSingleNotificationRead,
    isAuthReady
  }), [
    currentUser, userRole, verificationLatch, viewingLanding, showSignup,
    isAuthReady, onLogin, onLogout, onUpdateUser, onVerifyAccount,
    onRegisterUser, onResetPassword, onTopUp, onMarkNotificationsRead,
    onMarkSingleNotificationRead
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
