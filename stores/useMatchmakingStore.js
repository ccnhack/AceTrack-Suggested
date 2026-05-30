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
    if (e.payload.entity === 'partnerRequests') {
      const freshData = await syncOrchestrator.getSystemFlag('partnerRequests');
      if (freshData) set({ partnerRequests: freshData });
    }
  });

  return {
    matchmaking: [],
    partnerRequests: [],
    setMatchmaking: (mm) => set({ matchmaking: mm }),
    setPartnerRequests: (pr) => set({ partnerRequests: pr }),

    hydrate: async () => {
      const [savedMM, savedPR] = await Promise.all([
        syncOrchestrator.getSystemFlag('matchmaking'),
        syncOrchestrator.getSystemFlag('partnerRequests')
      ]);
      if (savedMM) set({ matchmaking: savedMM });
      if (savedPR) set({ partnerRequests: savedPR });
    }
  };
});

