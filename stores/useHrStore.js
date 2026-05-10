import { create } from 'zustand';
import config from '../config';

export const useHrStore = create((set, get) => ({
    leaveRequests: [],
    policies: [],
    reviews: [],
    attendance: [],
    payslips: [],
    documents: [],
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
    },

    fetchAttendance: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/attendance`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ attendance: data.attendance });
        } catch (error) {
            console.error("Failed to fetch attendance:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    checkIn: async () => {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/attendance/check-in`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) {
                // Prepend or update attendance
                const records = get().attendance.filter(a => a.date !== data.record.date);
                set({ attendance: [data.record, ...records] });
            }
        } catch (error) {
            console.error("Failed to check-in:", error);
        }
    },

    checkOut: async () => {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/attendance/check-out`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) {
                const records = get().attendance.filter(a => a.date !== data.record.date);
                set({ attendance: [data.record, ...records] });
            }
        } catch (error) {
            console.error("Failed to check-out:", error);
        }
    },

    fetchPayslips: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/payslips`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ payslips: data.payslips });
        } catch (error) {
            console.error("Failed to fetch payslips:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchDocuments: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/hr/documents`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ documents: data.documents });
        } catch (error) {
            console.error("Failed to fetch documents:", error);
        } finally {
            set({ isLoading: false });
        }
    }
}));
