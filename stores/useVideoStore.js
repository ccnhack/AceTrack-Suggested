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

    onSaveVideo: async (newVideo) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(`${config.API_BASE_URL}/api/v1/videos/save-metadata`, {
          method: 'POST', headers, credentials: 'include',
          body: JSON.stringify({ video: newVideo })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const updated = [data.video, ...get().matchVideos];
          set({ matchVideos: updated });
        }
      } catch (e) { console.error('Save Video Error:', e); }
    },

    onUpdateVideoStatus: async (vid, status, additionalData = null) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const res = await fetch(`${config.API_BASE_URL}/api/v1/videos/update-status`, {
          method: 'POST', headers, credentials: 'include',
          body: JSON.stringify({ videoId: vid, status, additionalData })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const updated = get().matchVideos.map(v => v.id === vid ? data.video : v);
          set({ matchVideos: updated });
        }
      } catch (e) { console.error('Update Video Status Error:', e); }
    },

    onBulkUpdateVideoStatus: (ids, status) => {
      // For bulk, loop through them using REST API.
      ids.forEach(id => get().onUpdateVideoStatus(id, status));
    },

    onApproveDeleteVideo: async (id) => {
      await get().onUpdateVideoStatus(id, 'Deleted');
    },

    onRejectDeleteVideo: async (id) => {
      await get().onUpdateVideoStatus(id, 'Active');
    },

    onPermanentDeleteVideo: async (id) => {
      await get().onUpdateVideoStatus(id, 'Permanently Deleted');
    },

    onRequestDeletion: async (id, reason) => {
      await get().onUpdateVideoStatus(id, 'Deletion Requested', { deletionReason: reason });
    },

    onForceRefundVideo: (id) => {
      const VideoService = require('../services/VideoService').default;
      const result = VideoService.refundVideo(id, get().matchVideos);
      set({ matchVideos: result.videos });
      syncOrchestrator.syncAndSaveData({ matchVideos: result.videos });
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
