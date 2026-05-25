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
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useEvaluationsStore = create((set, get) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'evaluations') {
      const freshData = await syncOrchestrator.getSystemFlag('evaluations');
      if (freshData) set({ evaluations: freshData });
    }
  });

  return {
    evaluations: [],
    setEvaluations: (evals) => set({ evaluations: evals }),

    onSaveEvaluation: async (evaluationData) => {
      const currentEvaluations = get().evaluations || [];
      const updated = [evaluationData, ...currentEvaluations];
      set({ evaluations: updated });
      await syncOrchestrator.syncAndSaveData({ evaluations: updated });
    },

    hydrate: async () => {
      const saved = await syncOrchestrator.getSystemFlag('evaluations');
      if (saved) set({ evaluations: saved });
    }
  };
});

