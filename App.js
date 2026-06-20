import React, { useRef, useState } from 'react';
import { 
  View, Text, StyleSheet, StatusBar, ActivityIndicator, Modal, TouchableOpacity, Platform, Alert, LogBox
} from 'react-native';

// 🛡️ Disable all yellow warning overlays during E2E tests
LogBox.ignoreAllLogs();

// 🌐 [v2.6.628] FORCE GLOBAL TIMEZONE TO IST (Indian Standard Time)
const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
Date.prototype.toLocaleTimeString = function(locales, options) {
  const finalOptions = { ...(options || {}), timeZone: 'Asia/Kolkata' };
  let str = originalToLocaleTimeString.call(this, 'en-IN', finalOptions);
  if (typeof str === 'string' && !str.includes('IST')) {
    str += ' IST';
  }
  return str;
};

const originalToLocaleDateString = Date.prototype.toLocaleDateString;
Date.prototype.toLocaleDateString = function(locales, options) {
  const finalOptions = { ...(options || {}), timeZone: 'Asia/Kolkata' };
  return originalToLocaleDateString.call(this, 'en-IN', finalOptions);
};

const originalToLocaleString = Date.prototype.toLocaleString;
Date.prototype.toLocaleString = function(locales, options) {
  const finalOptions = { ...(options || {}), timeZone: 'Asia/Kolkata' };
  let str = originalToLocaleString.call(this, 'en-IN', finalOptions);
  if (typeof str === 'string' && !str.includes('IST')) {
    str += ' IST';
  }
  return str;
};
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Updates from 'expo-updates';

import AppNavigator from './navigation/AppNavigator';
import ErrorBoundary from './components/ErrorBoundary';
import OfflineScreen from './components/OfflineScreen';
import ChatBot from './components/ChatBot';
import NotificationsModal from './components/NotificationsModal';
import InteractiveDemo, { useInteractiveDemo } from './components/InteractiveDemo';
import AcademyInteractiveDemo, { useAcademyInteractiveDemo } from './components/AcademyInteractiveDemo';
import CoachInteractiveDemo, { useCoachInteractiveDemo } from './components/CoachInteractiveDemo';
import config from './config';

// 🏗️ Phase 3: React Query
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './stores/queryClient';
if (__DEV__) {
  require('./e2e/test_api');
}

// 🛡️ [FETCH_CREDENTIALS_OVERRIDE] (v2.6.258)
// Ensure cookies are sent with every API request on the web to support HTTP-Only sessions.
if (Platform.OS === 'web') {
  const originalFetch = window.fetch;
  window.fetch = function(url, options = {}) {
    // Only apply to our own API to avoid leaking cookies to 3rd parties
    const isInternal = typeof url === 'string' && (url.includes('onrender.com') || url.includes('localhost') || url.includes('127.0.0.1'));
    
    if (isInternal) {
      console.log(`[FetchInterceptor] Applying credentials:include & security headers to ${url}`);
      options.credentials = 'include';
      
      // 🛡️ [WEB_AUTH_HARDENING] (v2.6.259)
      // Automatically add the mandatory API Key for web requests
      options.headers = {
        ...options.headers,
        'x-ace-api-key': config.PUBLIC_APP_ID
      };

      // 🛡️ [MALFORMED_AUTH_STRIP] (v2.6.259)
      // If a component sends "Bearer null" (common on web where localStorage is empty),
      // ✅ [v2.6.577] Added debounced doubles partner lookup, unified 1-slot vs 2-slot cost calculations, and integrated dynamic team construction along with direct dashboard rendering via updated Player doc fields in the backend.
      const auth = options.headers['Authorization'] || options.headers['authorization'];
      if (auth === 'Bearer null' || auth === 'Bearer undefined') {
        console.log(`[FetchInterceptor] Stripping malformed Authorization header from ${url}`);
        delete options.headers['Authorization'];
        delete options.headers['authorization'];
      }
    }
    return originalFetch(url, options);
  };
}

// Context Architecture (Phase 2)
import { MultiProvider } from './context/MultiProvider';
import { useApp } from './context/AppContext';
import { useSync } from './context/SyncContext';
import { useAuth } from './context/AuthContext';
import { usePlayersStore } from './stores';
import { useSupportStore } from './stores';



// 🔄 Centralized Versioning// 🚀 EXPO OTA SYNC HUB
// 🚀 EXPO OTA SYNC HUB
// ALWAYS BUMP THIS VERSION TO TRIGGER CLIENT-SIDE CACHE INVALIDATION
const APP_VERSION = '2.6.681';
const linking = {
  prefixes: [config.API_BASE_URL || 'https://acetrack-suggested.onrender.com', 'acetrack://'],
  config: {
    screens: {
      SupportSetup: 'setup/:token',
      Login: 'login',
      Signup: 'signup',
      Main: {
        screens: {
          Explore: 'explore',
          Admin: 'admin',
          Support: 'support',
          Profile: 'profile',
          OrgChat: 'OrgChat'
        }
      }
    }
  }
};

function Root() {

  const { 
    isLoading, isInitialized, appVersion, latestAppVersion, 
    showForceUpdate, setShowForceUpdate, showNotifications, setShowNotifications
  } = useApp();
  
  const [isUpdating, setIsUpdating] = useState(false);
  
  const { isFullyConnected, isSyncing } = useSync();
  const { currentUser, userRole, userId, onMarkNotificationsRead, onMarkSingleNotificationRead, isAuthReady } = useAuth();
  
  const { showDemo, hasChecked, markDemoSeen } = useInteractiveDemo(currentUser);
  const { showDemo: showAcademyDemo, hasChecked: academyHasChecked, markDemoSeen: markAcademyDemoSeen } = useAcademyInteractiveDemo(currentUser);
  const { showDemo: showCoachDemo, hasChecked: coachHasChecked, markDemoSeen: markCoachDemoSeen } = useCoachInteractiveDemo(currentUser);

  const navigationRef = useRef();
  if (isLoading || !isInitialized || !isAuthReady) {
    return (
      <View testID="app.loading.container" style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#EF4444" />
        <Text style={styles.loadingText}>Initializing AceTrack...</Text>
      </View>
    );
  }


  return (
    <View style={{ flex: 1 }}>
      <StatusBar barStyle="dark-content" />
      
      <NavigationContainer ref={navigationRef} linking={linking}>
        <AppNavigator />
        
        {/* Global Connectivity Overlay */}
        {!isFullyConnected && (
          <OfflineScreen onRetry={() => {/* SyncContext handles reconnections */}} />
        )}

        {/* Global AI ChatBot (only for logged in users) */}
        {currentUser && (
          <ChatBot 
            user={currentUser}
            userRole={userRole}
            userId={userId}
            userSports={currentUser.preferredSports || []}
          />
        )}

        {/* Global Sync Indicator */}
        {isSyncing && (
          <View style={styles.syncIndicator}>
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text style={styles.syncText}>Syncing...</Text>
          </View>
        )}
      </NavigationContainer>

      <InteractiveDemo 
        visible={showDemo && hasChecked}
        onComplete={markDemoSeen}
      />
      <AcademyInteractiveDemo 
        visible={showAcademyDemo && academyHasChecked}
        onComplete={markAcademyDemoSeen}
      />
      <CoachInteractiveDemo 
        visible={showCoachDemo && coachHasChecked}
        onComplete={markCoachDemoSeen}
      />

      <NotificationsModal 
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={currentUser?.notifications || []}
        onClear={onMarkNotificationsRead}
        onNotificationClick={(notif) => {
          setShowNotifications(false);
          if (notif.id && onMarkSingleNotificationRead) {
            onMarkSingleNotificationRead(notif.id);
          }
          if (navigationRef.current) {
            if (notif.type === 'support') navigationRef.current.navigate('Main', { screen: 'Profile' });
            else if (notif.type === 'video') navigationRef.current.navigate('Main', { screen: 'Recordings' });
            else if (notif.type === 'challenge') navigationRef.current.navigate('Main', { screen: 'Matches' });
            else if (notif.type && notif.type.startsWith('TOURNAMENT')) navigationRef.current.navigate('Main', { screen: 'Explore' });
            else if (notif.type === 'COACH_INDIVIDUAL_PING') navigationRef.current.navigate('Main', { screen: 'Explore' });
            else navigationRef.current.navigate('Main', { screen: 'Profile' });
          }
        }}
      />

      {/* Mandatory OTA Update & Web Refresh Modal */}
      <Modal testID="app.update.modal" visible={showForceUpdate} transparent={false} animationType="fade">
        <View style={styles.updateModalContainer}>
          <Ionicons name="cloud-download" size={80} color="#38BDF8" style={{ marginBottom: 24 }} />
          <Text style={styles.updateTitle}>Update Required</Text>
          <Text style={styles.updateDescription}>
            Version {appVersion} is obsolete. {Platform.OS === 'web' ? 'Please refresh this page to load the latest release.' : `Please update to ${latestAppVersion} to restore network access.`}
          </Text>
          <TouchableOpacity 
            style={[styles.updateButton, isUpdating && { opacity: 0.7 }]}
            disabled={isUpdating}
            onPress={async () => {
              if (isUpdating) return;
              setIsUpdating(true);
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined') {
                  // 🚀 HARD REFRESH ENGINE (v2.6.170)
                  try {
                    if ('serviceWorker' in navigator) {
                      const registrations = await navigator.serviceWorker.getRegistrations();
                      for (let registration of registrations) await registration.unregister();
                    }
                    if (window.caches) {
                      const cacheNames = await window.caches.keys();
                      for (let name of cacheNames) await window.caches.delete(name);
                    }
                  } catch (e) { console.warn('[UpdateEngine] Cache cleanup failed:', e.message); }
                  const currentUrl = new URL(window.location.href);
                  currentUrl.searchParams.set('v', Date.now().toString());
                  window.location.href = currentUrl.toString();
                }
              } else {
                try {
                  console.log("[UpdateEngine] Checking for updates...");
                  
                  // 🛡️ [UPDATE_SAFETY_TIMEOUT] (v2.6.285)
                  // Prevent the UI from hanging if the update server is unreachable
                  const updatePromise = Updates.checkForUpdateAsync();
                  const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 10000));
                  
                  const update = await Promise.race([updatePromise, timeoutPromise]);
                  
                  if (update.isAvailable) {
                    console.log("[UpdateEngine] Update found, fetching...");
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  } else {
                    const channel = Updates.channel || 'unknown';
                    const runtimeVersion = Updates.runtimeVersion || 'unknown';
                    console.log(`[UpdateEngine] No update available. Channel: ${channel}, Runtime: ${runtimeVersion}`);
                    Alert.alert(
                      "Up to Date", 
                      `No new updates found on your current branch (${channel}).\nRuntime: ${runtimeVersion}\nCurrent: ${appVersion}\nLatest: ${latestAppVersion}`,
                      [{ text: "OK" }, { text: "Force Reload", onPress: () => Updates.reloadAsync() }]
                    );
                  }
                } catch (e) {
                  console.error("Update error:", e);
                  const errorMsg = e.message === 'Timeout' ? "Update server timed out. Try again." : "Failed to reach update server.";
                  Alert.alert(
                    "Update Error", 
                    `${errorMsg}\n\nTechnical details: ${e.message}`,
                    [{ text: "Retry" }, { text: "Force Reload", onPress: () => Updates.reloadAsync() }]
                  );
                } finally {
                  setIsUpdating(false);
                }
              }
            }}
          >
            {isUpdating ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.updateButtonText}>{Platform.OS === 'web' ? 'Refresh Browser' : 'Download OTA Update'}</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <MultiProvider>
              <Root />
            </MultiProvider>
          </QueryClientProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 12,
    color: '#64748B',
    fontSize: 14,
    fontWeight: '500',
  },
  updateModalContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  updateTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  updateDescription: {
    fontSize: 16,
    color: '#94A3B8',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 24,
  },
  updateButton: {
    width: '100%',
    paddingVertical: 18,
    backgroundColor: '#10B981',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
  },
  updateButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
    textTransform: 'uppercase',
  },
  syncIndicator: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
  },
  syncText: {
    color: '#FFFFFF',
    fontSize: 12,
    marginLeft: 6,
    fontWeight: 'bold',
  }
});
