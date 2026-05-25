import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { usePlayersStore } from './usePlayersStore.js';
import { useSyncStore } from './useSyncStore.js';
import { useAppStore } from './useAppStore.js';
import { useTournamentsStore } from './useTournamentsStore.js';
import { useSupportStore } from './useSupportStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useMatchmakingStore = create((set) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'matchmaking') {
      const freshData = await syncOrchestrator.getSystemFlag('matchmaking');
      if (freshData) set({ matchmaking: freshData });
    }
  });

  return {
    matchmaking: [],
    setMatchmaking: (mm) => set({ matchmaking: mm }),

    hydrate: async () => {
      const saved = await syncOrchestrator.getSystemFlag('matchmaking');
      if (saved) set({ matchmaking: saved });
    }
  };
});

