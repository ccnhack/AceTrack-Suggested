import { create } from 'zustand';
import { Platform } from 'react-native';
import config from '../config';

// 🛡️ [AUTH FIX] (v2.6.432): Replaced dead localStorage token reads with credentials:'include' + x-ace-api-key.
// The HttpOnly cookie (acetrack_session) is sent automatically via credentials:'include'.
// No explicit Authorization header needed — the apiKeyGuard + authGuard middleware handles it.
const getCommsHeaders = () => ({
    'x-ace-api-key': config.PUBLIC_APP_ID
});

const getCommsJsonHeaders = () => ({
    'Content-Type': 'application/json',
    'x-ace-api-key': config.PUBLIC_APP_ID
});

export const useCommsStore = create((set, get) => ({
    messages: [],
    announcements: [],
    isLoading: false,
    uploadingFile: false,
    replyTo: null, // 💬 [QUOTED_REPLY] (v2.6.405)

    fetchMessages: async () => {
        try {
            set({ isLoading: true });
            
            const url = Platform.OS === 'web' ? '/api/comms/chat' : `${config.API_BASE_URL}/api/v1/comms/chat`;
            const response = await fetch(url, {
                credentials: 'include',
                headers: getCommsHeaders()
            });
            const data = await response.json();
            if (data.success) set({ messages: data.messages });
        } catch (error) {
            console.error("Failed to fetch messages:", error);
        } finally {
            set({ isLoading: false });
        }
    },

    sendMessage: async (content, receiverId, attachments = []) => {
        try {
            const replyToMsg = get().replyTo;
            // Send the explicit ID if we can read it, otherwise send the entire object to let the backend parse it out.
            const replyTo = replyToMsg?._id || replyToMsg?.id || replyToMsg || null;

            const url = Platform.OS === 'web' ? '/api/comms/chat' : `${config.API_BASE_URL}/api/v1/comms/chat`;
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: getCommsJsonHeaders(),
                body: JSON.stringify({ content, receiverId, attachments, replyTo })
            });
            const data = await response.json();
            if (data.success && data.message) {
                set({ messages: [...get().messages, data.message], replyTo: null });
                return true;
            }
            return false;
        } catch (error) {
            console.error("Failed to send message:", error);
            return false;
        }
    },

    // 😄 [REACTION_LOGIC] (v2.6.410): Optimistic updates
    toggleReaction: async (messageId, emoji) => {
        try {
            // Optimistic Update — we can't decode JWT from HttpOnly cookie,
            // so we rely on server response for final state.
            const url = Platform.OS === 'web' ? '/api/comms/chat/react' : `${config.API_BASE_URL}/api/v1/comms/chat/react`;
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: getCommsJsonHeaders(),
                body: JSON.stringify({ messageId, emoji })
            });
            const data = await response.json();
            if (data.success) {
                const updated = get().messages.map(m => 
                    m._id === messageId ? { ...m, reactions: data.reactions } : m
                );
                set({ messages: updated });
            }
        } catch (e) {}
    },

    // 🗑️ [DELETE_LOGIC] (v2.6.405)
    deleteMessage: async (id) => {
        try {
            const url = Platform.OS === 'web' ? `/api/comms/chat/${id}` : `${config.API_BASE_URL}/api/v1/comms/chat/${id}`;
            const response = await fetch(url, {
                method: 'DELETE',
                credentials: 'include',
                headers: getCommsHeaders()
            });
            const data = await response.json();
            if (data.success) {
                set({ messages: get().messages.filter(m => m._id !== id) });
            }
        } catch (e) {}
    },

    setReplyTo: (msg) => set({ replyTo: msg }),

    uploadAttachment: async (file) => {
        try {
            set({ uploadingFile: true });

            const formData = new FormData();
            formData.append('file', file);

            const url = Platform.OS === 'web' ? '/api/comms/chat/upload' : `${config.API_BASE_URL}/api/v1/comms/chat/upload`;
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { 'x-ace-api-key': config.PUBLIC_APP_ID },
                body: formData
            });
            const data = await response.json();
            if (data.success) return data.attachment;
            return null;
        } catch (error) {
            console.error("Failed to upload attachment:", error);
            return null;
        } finally {
            set({ uploadingFile: false });
        }
    },

    appendMessage: (msg) => {
        const msgs = get().messages;
        if (!msgs.find(m => m._id === msg._id)) {
            set({ messages: [...msgs, msg] });
        }
    },

    updateReactions: (messageId, reactions) => {
        const updated = get().messages.map(m => 
            m._id === messageId ? { ...m, reactions } : m
        );
        set({ messages: updated });
    },

    removeMessage: (messageId) => {
        set({ messages: get().messages.filter(m => m._id !== messageId) });
    },

    markAsSeen: async (senderId) => {
        try {
            const url = Platform.OS === 'web' ? '/api/comms/chat/seen' : `${config.API_BASE_URL}/api/v1/comms/chat/seen`;
            const response = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: getCommsJsonHeaders(),
                body: JSON.stringify({ senderId })
            });
            const data = await response.json();
            if (data.success) {
                const updated = get().messages.map(m => 
                    m.senderId === senderId ? { ...m, status: 'seen' } : m
                );
                set({ messages: updated });
            }
        } catch (e) {}
    },

    fetchAnnouncements: async () => {
        try {
            set({ isLoading: true });

            const url = Platform.OS === 'web' ? '/api/comms/announcements' : `${config.API_BASE_URL}/api/v1/comms/announcements`;
            const response = await fetch(url, {
                credentials: 'include',
                headers: getCommsHeaders()
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
