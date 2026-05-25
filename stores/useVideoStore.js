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
import { useEvaluationsStore } from './useEvaluationsStore.js';

export const useVideoStore = create((set, get) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    const { entity, source } = e.payload;
    if ((entity === 'matchVideos' || entity === 'matches') && (source === 'socket' || source === 'api')) {
      const freshData = await syncOrchestrator.getSystemFlag(entity);
      if (freshData) {
        if (entity === 'matchVideos') set({ matchVideos: freshData });
        if (entity === 'matches') set({ matches: freshData });
      }
    }
  });

  return {
    matchVideos: [],
    matches: [],
    setMatchVideos: (matchVideos) => set({ matchVideos }),
    setMatches: (matches) => set({ matches }),

    hydrate: async () => {
      const vids = await syncOrchestrator.getSystemFlag('matchVideos');
      const matches = await syncOrchestrator.getSystemFlag('matches');
      if (vids) set({ matchVideos: vids });
      if (matches) set({ matches: matches });
    },

    onVideoPlay: (vid) => {
      const VideoService = require('../services/VideoService').default;
      const currentUser = useAuthStore.getState().currentUser;
      const uid = currentUser?.id;
      const result = VideoService.trackView(vid, uid, get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos });
    },

    onBulkUpdateVideoStatus: (ids, status) => {
      const VideoService = require('../services/VideoService').default;
      const result = VideoService.bulkUpdateStatus(ids, status, get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos }, true);
    },

    onBulkPermanentDeleteVideos: (ids) => {
      const VideoService = require('../services/VideoService').default;
      const result = VideoService.bulkDelete(ids, get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos }, true); 
    },

    onForceRefundVideo: (id) => {
      const VideoService = require('../services/VideoService').default;
      const result = VideoService.refundVideo(id, get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos });
    },

    onApproveDeleteVideo: (id) => {
      const VideoService = require('../services/VideoService').default;
      const players = usePlayersStore.getState().players;
      const result = VideoService.approveDeletion(id, get().matchVideos, players);
      if (result.success) {
        set({ matchVideos: result.videos });
        usePlayersStore.getState().setPlayers(result.players);
        syncOrchestrator.syncAndSaveData({ matchVideos: result.videos, players: result.players });
      }
    },

    onRejectDeleteVideo: async (id) => {
      const VideoService = require('../services/VideoService').default;
      const result = await VideoService.updateStatus(id, 'Active', get().matchVideos);
      if (result.success) {
        set({ matchVideos: result.videos });
        syncOrchestrator.syncAndSaveData({ matchVideos: result.videos });
      }
    },

    onPermanentDeleteVideo: (id) => {
      const VideoService = require('../services/VideoService').default;
      const result = VideoService.bulkDelete([id], get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos }, true);
    },

    onRequestDeletion: async (id, reason) => {
      const VideoService = require('../services/VideoService').default;
      const result = await VideoService.updateStatus(id, 'Deletion Requested', get().matchVideos, { deletionReason: reason });
      if (result.success) {
        set({ matchVideos: result.videos });
        syncOrchestrator.syncAndSaveData({ matchVideos: result.videos });
      }
    },

    onUnlockVideo: async (vid, price, method) => {
      const VideoService = require('../services/VideoService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const result = await VideoService.unlockVideo(vid, price, method, currentUser);
      if (result.success) {
        const updatedUser = result.currentUser;
        const updatedMatchVideos = get().matchVideos.map(v => v.id === vid ? { ...v, purchases: (v.purchases || 0) + 1 } : v);
        
        set({ matchVideos: updatedMatchVideos });
        useAuthStore.getState().setCurrentUser(updatedUser);
        
        const currentPlayers = usePlayersStore.getState().players;
        usePlayersStore.getState().setPlayers(currentPlayers.map(p => p.id === updatedUser.id ? updatedUser : p));
        
        syncOrchestrator.syncAndSaveData({ currentUser: updatedUser, matchVideos: updatedMatchVideos });
      }
    },

    onPurchaseAiHighlights: async (vid, price, method) => {
      const VideoService = require('../services/VideoService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const result = await VideoService.purchaseHighlights(vid, price, method, currentUser);
      if (result.success) {
        const updatedUser = result.currentUser;
        useAuthStore.getState().setCurrentUser(updatedUser);
        
        const currentPlayers = usePlayersStore.getState().players;
        usePlayersStore.getState().setPlayers(currentPlayers.map(p => p.id === updatedUser.id ? updatedUser : p));
        syncOrchestrator.syncAndSaveData({ currentUser: updatedUser });
      }
    },

    onSaveVideo: (newVideo) => {
      const updated = [newVideo, ...get().matchVideos];
      set({ matchVideos: updated });
      syncOrchestrator.syncAndSaveData({ matchVideos: updated });
    },

    onCancelVideo: () => {},

    onToggleFavourite: (vid) => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentFavs = currentUser.favouritedVideos || [];
      const isFav = currentFavs.includes(vid);
      const updatedFavs = isFav ? currentFavs.filter(id => id !== vid) : [...currentFavs, vid];
      const updatedUser = { ...currentUser, favouritedVideos: updatedFavs };
      
      useAuthStore.getState().setCurrentUser(updatedUser);
      
      const currentPlayers = usePlayersStore.getState().players;
      usePlayersStore.getState().setPlayers(currentPlayers.map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p));
      syncOrchestrator.syncAndSaveData({ currentUser: updatedUser });
    },

    onUpdateVideoStatus: (vid, status) => {
      const updated = get().matchVideos.map(v => v && v.id === vid ? { ...v, adminStatus: status } : v);
      set({ matchVideos: updated });
      syncOrchestrator.syncAndSaveData({ matchVideos: updated });
    }
  };
});
