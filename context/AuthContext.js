import React, { createContext, useContext, useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Alert } from 'react-native';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import { eventBus } from '../services/EventBus';
import PlayerService from '../services/PlayerService';
import storage from '../utils/storage';
import logger from '../utils/logger';
import { Platform } from 'react-native';
import config from '../config';

import { useSync } from './SyncContext';
import { useAuthStore } from '../stores';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserRef = useRef(null);
  const [userRole, setUserRole] = useState(null);
  const [verificationLatch, setVerificationLatch] = useState({ email: false, phone: false });
  const [viewingLanding, setViewingLanding] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  
  const { syncAndSaveData } = useSync();

  // 🛡️ [C-1 FIX] (v2.6.315): Ref-based logout to prevent stale closure in AUTH_FAILURE listener
  const onLogoutRef = useRef(null);

  // Sync state and ref
  // 🛡️ [ZUSTAND_BRIDGE] (v2.6.508): Keep Zustand useAuthStore in sync with AuthContext.
  // Critical: Store actions (onRegister, onJoinWaitlist, etc.) read currentUser from 
  // useAuthStore.getState().currentUser. Without this bridge, it is always null,
  // causing "Missing user or tournament" failures on registration.
  useEffect(() => {
    currentUserRef.current = currentUser;
    useAuthStore.getState().setCurrentUser(currentUser);
  }, [currentUser]);

  // Initial Session Hydration
  useEffect(() => {
    const hydrateSession = async () => {
      try {
          let rawUser = await storage.getItem('currentUser');
          let token = await storage.getItem('userToken');

          // 🛡️ [HTTP_ONLY_TRANSITION_CLEANUP] (v2.6.430)
          if (Platform.OS === 'web' && token) {
             console.log(`[AuthContext] Sweeping legacy localStorage token to enforce cookies...`);
             await storage.removeItem('userToken');
             token = null; // Strictly force cookie fallback
          }

          // 🛡️ [WEB_SESSION_RESTORE] (v2.6.258)
          // If on web and no local credentials (or unreadable encrypted state), 
          // attempt to verify HTTP-Only cookie session via backend.
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
                credentials: 'include' // 🛡️ Force cookies for cross-port hydration
              });
              
              if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                  console.log(`[AuthContext] Cookie session found for: ${data.user.id}`);
                  rawUser = data.user;
                  // Note: token remains null for web, relying exclusively on cookies
                }
              }
            } catch (authErr) {
              console.warn(`[AuthContext] Cookie session check failed:`, authErr.message);
            }
          }

          if (rawUser) {
            console.log(`[AuthContext] Hydrating session for: ${rawUser.id}`);
            setCurrentUser(rawUser);
            setUserRole(rawUser.role);
            setViewingLanding(false);
            
            // Re-initialize SyncOrchestrator immediately for background processes
            syncOrchestrator.init(rawUser.id, rawUser.role);
            if (token) syncOrchestrator.setUserToken(token);
          }
      } catch (e) {
        console.error("[AuthContext] Hydration failed:", e);
      } finally {
        setIsAuthReady(true);
      }
    };
    hydrateSession();
  }, []);

  // SyncOrchestrator Lifecycle
  useEffect(() => {
    if (currentUser?.id) {
      console.log(`[AuthContext] Initializing SyncOrchestrator for ${currentUser.id}`);
      syncOrchestrator.init(currentUser.id, currentUser.role);
    }
    return () => {
      syncOrchestrator.destroy();
    };
  }, [currentUser?.id]);

  // Entity Listener for currentUser updates from cloud AND local store actions
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      // 🛡️ [WALLET_SYNC_FIX] (v2.6.514): Added 'local' source to fix wallet/credits
      // not updating after opt-out refund. Store actions emit with source='local',
      // which was previously filtered out, leaving the wallet UI permanently stale.
      if (entity === 'currentUser' && (source === 'socket' || source === 'api' || source === 'internal' || source === 'local')) {
        const freshData = await syncOrchestrator.getSystemFlag('currentUser');
        if (freshData) {
          // 🛡️ [IDENTITY GUARD] (v2.6.118)
          // Critical session protection: Only update state if the ID matches the current user.
          // This prevents the session from being swapped by mismatched background sync events.
          if (currentUser && freshData.id && freshData.id === currentUser.id) {
            setCurrentUser(freshData);
            setUserRole(freshData.role);
          } else if (!currentUser) {
            // Initial hydration case
            setCurrentUser(freshData);
            setUserRole(freshData.role);
          } else {
            console.warn(`[AuthContext] [SESSION_HIJACK_PREVENTED] Rejection mismatced user update. Expected: ${currentUser?.id}, Got: ${freshData.id}`);
          }
        }
      }
    });
    return unsub;
  }, [currentUser]);

  // 🛡️ [AUTH FAILURE GUARD] (v2.6.192)
  // 🛡️ [C-1 FIX] (v2.6.315): Use onLogoutRef to avoid stale closure dependency
  useEffect(() => {
    const unsub = eventBus.subscribe('AUTH_FAILURE', (e) => {
      console.warn(`[AuthContext] 🛑 Terminal Auth Failure detected on ${e.payload.endpoint}.`);
      if (currentUserRef.current && onLogoutRef.current) {
        Alert.alert(
          "Session Expired",
          "Your security session has expired or is no longer valid. Please login again to continue syncing.",
          [{ text: "OK", onPress: () => onLogoutRef.current() }]
        );
        // Fallback for web where Alert.alert might be subtle or blocked
        if (Platform.OS === 'web') {
          onLogoutRef.current();
        }
      }
    });
    return unsub;
  }, []);

  const onLogin = useCallback((arg1, arg2) => {
    // Handle polymorphic arguments: onLogin(user) OR onLogin(role, user)
    // 🛡️ [JWT UPDATED] (v2.6.190): Extract token from login result
    const user = arg2 && typeof arg2 === 'object' ? arg2 : arg1;
    const token = (arg2 && typeof arg2 === 'object') ? null : (arg1 && arg1.token ? arg1.token : null);
    // Actually, LoginScreen calls onLoginSuccess(role, user) but we updated routes to return { success, token, user }
    // Let's refine the LoginScreen call to pass the token.
    
    if (user && typeof user === 'object') {
      console.log(`[AuthContext] Login success for user: ${user.id} (${user.role})`);
      logger.logAction('LOGIN_SUCCESS', { userId: user.id, role: user.role });
      setCurrentUser(user);
      setUserRole(user.role);
      setViewingLanding(false);

      // 🛡️ [SESSION_TRACK_FIX] (v2.6.270): Save currentUser to storage BEFORE init()
      // so that setupSocket can read the role for the WS handshake query params.
      // Previously, init() was called first which caused a race condition where
      // the role was read as 'user' instead of 'support'.
      syncOrchestrator.setSystemFlag('currentUser', user);

      syncOrchestrator.init(user.id, user.role);
      
      // If we received a token, persist it (v2.6.190)
      if (user.token || token) {
        const activeToken = user.token || token;
        syncOrchestrator.setUserToken(activeToken);
        
        // 🛡️ [HTTP_ONLY_TRANSITION] (v2.6.258): 
        // On web, we rely on secure cookies and do NOT store the token in local storage.
        if (Platform.OS !== 'web') {
          syncOrchestrator.setSystemFlag('userToken', activeToken);
        }
      }
      syncAndSaveData({ currentUser: user });
      
      // 🛡️ [PUSH TOKEN SYNC ON LOGIN] (v2.6.121)
      // If a push token is already registered, sync it for the new user
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
    setCurrentUser(null);
    setUserRole(null);
    setViewingLanding(true);
    
    // 🔒 PRIVACY GUARD: Clear all user-specific data from local storage
    const syncableKeys = [
      'currentUser', 'userToken', 'players', 'tournaments', 'matchVideos', 'matches', 
      'matchmaking', 'evaluations', 'supportTickets', 'auditLogs', 
      'chatbotMessages', 'isUsingCloud', 'seenAdminActionIds', 
      'visitedAdminSubTabs', 'sessionCustomAvatar', 'pendingSync'
    ];
    
    // 🛡️ [SECURITY FIX] (v2.6.315): Always clear ALL user data on logout.
    // Previously skipped clearing in dev mode (__DEV__), which masked production bugs.
    // E2E tests that need data persistence should use a dedicated mock backend instead.
    syncableKeys.forEach(key => {
      syncOrchestrator.removeSystemFlag(key);
    });

    syncOrchestrator.setUserToken(null);
    
    // 🛡️ [COOKIE_CLEANUP] (v2.6.258): Notify backend to clear secure cookie on web logout
    if (Platform.OS === 'web') {
      fetch(`${config.API_BASE_URL}/api/v1/logout`, { method: 'POST' }).catch(() => {});
    }
    
    console.log('[AuthContext] Privacy Guard: All session data cleared.');
  }, []);

  // 🛡️ [C-1 FIX] (v2.6.315): Keep ref in sync so AUTH_FAILURE listener always has latest
  onLogoutRef.current = onLogout;


  const onRegisterUser = useCallback((newUser, players) => {
    const result = PlayerService.register(newUser, players);
    if (result.success) {
      syncAndSaveData({ players: result.players });
      
      // 🛡️ [PUSH TOKEN SYNC ON SIGNUP] (v2.6.121)
      if (Platform.OS !== 'web' && newUser?.id) {
        storage.getItem('push_token').then(pushToken => {
          if (pushToken) {
            try {
              const { sendTokenToBackend } = require('../services/notificationService');
              console.log(`📡 [NOTIFY_DEBUG] Syncing push token for new user: ${newUser.id}`);
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
    const result = PlayerService.topUpWallet(amount, currentUserRef.current.id, players);
    if (result.success) {
      setCurrentUser(result.user);
      syncAndSaveData({ players: result.players, currentUser: result.user });
      Alert.alert("Success", `₹${amount} added!`);
    } else {
      Alert.alert("Error", result.message || "Top up failed");
    }
  }, [syncAndSaveData]);

  const onUpdateUser = useCallback((updatedUser) => {
    setCurrentUser(updatedUser);
    syncAndSaveData({ currentUser: updatedUser });
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

  const onMarkNotificationsRead = useCallback(() => {
    if (!currentUserRef.current) return;
    const updated = {
      ...currentUserRef.current,
      notifications: (currentUserRef.current.notifications || []).map(n => ({ ...n, read: true }))
    };
    onUpdateUser(updated);
  }, [onUpdateUser]);

  // 🛡️ [AUDIT FIX] (v2.6.327): Memoize value to prevent unnecessary re-renders
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
    isAuthReady
  }), [
    currentUser, userRole, verificationLatch, viewingLanding, showSignup,
    isAuthReady, onLogin, onLogout, onUpdateUser, onVerifyAccount,
    onRegisterUser, onResetPassword, onTopUp, onMarkNotificationsRead
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
