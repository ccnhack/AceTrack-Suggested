import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';
import config from '../config';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { usePlayersStore } from './usePlayersStore.js';
import { useSyncStore } from './useSyncStore.js';
import { useAppStore } from './useAppStore.js';
import { useSupportStore } from './useSupportStore.js';
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useTournamentsStore = create((set, get) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'tournaments') {
      const freshData = await syncOrchestrator.getSystemFlag('tournaments');
      if (freshData) set({ tournaments: freshData });
    }
  });

  return {
    tournaments: [],
    reschedulingFrom: null,
    setTournaments: (tournaments) => set({ tournaments }),
    setReschedulingFrom: (val) => set({ reschedulingFrom: val }),

    hydrate: async () => {
      const saved = await syncOrchestrator.getSystemFlag('tournaments');
      if (saved) set({ tournaments: saved });
    },

    // ─── Actions migrated from TournamentContext ───

    onRegister: async (t, method, cost, isResched, fromTid) => {
      try {
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser || !t) {
          Alert.alert('Registration Failed', 'Invalid registration state. Missing user or tournament.');
          return { success: false, message: 'Invalid registration state.' };
        }
        
        const tid = typeof t === 'object' ? t.id : t;
        console.log(`[TournamentsStore] Starting API registration for ${tid} via ${method}`);
        const token = await storage.getItem('userToken');

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/register`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-User-Id': currentUser.id
          },
          body: JSON.stringify({ method, cost })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          // 🛡️ Registration success: update local state with authoritative server data
          // We no longer push back to the server (Atomic Overwrite)
          
          const currentTournaments = get().tournaments;
          const updatedTournaments = currentTournaments.map(it => 
            it.id === tid ? result.tournament : it
          );
          
          set({ tournaments: updatedTournaments });
          
          const currentPlayers = usePlayersStore.getState().players;
          const updatedPlayers = currentPlayers.map(p => 
            p.id === currentUser.id ? result.currentUser : p
          );
          usePlayersStore.getState().setPlayers(updatedPlayers);
          useAuthStore.getState().setCurrentUser(result.currentUser);
          
          console.log(`[TournamentsStore] API Registration successful for ${tid}. Local state synced.`);
          
          // Trigger a background pull to grab any other missing data
          syncOrchestrator.forcePullData();
          
          return result;
        } else {
          const msg = result?.message || 'Could not complete registration.';
          Alert.alert('Registration Failed', msg);
          return { success: false, message: msg };
        }
      } catch (e) {
        console.error('[TournamentsStore] FATAL_ON_REGISTER_ERROR:', e);
        Alert.alert('System Error', `Line: onRegister\nError: ${e.message}\nStack: ${e.stack?.substring(0, 100)}`);
        throw e;
      }
    },

    onJoinWaitlist: (t) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser || !t) return null;
      const tid = typeof t === 'object' ? t.id : t;
      const currentTournaments = get().tournaments;
      const result = TournamentService.joinWaitlist(tid, currentUser.id, currentTournaments);
      if (result.success) {
        set({ tournaments: result.tournaments });
        syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments });
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Waitlist Error', result.message || 'Could not join waitlist.');
      }
      return result;
    },

    onStartTournament: async (tid) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/start`, { method: 'POST', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(t => t.id === tid ? result.tournament : t) });
        }
      } catch (e) { console.error('onStartTournament Error', e); }
    },

    onEndTournament: async (tid) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/end`, { method: 'POST', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(t => t.id === tid ? result.tournament : t) });
        }
      } catch (e) { console.error('onEndTournament Error', e); }
    },

    onAssignCoach: (tid, cid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.assignCoach(tid, cid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments });
    },

    onRemoveCoach: async (tid) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/remove-coach`, { method: 'POST', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(t => t.id === tid ? result.tournament : t) });
        }
      } catch (e) { console.error('onRemoveCoach Error', e); }
    },

    onApproveCoach: (coachId, status = 'approved', reason = '') => {
      const TournamentService = require('../services/TournamentService').default;
      const result = TournamentService.approveCoach(coachId, status, usePlayersStore.getState().players);
      if (result.success) {
        const updatedPlayers = reason
          ? result.players.map(p => String(p.id).toLowerCase() === String(coachId).toLowerCase()
              ? { ...p, coachRejectReason: reason } : p)
          : result.players;
        usePlayersStore.getState().setPlayers(updatedPlayers);
        syncOrchestrator.syncAndSaveData({ players: updatedPlayers });
      }
    },

    onSaveCoachComment: (tid, comment) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTournaments = get().tournaments;
      const result = TournamentService.addCoachComment(tid, currentUser.id, comment, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments });
    },

    onAddPlayer: (tid, playerName, playerPhone) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.addPlayer(tid, playerName, playerPhone, currentTournaments, usePlayersStore.getState().players);
      if (result.success) {
        set({ tournaments: result.tournaments });
        syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments });
        const { Alert } = require('react-native');
        Alert.alert("Success", "Player added to tournament.");
      } else {
        const { Alert } = require('react-native');
        Alert.alert("Error", result.message || "Failed to add player.");
      }
    },

    onRemovePendingPlayer: async (tid, pid) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/remove-pending`, { method: 'POST', headers, body: JSON.stringify({ pid }) });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(t => t.id === tid ? result.tournament : t) });
        }
      } catch (e) { console.error('onRemovePendingPlayer Error', e); }
    },

    onManageInterested: async (tid, pid, action) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/manage-interested`, { method: 'POST', headers, body: JSON.stringify({ pid, action }) });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(t => t.id === tid ? result.tournament : t) });
        }
      } catch (e) { console.error('onManageInterested Error', e); }
    },

    onDeclineCoachRequest: async (t) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${t.id}/decline-coach`, { method: 'POST', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(item => item.id === t.id ? result.tournament : item) });
          if (result.currentUser) {
            useAuthStore.getState().setCurrentUser(result.currentUser);
            const currentPlayers = usePlayersStore.getState().players;
            usePlayersStore.getState().setPlayers(currentPlayers.map(p => p.id === result.currentUser.id ? result.currentUser : p));
          }
        }
      } catch (e) { console.error('onDeclineCoachRequest Error', e); }
    },

    onConfirmCoachRequest: async (t) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${t.id}/confirm-coach`, { method: 'POST', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.map(item => item.id === t.id ? result.tournament : item) });
          if (result.currentUser) {
            useAuthStore.getState().setCurrentUser(result.currentUser);
            const currentPlayers = usePlayersStore.getState().players;
            usePlayersStore.getState().setPlayers(currentPlayers.map(p => p.id === result.currentUser.id ? result.currentUser : p));
          }
        }
      } catch (e) { console.error('onConfirmCoachRequest Error', e); }
    },

    onSaveTournament: (newT) => {
      const currentTournaments = get().tournaments;
      const updated = [newT, ...currentTournaments];
      set({ tournaments: updated });
      syncOrchestrator.syncAndSaveData({ tournaments: updated });
    },

    onUpdateTournament: (updated) => {
      const currentTournaments = get().tournaments;
      const updatedTournaments = currentTournaments.map(t => t.id === updated.id ? updated : t);
      set({ tournaments: updatedTournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: updatedTournaments });
    },

    onDeleteTournament: async (tid) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        const token = await storage.getItem('userToken');
        const headers = { 'Content-Type': 'application/json', 'X-User-Id': currentUser.id };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}`, { method: 'DELETE', headers });
        const result = await response.json();
        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          set({ tournaments: currentTournaments.filter(t => t.id !== tid) });
        }
      } catch (e) { console.error('onDeleteTournament Error', e); }
    },

    onReschedule: (tournamentId) => {
      set({ reschedulingFrom: tournamentId });
    },

    onCancelReschedule: () => {
      set({ reschedulingFrom: null });
    },

    onOptOut: async (tid, refundToWallet = true) => {
      try {
        const currentUser = useAuthStore.getState().currentUser;
        if (!currentUser) return;
        
        console.log(`[TournamentsStore] Starting API opt-out for ${tid}`);
        const token = await storage.getItem('userToken');

        const response = await fetch(`${config.API_BASE_URL}/api/v1/tournaments/${tid}/optout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'X-User-Id': currentUser.id
          },
          body: JSON.stringify({ refundToWallet })
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const currentTournaments = get().tournaments;
          const updatedTournaments = currentTournaments.map(it => 
            it.id === tid ? result.tournament : it
          );
          
          set({ tournaments: updatedTournaments });
          
          const currentPlayers = usePlayersStore.getState().players;
          let updatedPlayers = currentPlayers.map(p => 
            p.id === currentUser.id ? result.currentUser : p
          );
          
          if (result.promotedPlayer) {
             updatedPlayers = updatedPlayers.map(p => 
                p.id === result.promotedPlayer.id ? result.promotedPlayer : p
             );
          }
          
          usePlayersStore.getState().setPlayers(updatedPlayers);
          useAuthStore.getState().setCurrentUser(result.currentUser);
          
          if (result.refundInfo && result.refundInfo.refundAmount > 0) {
            Alert.alert(
              'Opt-out Successful', 
              `Refund of ₹${result.refundInfo.refundAmount} has been credited to your wallet.\n(${result.refundInfo.cancellationPercent}% cancellation charge applied)`
            );
          } else {
             Alert.alert('Opt-out Successful', 'You have been removed from the tournament.');
          }
          
          syncOrchestrator.forcePullData();
        } else {
          Alert.alert('Opt-out Failed', result?.message || 'Could not process request.');
        }
      } catch (e) {
        console.error('[TournamentsStore] FATAL_ON_OPTOUT_ERROR:', e);
        Alert.alert('System Error', 'Could not process opt-out at this time.');
      }
    },

    onPingCoach: async (tournamentId, coachId) => {
      try {
        const config = require('../config').default;
        const { Alert } = require('react-native');
        const useAuthStore = require('./index').useAuthStore;
        const token = await storage.getItem('userToken');
        const res = await fetch(`${config.API_BASE_URL}/api/v1/ping-coach`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // 🛡️ [VAPT-F07] (v2.6.556): Removed hardcoded secret key. Use standard auth pattern.
            'x-ace-api-key': config.ACE_API_KEY,
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          credentials: 'include',
          body: JSON.stringify({ tournamentId, coachId })
        });
        const data = await res.json();
        if (data.success) {
          // Optimistically update
          set(state => ({
            tournaments: state.tournaments.map(t => 
              t.id === tournamentId ? { ...t, individualPings: data.individualPings, individualPingTracking: data.individualPingTracking } : t
            )
          }));
          Alert.alert('Success', 'Individual push notification sent to coach.');
          return true;
        } else {
          Alert.alert('Failed', data.error || 'Could not ping coach');
          return false;
        }
      } catch (err) {
        console.error("onPingCoach error:", err);
        return false;
      }
    },
  };
});

