import { create } from 'zustand';
import CoachBookingService from '../services/CoachBookingService';

export const useCoachBookingStore = create((set, get) => ({
  bookings: [],
  isHydrating: false,
  lastHydrated: null,
  error: null,

  hydrate: async (coachId) => {
    if (!coachId) return;
    
    set({ isHydrating: true, error: null });
    try {
      const bookings = await CoachBookingService.getCoachBookings(coachId);
      set({ bookings, isHydrating: false, lastHydrated: Date.now() });
    } catch (error) {
      set({ error: error.message, isHydrating: false });
    }
  },

  addBooking: (booking) => {
    set((state) => ({
      bookings: [booking, ...state.bookings]
    }));
  },

  updateBookingStatus: (bookingId, status) => {
    set((state) => ({
      bookings: state.bookings.map(b => 
        b.id === bookingId ? { ...b, status } : b
      )
    }));
  }
}));
