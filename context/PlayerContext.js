import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { eventBus } from '../services/EventBus';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';

const PlayerContext = createContext(null);

export const usePlayers = () => useContext(PlayerContext);

export const PlayerProvider = ({ children }) => {
  const [players, setPlayers] = useState([]);
  const playersRef = useRef([]);
  
  const { syncAndSaveData } = useSync();

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Initial Hydration
  useEffect(() => {
    const hydrate = async () => {
      const saved = await syncManager.getSystemFlag('players');
      if (saved) setPlayers(saved);
    };
    hydrate();
  }, []);

  // Entity Listener
  useEffect(() => {
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (entity === 'players') {
        const freshData = await syncManager.getSystemFlag('players');
        if (freshData) setPlayers(freshData);
      }
    });
    return unsub;
  }, []);

  const sendUserNotification = useCallback((targetUserId, notification) => {
    const updatedPlayers = playersRef.current.map(p => {
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
    
    setPlayers(updatedPlayers);
    syncAndSaveData({ players: updatedPlayers });
  }, [syncAndSaveData]);

  // 🛡️ [REFERRAL CODE BACKFILL] (v2.6.121) 
  // One-time migration: Generate deterministic referral codes for legacy players missing them
  useEffect(() => {
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
        console.log('[PlayerContext] Backfilling referral codes for legacy players...');
        setPlayers(updated);
        syncAndSaveData({ players: updated });
      }
    }
  }, [players.length]); // Only run when player count changes (initial load)

  const value = {
    players,
    setPlayers,
    playersRef,
    sendUserNotification
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
    </PlayerContext.Provider>
  );
};
