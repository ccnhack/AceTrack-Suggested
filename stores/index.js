/**
 * 🏗️ PHASE 3: Zustand Stores
 * 
 * Lightweight stores that replace the nested React Context state.
 * These stores subscribe to the existing EventBus and SyncOrchestrator
 * to stay in sync — zero risk to existing functionality.
 */
import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage from '../utils/storage';

// ═══════════════════════════════════════════════════════════════
// 🔄 SYNC STORE — Replaces SyncContext state
// ═══════════════════════════════════════════════════════════════
export const useSyncStore = create((set, get) => {
  // Subscribe to EventBus on store creation
  eventBus.subscribe('CONNECTIVITY_CHANGED', (e) => {
    set({ isFullyConnected: e.payload.isOnline });
  });

  eventBus.subscribe('SYNC_STATUS_CHANGED', (e) => {
    if (e.payload.isOnline !== undefined) set({ isCloudOnline: e.payload.isOnline });
    if (e.payload.isSyncing !== undefined) set({ isSyncing: e.payload.isSyncing });
  });

  return {
    // State
    isCloudOnline: false,
    isSyncing: false,
    isFullyConnected: true,
    lastSyncTime: null,
    isUsingCloud: true,
    serverClockOffset: 0,
    isNotificationsEnabled: true,

    // Actions
    setServerClockOffset: (offset) => set({ serverClockOffset: offset }),
    setLastSyncTime: (time) => set({ lastSyncTime: time }),
    
    toggleCloud: () => {
      const next = !get().isUsingCloud;
      set({ isUsingCloud: next });
      syncOrchestrator.setSystemFlag('isUsingCloud', next);
    },

    toggleNotifications: () => {
      const next = !get().isNotificationsEnabled;
      set({ isNotificationsEnabled: next });
      syncOrchestrator.setSystemFlag('isNotificationsEnabled', next);
    },

    // Hydrate from storage on first use
    hydrate: async () => {
      const savedNotifs = await syncOrchestrator.getSystemFlag('isNotificationsEnabled');
      if (savedNotifs !== null) set({ isNotificationsEnabled: savedNotifs });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 👤 AUTH STORE — Replaces AuthContext state
// ═══════════════════════════════════════════════════════════════
export const useAuthStore = create((set, get) => {
  return {
    // State
    currentUser: null,
    userRole: null,
    isAuthReady: false,
    viewingLanding: true,
    showSignup: false,
    verificationLatch: { email: false, phone: false },

    // Actions
    setCurrentUser: (user) => set({ currentUser: user, userRole: user?.role || null }),
    setIsAuthReady: (ready) => set({ isAuthReady: ready }),
    setViewingLanding: (v) => set({ viewingLanding: v }),
    setShowSignup: (v) => set({ showSignup: v }),
    setVerificationLatch: (v) => set({ verificationLatch: v }),

    login: (user) => {
      set({
        currentUser: user,
        userRole: user?.role || null,
        viewingLanding: false
      });
    },

    logout: () => {
      set({
        currentUser: null,
        userRole: null,
        viewingLanding: true,
        showSignup: false,
        verificationLatch: { email: false, phone: false }
      });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 🎯 APP STORE — Replaces AppContext state
// ═══════════════════════════════════════════════════════════════
export const useAppStore = create((set) => {
  return {
    // State
    isLoading: true,
    isInitialized: false,
    isUploadingLogs: false,
    showForceUpdate: false,
    showNotifications: false,
    appVersion: null, // Set during initialization
    latestAppVersion: null,

    // Actions
    setIsLoading: (v) => set({ isLoading: v }),
    setIsInitialized: (v) => set({ isInitialized: v }),
    setIsUploadingLogs: (v) => set({ isUploadingLogs: v }),
    setShowForceUpdate: (v) => set({ showForceUpdate: v }),
    setShowNotifications: (v) => set({ showNotifications: v }),
    setAppVersion: (v) => set({ appVersion: v }),
    setLatestAppVersion: (v) => set({ latestAppVersion: v }),
  };
});

// ═══════════════════════════════════════════════════════════════
// 🏓 PLAYERS STORE — Replaces PlayerContext state
// ═══════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════
// 🏆 TOURNAMENTS STORE — Replaces TournamentContext state + actions
// ═══════════════════════════════════════════════════════════════
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
        if (!currentUser || !t) {
          console.warn('[TournamentsStore] Registration aborted: Missing User or Tournament');
          return { success: false, message: 'Invalid registration state.' };
        }
        const tid = typeof t === 'object' ? t.id : t;
        const currentTournaments = get().tournaments;
        const tournament = currentTournaments.find(it => it.id === tid);
        if (!tournament) {
          console.warn('[TournamentsStore] Registration target not found:', tid);
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
          console.log('[TournamentsStore] State updated locally. Syncing...');
          await syncOrchestrator.syncAndSaveData({
            tournaments: result.tournaments,
            players: result.players,
            currentUser: result.currentUser
          }, false);
        } else {
          const msg = result?.message || 'Could not complete registration.';
          const { Alert } = require('react-native');
          Alert.alert('Registration Failed', msg);
        }
        return result;
      } catch (e) {
        console.error('[TournamentsStore] FATAL_ON_REGISTER_ERROR:', e);
        const { Alert } = require('react-native');
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
      const currentTournaments = get().tournaments;
      const result = TournamentService.declineCoachRequest(t.id, currentTournaments);
      set({ tournaments: result.tournaments });
      syncOrchestrator.syncAndSaveData({ tournaments: result.tournaments }, true);
    },

    onConfirmCoachRequest: (t) => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTournaments = get().tournaments;
      const updated = currentTournaments.map(item =>
        item.id === t.id ? { ...item, assignedCoachId: currentUser.id, coachStatus: 'Coach Confirmed' } : item
      );
      set({ tournaments: updated });
      syncOrchestrator.syncAndSaveData({ tournaments: updated });
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
      const updated = currentTournaments.filter(t => t.id !== tid);
      set({ tournaments: updated });
      syncOrchestrator.syncAndSaveData({ tournaments: updated }, true);
    },

    onReschedule: (tournamentId) => {
      set({ reschedulingFrom: tournamentId });
    },

    onCancelReschedule: () => {
      set({ reschedulingFrom: null });
    },

    onOptOut: (tid) => {
      const TournamentService = require('../services/TournamentService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTournaments = get().tournaments;
      const result = TournamentService.optOut(tid, currentUser.id, currentTournaments, usePlayersStore.getState().players, currentUser);
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
        Alert.alert('Success', 'You have successfully opted out of this tournament.');
      } else {
        const { Alert } = require('react-native');
        Alert.alert('Error', result.message || 'Failed to opt out.');
      }
    },
  };
});

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT STORE — Replaces SupportContext state
// ═══════════════════════════════════════════════════════════════
export const useSupportStore = create((set, get) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'supportTickets') {
      console.log(`[SupportStore] Received ENTITY_UPDATED for supportTickets. Source: ${e.payload.source}`);
      const freshData = await syncOrchestrator.getSystemFlag('supportTickets');
      if (freshData) {
        console.log(`[SupportStore] Updating store with ${freshData.length} tickets from storage.`);
        set({ supportTickets: freshData });
      }
    }
    if (e.payload.entity === 'chatbotMessages') {
      const freshData = await syncOrchestrator.getSystemFlag('chatbotMessages');
      if (freshData) {
        // 🛡️ [CHATBOT_MERGE_GUARD] (v2.6.418): Merge instead of overwrite.
        // Local chatbot messages are always authoritative (written locally first).
        // Server data may be stale due to OCC conflicts, so we keep the version
        // with MORE messages per user to prevent the vanishing message bug.
        const currentMessages = get().chatbotMessages || {};
        const merged = { ...freshData };
        for (const userId in currentMessages) {
          const localMsgs = currentMessages[userId] || [];
          const serverMsgs = merged[userId] || [];
          if (localMsgs.length > serverMsgs.length) {
            merged[userId] = localMsgs; // Local has newer messages, keep them
          }
        }
        set({ chatbotMessages: merged });
      }
    }
  });

  return {
    supportTickets: [],
    chatbotMessages: {},
    setSupportTickets: (tickets) => set({ supportTickets: tickets }),
    setChatbotMessages: (msgs) => set({ chatbotMessages: msgs }),

    hydrate: async () => {
      const startTime = Date.now();
      const tickets = await syncOrchestrator.getSystemFlag('supportTickets');
      const chatbot = await syncOrchestrator.getSystemFlag('chatbotMessages');
      console.log(`[STORE_DEBUG] Support Store Hydrate: Loaded ${tickets?.length || 0} tickets in ${Date.now() - startTime}ms`);
      if (tickets) set({ supportTickets: tickets });
      if (chatbot) set({ chatbotMessages: chatbot });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// ⚔️ MATCHMAKING STORE — Replaces MatchmakingContext state
// ═══════════════════════════════════════════════════════════════
export const useMatchmakingStore = create((set) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'matchmaking') {
      const freshData = await syncOrchestrator.getSystemFlag('matchmaking');
      if (freshData) set({ matchmaking: freshData });
    }
  });

  return {
    matchmaking: [],
    setMatchmaking: (mm) => set({ matchmaking: mm }),

    hydrate: async () => {
      const saved = await syncOrchestrator.getSystemFlag('matchmaking');
      if (saved) set({ matchmaking: saved });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 📊 EVALUATIONS STORE — Replaces EvaluationContext state
// ═══════════════════════════════════════════════════════════════
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
