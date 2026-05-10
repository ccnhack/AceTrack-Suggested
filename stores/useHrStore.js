import { create } from 'zustand';
import config from '../config';

export const useHrStore = create((set, get) => ({
    leaveRequests: [],
    policies: [],
    reviews: [],
    isLoading: false,

    fetchLeaveRequests: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/leaves`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ leaveRequests: data.leaves });
        } catch (error) {
            console.error("Failed to fetch leaves:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    submitLeaveRequest: async (leaveData) => {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/leaves`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` 
                },
                body: JSON.stringify(leaveData)
            });
            const data = await response.json();
            if (data.success) {
                set({ leaveRequests: [data.leave, ...get().leaveRequests] });
                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to submit leave:", error);
            return false;
        }
    },

    fetchPolicies: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/policies`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ policies: data.policies });
        } catch (error) {
            console.error("Failed to fetch policies:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchReviews: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/reviews`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ reviews: data.reviews });
        } catch (error) {
            console.error("Failed to fetch reviews:", error);
        } finally {
            set({ isLoading: false });
        }
    }
}));
