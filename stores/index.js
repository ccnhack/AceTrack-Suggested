/**
 * 🏗️ PHASE 3: Zustand Stores
 * 
 * Lightweight stores that replace the nested React Context state.
 * These stores subscribe to the existing EventBus and SyncManager
 * to stay in sync — zero risk to existing functionality.
 */
import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncManager } from '../services/SyncManager';
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
      syncManager.setSystemFlag('isUsingCloud', next);
    },

    toggleNotifications: () => {
      const next = !get().isNotificationsEnabled;
      set({ isNotificationsEnabled: next });
      syncManager.setSystemFlag('isNotificationsEnabled', next);
    },

    // Hydrate from storage on first use
    hydrate: async () => {
      const savedNotifs = await syncManager.getSystemFlag('isNotificationsEnabled');
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
  // Subscribe to version obsolete events
  eventBus.subscribe('VERSION_OBSOLETE', (e) => {
    if (e.payload.latestVersion) {
      set({ 
        latestAppVersion: e.payload.latestVersion, 
        showForceUpdate: true 
      });
    }
  });

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
      const freshData = await syncManager.getSystemFlag('players');
      if (freshData) set({ players: freshData });
    }
  });

  return {
    players: [],
    setPlayers: (players) => set({ players }),

    // Hydrate from storage
    hydrate: async () => {
      const saved = await syncManager.getSystemFlag('players');
      if (saved) set({ players: saved });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 🏆 TOURNAMENTS STORE — Replaces TournamentContext state
// ═══════════════════════════════════════════════════════════════
export const useTournamentsStore = create((set) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'tournaments') {
      const freshData = await syncManager.getSystemFlag('tournaments');
      if (freshData) set({ tournaments: freshData });
    }
  });

  return {
    tournaments: [],
    setTournaments: (tournaments) => set({ tournaments }),

    hydrate: async () => {
      const saved = await syncManager.getSystemFlag('tournaments');
      if (saved) set({ tournaments: saved });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT STORE — Replaces SupportContext state
// ═══════════════════════════════════════════════════════════════
export const useSupportStore = create((set) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'supportTickets') {
      const freshData = await syncManager.getSystemFlag('supportTickets');
      if (freshData) set({ supportTickets: freshData });
    }
    if (e.payload.entity === 'chatbotMessages') {
      const freshData = await syncManager.getSystemFlag('chatbotMessages');
      if (freshData) set({ chatbotMessages: freshData });
    }
  });

  return {
    supportTickets: [],
    chatbotMessages: {},
    setSupportTickets: (tickets) => set({ supportTickets: tickets }),
    setChatbotMessages: (msgs) => set({ chatbotMessages: msgs }),

    hydrate: async () => {
      const tickets = await syncManager.getSystemFlag('supportTickets');
      const chatbot = await syncManager.getSystemFlag('chatbotMessages');
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
      const freshData = await syncManager.getSystemFlag('matchmaking');
      if (freshData) set({ matchmaking: freshData });
    }
  });

  return {
    matchmaking: [],
    setMatchmaking: (mm) => set({ matchmaking: mm }),

    hydrate: async () => {
      const saved = await syncManager.getSystemFlag('matchmaking');
      if (saved) set({ matchmaking: saved });
    }
  };
});

// ═══════════════════════════════════════════════════════════════
// 📊 EVALUATIONS STORE — Replaces EvaluationContext state
// ═══════════════════════════════════════════════════════════════
export const useEvaluationsStore = create((set) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'evaluations') {
      const freshData = await syncManager.getSystemFlag('evaluations');
      if (freshData) set({ evaluations: freshData });
    }
  });

  return {
    evaluations: [],
    setEvaluations: (evals) => set({ evaluations: evals }),

    hydrate: async () => {
      const saved = await syncManager.getSystemFlag('evaluations');
      if (saved) set({ evaluations: saved });
    }
  };
});
