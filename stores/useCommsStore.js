import { create } from 'zustand';
import config from '../config';

export const useCommsStore = create((set, get) => ({
    messages: [],
    announcements: [],
    isLoading: false,

    fetchMessages: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/comms/chat`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ messages: data.messages });
        } catch (error) {
            console.error("Failed to fetch messages:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    sendMessage: async (content) => {
        try {
            const response = await fetch(`${config.API_BASE_URL}/api/v1/comms/chat`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` 
                },
                body: JSON.stringify({ content })
            });
            const data = await response.json();
            if (data.success) {
                // Socket.io will handle the state update usually, but we can do optimistic update
                // set({ messages: [...get().messages, data.message] });
                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to send message:", error);
            return false;
        }
    },

    appendMessage: (msg) => {
        const msgs = get().messages;
        if (!msgs.find(m => m._id === msg._id)) {
            set({ messages: [...msgs, msg] });
        }
    },

    fetchAnnouncements: async () => {
        try {
            set({ isLoading: true });
            const response = await fetch(`${config.API_BASE_URL}/api/v1/comms/announcements`, {
                headers: { 'Authorization': `Bearer ${window.localStorage?.getItem('acetrack_auth_token') || ''}` }
            });
            const data = await response.json();
            if (data.success) set({ announcements: data.announcements });
        } catch (error) {
            console.error("Failed to fetch announcements:", error);
        } finally {
            set({ isLoading: false });
        }
    }
}));
