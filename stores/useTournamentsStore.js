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
        const TournamentService = require('../services/TournamentService').default;
        const currentUser = useAuthStore.getState().currentUser;
        // 🛡️ [DIAG_BRIDGE] (v2.6.508): Enhanced logging for registration state debugging
        console.log(`[TournamentsStore] onRegister called. currentUser=${currentUser?.id || 'NULL'}, t=${typeof t === 'object' ? t?.id : t}, method=${method}`);
        if (!currentUser || !t) {
          console.warn(`[TournamentsStore] Registration aborted: currentUser=${!!currentUser}, t=${!!t}, authStoreKeys=${Object.keys(useAuthStore.getState()).join(',')}`);
          Alert.alert('Registration Failed', 'Invalid registration state. Missing user or tournament.');
          return { success: false, message: 'Invalid registration state.' };
        }
        const tid = typeof t === 'object' ? t.id : t;
        const currentTournaments = get().tournaments;
        const tournament = currentTournaments.find(it => it.id === tid);
        if (!tournament) {
          console.warn('[TournamentsStore] Registration target not found:', tid);
          Alert.alert('Registration Failed', 'Arena not found. Please refresh.');
          return { success: false, message: 'Arena not found. Please refresh.' };
        }
        console.log(`[TournamentsStore] Starting registration for ${tid} via ${method}`);
        const result = TournamentService.register(
          tid, currentUser.id, currentTournaments,
          usePlayersStore.getState().players, currentUser, method, cost
        );
        if (result && result.success) {
          set({ tournaments: result.tournaments });
          usePlayersStore.getState().setPlayers(result.players);
          useAuthStore.getState().setCurrentUser(result.currentUser);
          console.log(`[TournamentsStore] State updated locally. Pushing ATOMICALLY to server...`);
          // 🛡️ [ATOMIC_REG_PUSH] (v2.6.509): Registration MUST use isAtomic=true.
          // Previously used isAtomic=false which delayed the push by 3 seconds.
          // During that window, a WebSocket broadcast of old server state would 
          // overwrite the local registration via cloud-wins merge, reverting it.
          await syncOrchestrator.syncAndSaveData({
            tournaments: result.tournaments,
            players: result.players,
            currentUser: result.currentUser
          }, true);
          console.log(`[TournamentsStore] Atomic push completed for ${tid}. Registration persisted.`);
        } else {
          const msg = result?.message || 'Could not complete registration.';
          Alert.alert('Registration Failed', msg);
        }
        return result;
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

    onStartTournament: (tid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.startTournament(tid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
    },

    onEndTournament: (tid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.endTournament(tid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
    },

    onAssignCoach: (tid, cid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.assignCoach(tid, cid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments });
    },

    onRemoveCoach: (tid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.removeCoach(tid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
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

    onRemovePendingPlayer: (tid, pid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.removePendingPlayer(tid, pid, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
    },

    onManageInterested: (tid, pid, action) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentTournaments = get().tournaments;
      const result = TournamentService.manageInterested(tid, pid, action, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
    },

    onDeclineCoachRequest: (t) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentUser = useAuthStore.getState().currentUser;
      const currentTournaments = get().tournaments;
      const result = TournamentService.declineCoachRequest(t.id, currentTournaments);
      set({ tournaments: result.tournaments });
      
      if (currentUser && currentUser.role === 'coach') {
         const currentPlayers = usePlayersStore.getState().players;
         const updatedPlayers = currentPlayers.map(p => {
           if (p.id === currentUser.id) {
             const metrics = p.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
             return { ...p, coachMetrics: { ...metrics, tournamentsDeclined: (metrics.tournamentsDeclined || 0) + 1 } };
           }
           return p;
         });
         usePlayersStore.getState().setPlayers(updatedPlayers);
         const updatedUser = updatedPlayers.find(p => p.id === currentUser.id);
         useAuthStore.getState().setCurrentUser(updatedUser);
         syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments, players: updatedPlayers, currentUser: updatedUser }, true);
      } else {
         syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
      }
    },

    onConfirmCoachRequest: (t) => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTournaments = get().tournaments;
      const updated = currentTournaments.map(item =>
        item.id === t.id ? { ...item, assignedCoachId: currentUser.id, coachStatus: 'Coach Confirmed' } : item
      );
      set({ tournaments: updated });
      
      if (currentUser.role === 'coach') {
         const currentPlayers = usePlayersStore.getState().players;
         const updatedPlayers = currentPlayers.map(p => {
           if (p.id === currentUser.id) {
             const metrics = p.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
             return { ...p, coachMetrics: { ...metrics, tournamentsAccepted: (metrics.tournamentsAccepted || 0) + 1 } };
           }
           return p;
         });
         usePlayersStore.getState().setPlayers(updatedPlayers);
         const updatedUser = updatedPlayers.find(p => p.id === currentUser.id);
         useAuthStore.getState().setCurrentUser(updatedUser);
         syncOrchestrator.syncAndSaveData({ tournaments: updated, players: updatedPlayers, currentUser: updatedUser }, true);
      } else {
         syncOrchestrator.syncAndSaveData({ tournaments: updated });
      }
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

    onDeleteTournament: (tid) => {
      const currentTournaments = get().tournaments;
      const deletedT = currentTournaments.find(t => t.id === tid);
      console.log(`[TournamentsStore] [DELETE] Deleting tournament: id=${tid}, title=${deletedT?.title || 'UNKNOWN'}, beforeCount=${currentTournaments.length}`);
      const updated = currentTournaments.filter(t => t.id !== tid);
      console.log(`[TournamentsStore] [DELETE] afterCount=${updated.length}. Pushing ATOMICALLY to server...`);
      set({ tournaments: updated });
      syncOrchestrator.syncAndSaveData({ tournaments: updated }, true);
    },

    onReschedule: (tournamentId) => {
      set({ reschedulingFrom: tournamentId });
    },

    onCancelReschedule: () => {
      set({ reschedulingFrom: null });
    },

    onOptOut: (tid, refundToWallet = true) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTournaments = get().tournaments;
      const serverClockOffset = useSyncStore.getState().serverClockOffset || 0;
      const result = TournamentService.optOut(tid, currentUser.id, currentTournaments, usePlayersStore.getState().players, currentUser, refundToWallet, serverClockOffset);
      if (result.success) {
        set({ tournaments: result.tournaments });
        if (result.players) usePlayersStore.getState().setPlayers(result.players);
        if (result.currentUser) useAuthStore.getState().setCurrentUser(result.currentUser);

        // 🛡️ [AUDIT FIX F-2/S-1] (v2.6.327): Single atomic sync call
        syncOrchestrator.syncAndSaveData({
          tournaments: result.tournaments,
          players: result.players || usePlayersStore.getState().players,
          currentUser: result.currentUser || currentUser
        }, true);

        const { Alert } = require('react-native');
        if (result.refundInfo && result.refundInfo.refundAmount > 0) {
          const ri = result.refundInfo;
          Alert.alert(
            '✅ Opted Out Successfully', 
            `₹${ri.refundAmount} has been refunded to your wallet.${ri.cancellationCharge > 0 ? `\n\nCancellation fee: ₹${ri.cancellationCharge} (${ri.cancellationPercent}%)` : '\n\nNo cancellation charges applied.'}\n\nEntry Fee: ₹${ri.entryFee}`
          );
        } else {
          Alert.alert('Success', 'You have successfully opted out of this tournament.');
        }
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', result.message || 'Failed to opt out.');
      }
    },

    onPingCoach: async (tournamentId, coachId) => {
      try {
        const config = require('../config').default;
        const { Alert } = require('react-native');
        const useAuthStore = require('./index').useAuthStore;
        const res = await fetch(`${config.API_BASE_URL}/api/v1/ping-coach`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': 'ace_hackathon_super_secret_key_2024',
            'Authorization': `Bearer ${useAuthStore.getState().currentUser?.id}`
          },
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

