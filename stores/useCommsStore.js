import { create } from 'zustand';
import { Platform } from 'react-native';
import config from '../config';

export const useCommsStore = create((set, get) => ({
    messages: [],
    announcements: [],
    isLoading: false,

    fetchMessages: async () => {
        try {
            set({ isLoading: true });
            
            // 🛡️ [WEB_AUTH_SAFETY] (v2.6.258)
            let token = '';
            try { token = window.localStorage?.getItem('acetrack_auth_token') || ''; } catch (e) {}
            
            const url = Platform.OS === 'web' ? '/api/comms/chat' : `${config.API_BASE_URL}/api/v1/comms/chat`;
            const response = await fetch(url, {
                headers: { 
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-ace-api-key': config.PUBLIC_APP_ID 
                }
            });
            const data = await response.json();
            if (data.success) set({ messages: data.messages });
        } catch (error) {
            console.error("Failed to fetch messages:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    sendMessage: async (content, receiverId) => {
        try {
            // 🛡️ [WEB_AUTH_SAFETY] (v2.6.258)
            let token = '';
            try { token = window.localStorage?.getItem('acetrack_auth_token') || ''; } catch (e) {}

            const url = Platform.OS === 'web' ? '/api/comms/chat' : `${config.API_BASE_URL}/api/v1/comms/chat`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-ace-api-key': config.PUBLIC_APP_ID
                },
                body: JSON.stringify({ content, receiverId })
            });
            const data = await response.json();
            if (data.success && data.message) {
                // 🛡️ [OPTIMISTIC_UPDATE] (v2.6.344): Immediately add to local state
                const msgs = get().messages;
                if (!msgs.find(m => m._id === data.message._id)) {
                    set({ messages: [...msgs, data.message] });
                }
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
            // 🛡️ [WEB_AUTH_SAFETY] (v2.6.258)
            let token = '';
            try { token = window.localStorage?.getItem('acetrack_auth_token') || ''; } catch (e) {}

            const url = Platform.OS === 'web' ? '/api/comms/announcements' : `${config.API_BASE_URL}/api/v1/comms/announcements`;
            const response = await fetch(url, {
                headers: { 
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-ace-api-key': config.PUBLIC_APP_ID
                }
            });
            const data = await response.json();
            if (data.success) set({ announcements: data.announcements });
        } catch (error) {
            console.error("Failed to fetch announcements:", error);
        } finally {
            set({ isLoading: false });
        }
    },
    markAsSeen: async (senderId) => {
        try {
            // 🛡️ [WEB_AUTH_SAFETY] (v2.6.258)
            let token = '';
            try { token = window.localStorage?.getItem('acetrack_auth_token') || ''; } catch (e) {}

            const response = await fetch(`${config.API_BASE_URL}/api/v1/comms/chat/seen`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                    'x-ace-api-key': config.PUBLIC_APP_ID
                },
                body: JSON.stringify({ senderId })
            });
            const data = await response.json();
            if (data.success) {
                const updatedMessages = get().messages.map(m => 
                    (String(m.senderId) === String(senderId) && m.status !== 'seen') ? { ...m, status: 'seen' } : m
                );
                set({ messages: updatedMessages });
            }
        } catch (error) {
            console.error("Failed to mark as seen:", error);
        }
    }
}));
