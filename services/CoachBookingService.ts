import { CoachBooking, WeeklySlot } from '../types';
import SyncOrchestrator from './sync/SyncOrchestrator';

class CoachBookingService {
  /**
   * Request a new coach booking
   */
  async requestBooking(coachId: string, playerId: string, date: string, timeSlot: string, notes?: string): Promise<{ success: boolean; booking?: CoachBooking; error?: string }> {
    try {
      const newBooking: CoachBooking = {
        id: `booking_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        coachId,
        playerId,
        date,
        timeSlot,
        status: 'Pending',
        notes
      };

      await SyncOrchestrator.dispatchAction({
        action: 'api_request',
        payload: {
          endpoint: '/api/v1/bookings/create',
          method: 'POST',
          data: { id: newBooking.id, data: newBooking }
        }
      });
      
      // Assume successful for optimistic UI
      return { success: true, booking: newBooking };
    } catch (error: any) {
      console.error('[CoachBookingService] Error requesting booking:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update the status of a booking (Confirm, Cancel, Complete)
   */
  async updateBookingStatus(bookingId: string, status: CoachBooking['status']): Promise<{ success: boolean; error?: string }> {
    try {
      await SyncOrchestrator.dispatchAction({
        action: 'api_request',
        payload: {
          endpoint: `/api/v1/bookings/${bookingId}/status`,
          method: 'PUT',
          data: { status }
        }
      });
      return { success: true };
    } catch (error: any) {
      console.error('[CoachBookingService] Error updating booking status:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fetch all bookings for a coach
   */
  async getCoachBookings(coachId: string): Promise<CoachBooking[]> {
    try {
      const response = await fetch(`${SyncOrchestrator.getApiUrl()}/api/v1/bookings/coach/${coachId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SyncOrchestrator.getAuthToken()}`
        }
      });
      
      const data = await response.json();
      if (data.success) {
        return data.bookings;
      }
      throw new Error(data.message || 'Failed to fetch coach bookings');
    } catch (error) {
      console.error('[CoachBookingService] Error fetching coach bookings:', error);
      return [];
    }
  }

  /**
   * Update coach's weekly availability
   */
  async updateCoachAvailability(coachId: string, availability: WeeklySlot[]): Promise<{ success: boolean; error?: string }> {
    try {
      await SyncOrchestrator.dispatchAction({
        action: 'api_request',
        payload: {
          endpoint: `/api/v1/bookings/coach/${coachId}/availability`,
          method: 'PUT',
          data: { availability }
        }
      });
      return { success: true };
    } catch (error: any) {
      console.error('[CoachBookingService] Error updating availability:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new CoachBookingService();
