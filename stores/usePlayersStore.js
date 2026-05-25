import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { useSyncStore } from './useSyncStore.js';
import { useAppStore } from './useAppStore.js';
import { useTournamentsStore } from './useTournamentsStore.js';
import { useSupportStore } from './useSupportStore.js';
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const usePlayersStore = create((set, get) => {
  // Subscribe to player entity updates from EventBus
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'players') {
      const freshData = await syncOrchestrator.getSystemFlag('players');
      if (freshData) set({ players: freshData });
    }
  });

  return {
    players: [],
    setPlayers: (players) => set({ players }),

    // Hydrate from storage
    hydrate: async () => {
      const saved = await syncOrchestrator.getSystemFlag('players');
      if (saved) {
        set({ players: saved });
        get().performReferralBackfill();
      }
    },

    performReferralBackfill: () => {
      const players = get().players;
      if (players.length > 0 && players.some(p => !p.referralCode)) {
        const getStableSuffix = (id) => {
          const str = String(id);
          let hash = 0;
          for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
          return Math.abs(hash).toString(36).substring(0, 4).toUpperCase();
        };

        const updated = players.map(p => {
          if (!p.referralCode) {
            return {
              ...p,
              referralCode: `ACE-${(p.id || 'PLAYER').substring(0, 5).toUpperCase()}-${getStableSuffix(p.id || 'PLAYER')}`
            };
          }
          return p;
        });

        if (updated.some((p, i) => p !== players[i])) {
          console.log('[PlayersStore] Backfilling referral codes for legacy players (local only)...');
          set({ players: updated });
          storage.setItem('players', updated);
        }
      }
    },

    sendUserNotification: (targetUserId, notification) => {
      const currentPlayers = get().players;
      const updatedPlayers = currentPlayers.map(p => {
        if (String(p.id).toLowerCase() === String(targetUserId).toLowerCase()) {
          const newNotif = {
            id: `notif_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            ...notification,
            timestamp: new Date().toISOString(),
            isRead: false
          };
          return {
            ...p,
            notifications: [newNotif, ...(p.notifications || [])]
          };
        }
        return p;
      });
      
      set({ players: updatedPlayers });
      syncOrchestrator.syncAndSaveData({ players: updatedPlayers });
    }
  };
});

