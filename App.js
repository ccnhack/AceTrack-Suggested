import React, { useRef } from 'react';
import { 
  View, Text, StyleSheet, StatusBar, ActivityIndicator, Modal, TouchableOpacity, Platform
} from 'react-native';
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
if (__DEV__) {
  require('./e2e/test_api');
}

// Context Architecture (Phase 2)
import { MultiProvider } from './context/MultiProvider';
import { useApp } from './context/AppContext';
import { useSync } from './context/SyncContext';
import { useAuth } from './context/AuthContext';
import { usePlayers } from './context/PlayerContext';
import { useTournaments } from './context/TournamentContext';
import { useEvaluations } from './context/EvaluationContext';
import { useSupport } from './context/SupportContext';



// 🛡️ Web Deep Linking Configuration (v2.6.170)
const APP_VERSION = "2.6.185";
const linking = {
  prefixes: ['https://acetrack-suggested.onrender.com', 'acetrack://'],
  config: {
    screens: {
      SupportSetup: 'setup/:token',
      Login: 'login',
      Signup: 'signup',
      Main: {
        screens: {
          Explore: '',
          Admin: 'admin',
          Support: 'support',
          Profile: 'profile'
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
  
  const { isFullyConnected, isSyncing } = useSync();
  const { currentUser, userRole, userId, onMarkNotificationsRead } = useAuth();
  const { players } = usePlayers();
  const { tournaments } = useTournaments();
  const { evaluations } = useEvaluations();
  const { onSaveTicket, chatbotMessages, onSendChatMessage } = useSupport();

  const navigationRef = useRef();
  if (isLoading || !isInitialized) {
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
            evaluations={evaluations}
            chatbotMessages={chatbotMessages}
            onSendChatMessage={onSendChatMessage}
            tournaments={tournaments}
            onSaveTicket={onSaveTicket}
            players={players}
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

      <NotificationsModal 
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={currentUser?.notifications || []}
        onClear={onMarkNotificationsRead}
        onNotificationClick={(notif) => {
          setShowNotifications(false);
          if (navigationRef.current) {
            if (notif.type === 'support') navigationRef.current.navigate('Profile');
            else if (notif.type === 'video') navigationRef.current.navigate('Recordings');
            else if (notif.type === 'challenge') navigationRef.current.navigate('Matches');
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
            style={styles.updateButton}
            onPress={async () => {
              if (Platform.OS === 'web') {
                if (typeof window !== 'undefined') {
                  // 🚀 HARD REFRESH ENGINE (v2.6.170)
                  // Aggressive cache bypass to ensure obsolete sessions get the new bundle.
                  try {
                    // 1. Unregister all service workers
                    if ('serviceWorker' in navigator) {
                      const registrations = await navigator.serviceWorker.getRegistrations();
                      for (let registration of registrations) {
                        await registration.unregister();
                      }
                    }
                    // 2. Clear cache storage if supported
                    if (window.caches) {
                      const cacheNames = await window.caches.keys();
                      for (let name of cacheNames) {
                        await window.caches.delete(name);
                      }
                    }
                  } catch (e) {
                    console.warn("Silent cache clear failed:", e);
                  }
                  
                  // 3. Force reload with cache-busting query param
                  const currentUrl = new URL(window.location.href);
                  currentUrl.searchParams.set('v', Date.now().toString());
                  window.location.href = currentUrl.toString();
                }
              } else {
                try {
                  const update = await Updates.checkForUpdateAsync();
                  if (update.isAvailable) {
                    await Updates.fetchUpdateAsync();
                    await Updates.reloadAsync();
                  }
                } catch (e) {
                  console.error("Update error:", e);
                }
              }
            }}
          >
            <Text style={styles.updateButtonText}>{Platform.OS === 'web' ? 'Refresh Browser' : 'Download OTA Update'}</Text>
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
          <MultiProvider>
            <Root />
          </MultiProvider>
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
