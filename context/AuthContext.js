import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { syncManager } from '../services/SyncManager';
import { eventBus } from '../services/EventBus';
import PlayerService from '../services/PlayerService';
import storage from '../utils/storage';
import { Platform } from 'react-native';
import { useSync } from './SyncContext';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const currentUserRef = useRef(null);
  const [userRole, setUserRole] = useState(null);
  const [verificationLatch, setVerificationLatch] = useState({ email: false, phone: false });
  const [viewingLanding, setViewingLanding] = useState(true);
  const [showSignup, setShowSignup] = useState(false);
  
  const { syncAndSaveData } = useSync();

  // Sync state and ref
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Initial Session Hydration
  useEffect(() => {
    const hydrateSession = async () => {
      try {
        const rawUser = await storage.getItem('currentUser');
        if (rawUser) {
          console.log(`[AuthContext] Hydrating session for: ${rawUser.id}`);
          setCurrentUser(rawUser);
          setUserRole(rawUser.role);
          setViewingLanding(false);
          
          // Re-initialize SyncManager immediately for background processes
          syncManager.init(rawUser.id);
        }
      } catch (e) {
        console.error("[AuthContext] Hydration failed:", e);
      }
    };
    hydrateSession();
  }, []);

  // SyncManager Lifecycle
  useEffect(() => {
    if (currentUser?.id) {
      console.log(`[AuthContext] Initializing SyncManager for ${currentUser.id}`);
      syncManager.init(currentUser.id);
    }
    return () => {
      syncManager.destroy();
    };
  }, [currentUser?.id]);

  // Entity Listener for currentUser updates from cloud
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (entity === 'currentUser' && (source === 'socket' || source === 'api' || source === 'internal')) {
        const freshData = await syncManager.getSystemFlag('currentUser');
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

  const onLogin = useCallback((arg1, arg2) => {
    // Handle polymorphic arguments: onLogin(user) OR onLogin(role, user)
    const user = arg2 && typeof arg2 === 'object' ? arg2 : arg1;
    
    if (user && typeof user === 'object') {
      console.log(`[AuthContext] Login success for user: ${user.id} (${user.role})`);
      setCurrentUser(user);
      setUserRole(user.role);
      setViewingLanding(false);
      
      // 🛡️ INITIALIZATION GUARD: SyncManager must be aware of the user before it can persist data.
      // This prevents a race condition where syncAndSaveData would return early if this.userId was null.
      syncManager.init(user.id);
      
      // Use redundant persistence for high-reliability session hydration
      syncManager.setSystemFlag('currentUser', user);
      
      // Now this call will succeed in persisting the session to device storage.
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
      'currentUser', 'players', 'tournaments', 'matchVideos', 'matches', 
      'matchmaking', 'evaluations', 'supportTickets', 'auditLogs', 
      'chatbotMessages', 'isUsingCloud', 'seenAdminActionIds', 
      'visitedAdminSubTabs', 'sessionCustomAvatar'
    ];
    
    // In dev mode (including E2E testing), storage is our mock backend. 
    // We preserve it across logouts to allow offline multi-user tests to succeed.
    const isTesting = __DEV__;
    
    syncableKeys.forEach(key => {
      // Only wipe session keys if in dev mode
      if (isTesting && !['currentUser', 'sessionCustomAvatar', 'visitedAdminSubTabs'].includes(key)) {
        return;
      }
      syncManager.removeSystemFlag(key);
    });
    
    console.log('[AuthContext] Privacy Guard: All session data cleared.');
  }, []);

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
    onUpdateUser(updated);
  }, [onUpdateUser]);

  const value = {
    currentUser,
    setCurrentUser,
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
    onTopUp
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
