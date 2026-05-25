import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { usePlayersStore } from './usePlayersStore.js';
import { useAppStore } from './useAppStore.js';
import { useTournamentsStore } from './useTournamentsStore.js';
import { useSupportStore } from './useSupportStore.js';
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useSyncStore = create((set, get) => {
  // Subscribe to EventBus on store creation
  eventBus.subscribe('CONNECTIVITY_CHANGED', (e) => {
    set({ isFullyConnected: e.payload.isOnline });
  });

  eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
    if (e.payload.isOnline !== undefined) set({ isCloudOnline: e.payload.isOnline });
    if (e.payload.isSyncing !== undefined) set({ isSyncing: e.payload.isSyncing });
  });

  return {
    // State
    isCloudOnline: false,
    isSyncing: false,
    isFullyConnected: true,
    lastSyncTime: null,
    isUsingCloud: true,
    serverClockOffset: 0,
    isNotificationsEnabled: true,

    // Actions
    setServerClockOffset: (offset) => set({ serverClockOffset: offset }),
    setLastSyncTime: (time) => set({ lastSyncTime: time }),
    
    toggleCloud: () => {
      const next = !get().isUsingCloud;
      set({ isUsingCloud: next });
      syncOrchestrator.setSystemFlag('isUsingCloud', next);
    },

    toggleNotifications: () => {
      const next = !get().isNotificationsEnabled;
      set({ isNotificationsEnabled: next });
      syncOrchestrator.setSystemFlag('isNotificationsEnabled', next);
    },

    // Hydrate from storage on first use
    hydrate: async () => {
      const savedNotifs = await syncOrchestrator.getSystemFlag('isNotificationsEnabled');
      if (savedNotifs !== null) set({ isNotificationsEnabled: savedNotifs });
    }
  };
});

