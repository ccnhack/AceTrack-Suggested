import React, { createContext, useContext, useRef, useEffect, useCallback, useMemo } from 'react';
import storage from '../utils/storage';
import { useSync } from './SyncContext';
import { usePlayersStore } from '../stores';
import { usePlayersQuery } from '../stores/hooks';

const PlayerContext = createContext(null);

export const usePlayers = () => {
  const { data: players } = usePlayersQuery();
  const context = useContext(PlayerContext);
  
  // Create a ref internally for legacy components that expect playersRef
  const playersRef = useRef(players || []);
  useEffect(() => {
    playersRef.current = players || [];
  }, [players]);

  return { 
    players: players || [], 
    playersRef,
    ...context 
  };
};

export const PlayerProvider = ({ children }) => {
  const setPlayersStore = usePlayersStore(s => s.setPlayers);
  const { data: playersFromQuery } = usePlayersQuery();
  
  const { syncAndSaveData } = useSync();

  // 🛡️ [REFERRAL CODE BACKFILL] (v2.6.121) 
  // One-time migration: Generate deterministic referral codes for legacy players missing them
  // 🛡️ [BUG-7 FIX] (v2.6.313): Backfill is now local-only. Pushing thinned player data to cloud
  // via syncAndSaveData was causing full profiles to be overwritten with thinned copies.
  const backfillDoneRef = useRef(false);
  useEffect(() => {
    if (backfillDoneRef.current || !playersFromQuery) return;
    if (playersFromQuery.length > 0 && playersFromQuery.some(p => !p.referralCode)) {
      backfillDoneRef.current = true;
      const getStableSuffix = (id) => {
        const str = String(id);
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash) + str.charCodeAt(i);
        return Math.abs(hash).toString(36).substring(0, 4).toUpperCase();
      };

      const updated = playersFromQuery.map(p => {
        if (!p.referralCode) {
          return {
            ...p,
            referralCode: `ACE-${(p.id || 'PLAYER').substring(0, 5).toUpperCase()}-${getStableSuffix(p.id || 'PLAYER')}`
          };
        }
        return p;
      });

      if (updated.some((p, i) => p !== playersFromQuery[i])) {
        console.log('[PlayerContext] Backfilling referral codes for legacy players (local only)...');
        setPlayersStore(updated);
        // 🛡️ Save to local storage only — do NOT push thinned data to cloud
        storage.setItem('players', updated);
      }
    }
  }, [playersFromQuery, setPlayersStore]);

  const sendUserNotification = useCallback((targetUserId, notification) => {
    const currentPlayers = usePlayersStore.getState().players;
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
    
    setPlayersStore(updatedPlayers);
    syncAndSaveData({ players: updatedPlayers });
  }, [syncAndSaveData, setPlayersStore]);

  const value = useMemo(() => ({
    setPlayers: setPlayersStore,
    sendUserNotification
  }), [setPlayersStore, sendUserNotification]);

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
};
