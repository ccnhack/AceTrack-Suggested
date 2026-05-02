import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { eventBus } from '../services/EventBus';
import VideoService from '../services/VideoService';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { useAuth } from './AuthContext';
import { usePlayers } from './PlayerContext';

const VideoContext = createContext(null);

export const useVideos = () => useContext(VideoContext);

export const VideoProvider = ({ children }) => {
  const [matchVideos, setMatchVideos] = useState([]);
  const matchVideosRef = useRef([]);
  const [matches, setMatches] = useState([]);
  
  const { syncAndSaveData } = useSync();
  const { currentUser, setCurrentUser, currentUserRef } = useAuth();
  const { players, setPlayers } = usePlayers();

  useEffect(() => {
    matchVideosRef.current = matchVideos;
  }, [matchVideos]);

  // Entity Listener
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if ((entity === 'matchVideos' || entity === 'matches') && (source === 'socket' || source === 'api')) {
        const freshData = await syncManager.getSystemFlag(entity);
        if (freshData) {
          if (entity === 'matchVideos') setMatchVideos(freshData);
          if (entity === 'matches') setMatches(freshData);
        }
      }
    });
    return unsub;
  }, []);

  const onVideoPlay = useCallback((vid) => {
    const uid = currentUserRef.current?.id;
    const result = VideoService.trackView(vid, uid, matchVideosRef.current);
    setMatchVideos(result.videos);
    syncAndSaveData({ matchVideos: result.videos });
  }, [syncAndSaveData]);

  const onBulkUpdateVideoStatus = useCallback((ids, status) => {
    const result = VideoService.bulkUpdateStatus(ids, status, matchVideosRef.current);
    setMatchVideos(result.videos);
    // 🛡️ [FIX v2.6.121] Atomic push to prevent status changes from being rolled back
    syncAndSaveData({ matchVideos: result.videos }, true);
  }, [syncAndSaveData]);

  const onBulkPermanentDeleteVideos = useCallback((ids) => {
    const result = VideoService.bulkDelete(ids, matchVideosRef.current);
    setMatchVideos(result.videos);
    syncAndSaveData({ matchVideos: result.videos }, true); 
  }, [syncAndSaveData]);

  const onForceRefundVideo = useCallback((id) => {
    const result = VideoService.refundVideo(id, matchVideosRef.current);
    setMatchVideos(result.videos);
    syncAndSaveData({ matchVideos: result.videos });
  }, [syncAndSaveData]);

  const onApproveDeleteVideo = useCallback((id) => {
    const result = VideoService.approveDeletion(id, matchVideosRef.current, players);
    if (result.success) {
      setMatchVideos(result.videos);
      setPlayers(result.players);
      syncAndSaveData({ matchVideos: result.videos, players: result.players });
    }
  }, [players, syncAndSaveData, setPlayers]);

  const onRejectDeleteVideo = useCallback(async (id) => {
    const result = await VideoService.updateStatus(id, 'Active', matchVideosRef.current);
    if (result.success) {
      setMatchVideos(result.videos);
      syncAndSaveData({ matchVideos: result.videos });
    }
  }, [syncAndSaveData]);

  const onPermanentDeleteVideo = useCallback((id) => {
    const result = VideoService.bulkDelete([id], matchVideosRef.current);
    setMatchVideos(result.videos);
    syncAndSaveData({ matchVideos: result.videos }, true);
  }, [syncAndSaveData]);

  const onRequestDeletion = useCallback(async (id, reason) => {
    const result = await VideoService.updateStatus(id, 'Deletion Requested', matchVideosRef.current, { deletionReason: reason });
    if (result.success) {
      setMatchVideos(result.videos);
      syncAndSaveData({ matchVideos: result.videos });
    }
  }, [syncAndSaveData]);

  const onUnlockVideo = useCallback(async (vid, price, method) => {
    if (!currentUserRef.current) return;
    const result = await VideoService.unlockVideo(vid, price, method, currentUserRef.current);
    if (result.success) {
      const updatedUser = result.currentUser;
      const updatedMatchVideos = matchVideosRef.current.map(v => v.id === vid ? { ...v, purchases: (v.purchases || 0) + 1 } : v);
      
      setMatchVideos(updatedMatchVideos);
      setCurrentUser(updatedUser);
      setPlayers(prev => prev.map(p => p.id === updatedUser.id ? updatedUser : p));
      
      syncAndSaveData({ currentUser: updatedUser, matchVideos: updatedMatchVideos });
    }
  }, [syncAndSaveData, setCurrentUser, setPlayers]);

  const onPurchaseAiHighlights = useCallback(async (vid, price, method) => {
    if (!currentUserRef.current) return;
    const result = await VideoService.purchaseHighlights(vid, price, method, currentUserRef.current);
    if (result.success) {
      const updatedUser = result.currentUser;
      setCurrentUser(updatedUser);
      setPlayers(prev => prev.map(p => p.id === updatedUser.id ? updatedUser : p));
      syncAndSaveData({ currentUser: updatedUser });
    }
  }, [syncAndSaveData, setCurrentUser, setPlayers]);

  const onSaveVideo = useCallback((newVideo) => {
    const updated = [newVideo, ...matchVideosRef.current];
    setMatchVideos(updated);
    syncAndSaveData({ matchVideos: updated });
  }, [syncAndSaveData]);

  const onCancelVideo = useCallback(() => {
    // Usually just a reset for UI
  }, []);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Toggle user's favourited videos list
  const onToggleFavourite = useCallback((vid) => {
    if (!currentUserRef.current) return;
    const currentFavs = currentUserRef.current.favouritedVideos || [];
    const isFav = currentFavs.includes(vid);
    const updatedFavs = isFav ? currentFavs.filter(id => id !== vid) : [...currentFavs, vid];
    const updatedUser = { ...currentUserRef.current, favouritedVideos: updatedFavs };
    
    setCurrentUser(updatedUser);
    setPlayers(prev => prev.map(p => String(p.id).toLowerCase() === String(updatedUser.id).toLowerCase() ? updatedUser : p));
    syncAndSaveData({ currentUser: updatedUser });
  }, [syncAndSaveData, setCurrentUser, setPlayers]);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Single video status update (admin)
  const onUpdateVideoStatus = useCallback((vid, status) => {
    const updated = matchVideosRef.current.map(v => v && v.id === vid ? { ...v, adminStatus: status } : v);
    setMatchVideos(updated);
    syncAndSaveData({ matchVideos: updated });
  }, [syncAndSaveData]);

  const value = {
    matchVideos,
    setMatchVideos,
    matchVideosRef,
    matches,
    setMatches,
    onVideoPlay,
    onBulkUpdateVideoStatus,
    onBulkPermanentDeleteVideos,
    onForceRefundVideo,
    onApproveDeleteVideo,
    onRejectDeleteVideo,
    onPermanentDeleteVideo,
    onRequestDeletion,
    onUnlockVideo,
    onPurchaseAiHighlights,
    onSaveVideo,
    onCancelVideo,
    // 🛡️ [MIGRATION FIX] (v2.6.121) Missing handlers
    onToggleFavourite,
    onUpdateVideoStatus
  };

  return (
    <VideoContext.Provider value={value}>
      {children}
    </VideoContext.Provider>
  );
};
