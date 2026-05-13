import { create } from 'zustand';
import config from '../config';

// 🛡️ [AUTH FIX] (v2.6.432): Uses credentials:'include' + x-ace-api-key instead of dead localStorage token
const getHeaders = () => ({
    'x-ace-api-key': config.PUBLIC_APP_ID
});

const getJsonHeaders = () => ({
    'Content-Type': 'application/json',
    'x-ace-api-key': config.PUBLIC_APP_ID
});

export const useAdminCoreStore = create((set, get) => ({
    auditLogs: [],
    orgSettings: [],
    teamDirectory: [],
    isLoading: false,

    fetchTeamDirectory: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/team-directory`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.success) set({ teamDirectory: data.team });
        } catch (error) {
            console.error("Failed to fetch team:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchAuditLogs: async (params = {}) => {
        try {
            set({ isLoading: true });
            const queryParams = new URLSearchParams(params).toString();
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/audit-logs${queryParams ? '?' + queryParams : ''}`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.success) set({ auditLogs: data.logs });
            return data;
        } catch (error) {
            console.error("Failed to fetch audit logs:", error);
            return { success: false, message: error.message };
        } finally {
            set({ isLoading: false });
        }
    },

    fetchOrgSettings: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/settings`, {
                credentials: 'include',
                headers: getHeaders()
            });
            const data = await response.json();
            if (data.success) set({ orgSettings: data.settings });
        } catch (error) {
            console.error("Failed to fetch settings:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    saveOrgSetting: async (key, value) => {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/settings`, {
                method: 'POST',
                credentials: 'include',
                headers: getJsonHeaders(),
                body: JSON.stringify({ key, value })
            });
            const data = await response.json();
            if (data.success) {
                // Update local state
                const settings = get().orgSettings.filter(s => s.key !== key);
                settings.push(data.setting);
                set({ orgSettings: settings });
            }
            return data.success;
        } catch (error) {
            console.error("Failed to save setting:", error);
            return false;
        }
    }
}));
