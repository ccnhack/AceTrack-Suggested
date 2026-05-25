import { create } from 'zustand';
import { eventBus } from '../services/EventBus';
import { syncOrchestrator } from '../services/sync/SyncOrchestrator';
import storage, { thinPlayer, capPlayerDetail } from '../utils/storage';
import { Alert } from 'react-native';

// Cross-store imports to allow .getState() access
import { useAuthStore } from './useAuthStore.js';
import { usePlayersStore } from './usePlayersStore.js';
import { useSyncStore } from './useSyncStore.js';
import { useAppStore } from './useAppStore.js';
import { useTournamentsStore } from './useTournamentsStore.js';
import { useMatchmakingStore } from './useMatchmakingStore.js';
import { useEvaluationsStore } from './useEvaluationsStore.js';
import { useVideoStore } from './useVideoStore.js';

export const useSupportStore = create((set, get) => {
  eventBus.subscribe('ENTITY_UPDATED', async (e) => {
    if (e.payload.entity === 'supportTickets') {
      console.log(`[SupportStore] Received ENTITY_UPDATED for supportTickets. Source: ${e.payload.source}`);
      const freshData = await syncOrchestrator.getSystemFlag('supportTickets');
      if (freshData) {
        console.log(`[SupportStore] Updating store with ${freshData.length} tickets from storage.`);
        set({ supportTickets: freshData });
      }
    }
    if (e.payload.entity === 'chatbotMessages') {
      const freshData = await syncOrchestrator.getSystemFlag('chatbotMessages');
      if (freshData) {
        // 🛡️ [CHATBOT_MERGE_GUARD] (v2.6.418): Merge instead of overwrite.
        // Local chatbot messages are always authoritative (written locally first).
        // Server data may be stale due to OCC conflicts, so we keep the version
        // with MORE messages per user to prevent the vanishing message bug.
        const currentMessages = get().chatbotMessages || {};
        const merged = { ...freshData };
        for (const userId in currentMessages) {
          const localMsgs = currentMessages[userId] || [];
          const serverMsgs = merged[userId] || [];
          if (localMsgs.length > serverMsgs.length) {
            merged[userId] = localMsgs; // Local has newer messages, keep them
          }
        }
        set({ chatbotMessages: merged });
      }
    }
  });

  return {
    supportTickets: [],
    chatbotMessages: {},
    setSupportTickets: (tickets) => set({ supportTickets: tickets }),
    setChatbotMessages: (msgs) => set({ chatbotMessages: msgs }),

    hydrate: async () => {
      const startTime = Date.now();
      const tickets = await syncOrchestrator.getSystemFlag('supportTickets');
      const chatbot = await syncOrchestrator.getSystemFlag('chatbotMessages');
      console.log(`[STORE_DEBUG] Support Store Hydrate: Loaded ${tickets?.length || 0} tickets in ${Date.now() - startTime}ms`);
      if (tickets) set({ supportTickets: tickets });
      if (chatbot) set({ chatbotMessages: chatbot });

      const currentUser = useAuthStore.getState().currentUser;
      const isAdminOrSupport = currentUser?.role === 'admin' || currentUser?.role === 'support';
      if (isAdminOrSupport && (!tickets || tickets.length === 0)) {
         console.log('[SupportStore] [HYDRATE] Tickets empty. Triggering mandatory forcePullData...');
         syncOrchestrator.forcePullData();
      }
    },

    // ─── Actions migrated from SupportContext ───

    logSupportActivity: async (action, entityId, details) => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser || (currentUser.role !== 'support' && currentUser.role !== 'admin')) return;
      try {
        const currentLogs = await syncOrchestrator.getSystemFlag('auditLogs') || [];
        const newLog = {
          id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: currentUser.id,
          action,
          entityId,
          details,
          timestamp: new Date().toISOString(),
          category: 'support_activity'
        };
        const updatedLogs = [...currentLogs, newLog].slice(-200);
        syncOrchestrator.syncAndSaveData({ auditLogs: updatedLogs });
      } catch (e) {
        console.warn("[SupportStore] Failed to log support activity:", e);
      }
    },

    onSendChatMessage: (messages) => {
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const userId = currentUser.id;
      const currentMessages = get().chatbotMessages;
      const updatedMessages = { ...currentMessages, [userId]: messages };
      set({ chatbotMessages: updatedMessages });
      syncOrchestrator.syncAndSaveData({ chatbotMessages: updatedMessages });
    },

    onReplyTicket: (id, text, image, replyToMsg) => {
      const TicketService = require('../services/TicketService').default;
      const currentUser = useAuthStore.getState().currentUser;
      const isAdmin = currentUser?.role === 'admin';
      const currentTickets = get().supportTickets;
      const result = TicketService.replyToTicket(id, text, image, replyToMsg, currentUser, currentTickets, isAdmin);
      if (result.success) {
        set({ supportTickets: result.tickets });
        syncOrchestrator.syncAndSaveData({ supportTickets: result.tickets }, true);
        get().logSupportActivity('TICKET_REPLY', id, `Replied to ticket ${id}`);
      }
      return result;
    },

    onUpdateTicketStatus: (id, status, summary, justification) => {
      const TicketService = require('../services/TicketService').default;
      const currentTickets = get().supportTickets;
      const result = TicketService.updateStatus(id, status, summary, currentTickets, justification);
      if (result.success) {
        set({ supportTickets: result.tickets });
        syncOrchestrator.syncAndSaveData({ supportTickets: result.tickets }, true);
        get().logSupportActivity('TICKET_STATUS_CHANGE', id, `Changed status to ${status}`);
      }
      return result;
    },

    onSaveTicket: async (ticket) => {
      const TicketService = require('../services/TicketService').default;
      const currentUser = useAuthStore.getState().currentUser;
      const isAdmin = currentUser?.role === 'admin';
      const currentTickets = get().supportTickets;
      const result = await TicketService.saveTicket(ticket, currentTickets, isAdmin);
      if (result.success) {
        set({ supportTickets: result.tickets });
        syncOrchestrator.syncAndSaveData({ supportTickets: result.tickets });
        get().logSupportActivity('TICKET_SAVE', ticket.id || 'new', `Saved/Created ticket`);
      }
      return result;
    },

    onMarkSeen: (ticketId) => {
      const TicketService = require('../services/TicketService').default;
      const currentUser = useAuthStore.getState().currentUser;
      if (!currentUser) return;
      const currentTickets = get().supportTickets;
      const result = TicketService.markSeen(ticketId, currentUser.id, currentTickets);
      if (result.success) {
        set({ supportTickets: result.tickets });
        syncOrchestrator.syncAndSaveData({ supportTickets: result.tickets }, true);
      }
      return result;
    },

    onRetryMessage: (ticketId, msgId) => {
      console.log(`🛡️ Retrying sync for message ${msgId} in ticket ${ticketId}`);
      const currentTickets = get().supportTickets;
      syncOrchestrator.syncAndSaveData({ supportTickets: currentTickets }, true);
    },

    onClaimTicket: async (ticketId) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        
        const token = await storage.getItem('userToken');
        const headers = { 
          'Content-Type': 'application/json', 
          'x-ace-api-key': config.PUBLIC_APP_ID,
          'x-user-id': currentUser?.id || 'admin'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('CLAIM_TICKET')}`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ ticketId })
        });
        const data = await res.json();
        if (res.ok) {
          get().logSupportActivity('TICKET_CLAIMED', ticketId, `Claimed ticket from pool`);
          if (data && data.ticket) {
             const currentTickets = get().supportTickets;
             set({ supportTickets: currentTickets.map(t => t.id === ticketId ? data.ticket : t) });
          }
          return { success: true };
        }
        return { success: false, error: "Failed to claim ticket" };
      } catch (e) {
        return { success: false, error: e.message };
      }
    },

    onReassignTicket: async (ticketId, targetAgentId) => {
      try {
        const config = require('../config').default;
        const storage = require('../utils/storage').default;
        const currentUser = useAuthStore.getState().currentUser;
        
        const token = await storage.getItem('userToken');
        const headers = { 
          'Content-Type': 'application/json', 
          'x-ace-api-key': config.PUBLIC_APP_ID,
          'x-user-id': currentUser?.id || 'admin'
        };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('REASSIGN_TICKET')}`, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ ticketId, targetAgentId })
        });
        const data = await res.json();
        if (res.ok) {
          get().logSupportActivity('TICKET_ASSIGNED', ticketId, `Assigned ticket to agent ${targetAgentId}`);
          if (data && data.ticket) {
             const currentTickets = get().supportTickets;
             set({ supportTickets: currentTickets.map(t => t.id === ticketId ? data.ticket : t) });
          }
          return { success: true, message: data.message };
        }
        return { success: false, error: data.error || "Failed to reassign ticket" };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };
});

