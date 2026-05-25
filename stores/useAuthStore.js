import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Removed unused cross-store imports that were causing require cycles.
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

