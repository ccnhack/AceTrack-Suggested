import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { usePlayersStore } from './usePlayersStore.js';
import { useSyncStore } from './useSyncStore.js';
import { useTournamentsStore } from './useTournamentsStore.js';
import { useSupportStore } from './useSupportStore.js';
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useAppStore = create((set) => {
  return {
    // State
    isLoading: true,
    isInitialized: false,
    isUploadingLogs: false,
    showForceUpdate: false,
    showNotifications: false,
    appVersion: null, // Set during initialization
    latestAppVersion: null,

    // Actions
    setIsLoading: (v) => set({ isLoading: v }),
    setIsInitialized: (v) => set({ isInitialized: v }),
    setIsUploadingLogs: (v) => set({ isUploadingLogs: v }),
    setShowForceUpdate: (v) => set({ showForceUpdate: v }),
    setShowNotifications: (v) => set({ showNotifications: v }),
    setAppVersion: (v) => set({ appVersion: v }),
    setLatestAppVersion: (v) => set({ latestAppVersion: v }),
  };
});

