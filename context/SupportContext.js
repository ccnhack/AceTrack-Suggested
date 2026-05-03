import React, { createContext, useContext, useCallback, useMemo } from 'react';
import TicketService from '../services/TicketService';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { useAuth } from './AuthContext';
import config from '../config';
import { useSupportStore } from '../stores';
import { useSupportTicketsQuery } from '../stores/hooks';

const SupportContext = createContext(null);

export const useSupport = () => {
  const { data: supportTickets } = useSupportTicketsQuery();
  const chatbotMessages = useSupportStore(s => s.chatbotMessages);
  const context = useContext(SupportContext);

  return {
    supportTickets: supportTickets || [],
    chatbotMessages: chatbotMessages || {},
    ...context
  };
};

export const SupportProvider = ({ children }) => {
  const setSupportTicketsStore = useSupportStore(s => s.setSupportTickets);
  const setChatbotMessagesStore = useSupportStore(s => s.setChatbotMessages);
  
  const { syncAndSaveData } = useSync();
  const { currentUser, userRole, currentUserRef } = useAuth();

  // 🛡️ [SUPPORT TELEMETRY] (v2.6.273)
  const logSupportActivity = useCallback(async (action, entityId, details) => {
    if (!currentUserRef.current || userRole !== 'support') return;
    try {
      const currentLogs = await syncManager.getSystemFlag('auditLogs') || [];
      const newLog = {
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: currentUserRef.current.id,
        action,
        entityId,
        details,
        timestamp: new Date().toISOString(),
        category: 'support_activity'
      };
      
      const updatedLogs = [...currentLogs, newLog].slice(-200); // Max 200 per session/cache
      syncAndSaveData({ auditLogs: updatedLogs });
    } catch (e) {
      console.warn("[SupportContext] Failed to log support activity:", e);
    }
  }, [userRole, syncAndSaveData, currentUserRef]);

  const onSendChatMessage = useCallback((messages) => {
    if (!currentUserRef.current) return;
    const userId = currentUserRef.current.id;
    const currentMessages = useSupportStore.getState().chatbotMessages;
    const updatedMessages = { ...currentMessages, [userId]: messages };
    setChatbotMessagesStore(updatedMessages);
    syncAndSaveData({ chatbotMessages: updatedMessages });
  }, [syncAndSaveData, currentUserRef, setChatbotMessagesStore]);

  const onReplyTicket = useCallback((id, text, image, replyToMsg) => {
    const isAdmin = userRole === 'admin';
    const currentTickets = useSupportStore.getState().supportTickets;
    const result = TicketService.replyToTicket(id, text, image, replyToMsg, currentUserRef.current, currentTickets, isAdmin);
    if (result.success) {
      setSupportTicketsStore(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets }, true);
      logSupportActivity('TICKET_REPLY', id, `Replied to ticket ${id}`);
    }
    return result;
  }, [userRole, syncAndSaveData, logSupportActivity, currentUserRef, setSupportTicketsStore]);

  const onUpdateTicketStatus = useCallback((id, status, summary, justification) => {
    const currentTickets = useSupportStore.getState().supportTickets;
    const result = TicketService.updateStatus(id, status, summary, currentTickets, justification);
    if (result.success) {
      setSupportTicketsStore(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets }, true);
      logSupportActivity('TICKET_STATUS_CHANGE', id, `Changed status to ${status}`);
    }
    return result;
  }, [syncAndSaveData, logSupportActivity, setSupportTicketsStore]);

  const onSaveTicket = useCallback(async (ticket) => {
    const isAdmin = userRole === 'admin';
    const currentTickets = useSupportStore.getState().supportTickets;
    const result = await TicketService.saveTicket(ticket, currentTickets, isAdmin);
    if (result.success) {
      setSupportTicketsStore(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets });
      logSupportActivity('TICKET_SAVE', ticket.id || 'new', `Saved/Created ticket`);
    }
    return result;
  }, [userRole, syncAndSaveData, logSupportActivity, setSupportTicketsStore]);

  const onMarkSeen = useCallback((ticketId) => {
    if (!currentUserRef.current) return;
    const currentTickets = useSupportStore.getState().supportTickets;
    const result = TicketService.markSeen(ticketId, currentUserRef.current.id, currentTickets);
    if (result.success) {
      setSupportTicketsStore(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets }, true);
    }
    return result;
  }, [syncAndSaveData, currentUserRef, setSupportTicketsStore]);

  const onRetryMessage = useCallback((ticketId, msgId) => {
    console.log(`🛡️ Retrying sync for message ${msgId} in ticket ${ticketId}`);
    const currentTickets = useSupportStore.getState().supportTickets;
    syncAndSaveData({ supportTickets: currentTickets }, true);
  }, [syncAndSaveData]);

  const onClaimTicket = useCallback(async (ticketId) => {
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json', 
        'x-ace-api-key': config.PUBLIC_APP_ID,
        'x-user-id': currentUserRef.current?.id || 'admin'
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
        logSupportActivity('TICKET_CLAIMED', ticketId, `Claimed ticket from pool`);
        if (data && data.ticket) {
           const currentTickets = useSupportStore.getState().supportTickets;
           setSupportTicketsStore(currentTickets.map(t => t.id === ticketId ? data.ticket : t));
        }
        return { success: true };
      }
      return { success: false, error: "Failed to claim ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [currentUserRef, logSupportActivity, setSupportTicketsStore]);

  const onReassignTicket = useCallback(async (ticketId, targetAgentId) => {
    try {
      const token = await storage.getItem('userToken');
      const headers = { 
        'Content-Type': 'application/json', 
        'x-ace-api-key': config.PUBLIC_APP_ID,
        'x-user-id': currentUserRef.current?.id || 'admin'
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
        logSupportActivity('TICKET_ASSIGNED', ticketId, `Assigned ticket to agent ${targetAgentId}`);
        if (data && data.ticket) {
           const currentTickets = useSupportStore.getState().supportTickets;
           setSupportTicketsStore(currentTickets.map(t => t.id === ticketId ? data.ticket : t));
        }
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || "Failed to reassign ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [currentUserRef, logSupportActivity, setSupportTicketsStore]);

  const value = useMemo(() => ({
    setSupportTickets: setSupportTicketsStore,
    setChatbotMessages: setChatbotMessagesStore,
    onSendChatMessage,
    onReplyTicket,
    onMarkSeen,
    onUpdateTicketStatus,
    onSaveTicket,
    onClaimTicket,
    onReassignTicket,
    onRetryMessage
  }), [
    setSupportTicketsStore, setChatbotMessagesStore, onSendChatMessage,
    onReplyTicket, onMarkSeen, onUpdateTicketStatus, onSaveTicket,
    onClaimTicket, onReassignTicket, onRetryMessage
  ]);

  return (
    <SupportContext.Provider value={value}>
      {children}
    </SupportContext.Provider>
  );
};
