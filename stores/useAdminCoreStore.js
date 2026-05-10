import { create } from 'zustand';
import config from '../config';

export const useAdminCoreStore = create((set, get) => ({
    auditLogs: [],
    orgSettings: [],
    teamDirectory: [],
    isLoading: false,

    fetchTeamDirectory: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/team-directory`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ teamDirectory: data.team });
        } catch (error) {
            console.error("Failed to fetch team:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchAuditLogs: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/audit-logs`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ auditLogs: data.logs });
        } catch (error) {
            console.error("Failed to fetch audit logs:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    fetchOrgSettings: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/admin-core/settings`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
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
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` 
                },
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
