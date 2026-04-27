import React, { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';
import { eventBus } from '../services/EventBus';
import TicketService from '../services/TicketService';
import storage from '../utils/storage';
import { syncManager } from '../services/SyncManager';
import { useSync } from './SyncContext';
import { useAuth } from './AuthContext';
import config from '../config';

const SupportContext = createContext(null);

export const useSupport = () => useContext(SupportContext);

export const SupportProvider = ({ children }) => {
  const [supportTickets, setSupportTickets] = useState([]);
  const [chatbotMessages, setChatbotMessages] = useState({});
  
  const { syncAndSaveData } = useSync();
  const { currentUser, userRole, currentUserRef } = useAuth();

  // Entity Listener & Hydration
  useEffect(() => {
    // 1. Initial Hydration
    const hydrate = async () => {
      const tickets = await syncManager.getSystemFlag('supportTickets');
      if (tickets) setSupportTickets(tickets);
      const chat = await syncManager.getSystemFlag('chatbotMessages');
      if (chat) setChatbotMessages(chat);
    };
    hydrate();

    // 2. Real-time Subscription
    const unsub = eventBus.subscribe('ENTITY_UPDATED', async (e) => {
      const { entity, source } = e.payload;
      if (source === 'socket' || source === 'api') {
        if (entity === 'supportTickets') {
          const freshData = await syncManager.getSystemFlag('supportTickets');
          if (freshData) setSupportTickets(freshData);
        } else if (entity === 'chatbotMessages') {
          const freshChat = await syncManager.getSystemFlag('chatbotMessages');
          if (freshChat) setChatbotMessages(freshChat);
        }
      }
    });
    return unsub;
  }, []);

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
  }, [userRole, syncAndSaveData]);

  const onSendChatMessage = useCallback((messages) => {
    if (!currentUserRef.current) return;
    const userId = currentUserRef.current.id;
    const updatedMessages = { ...chatbotMessages, [userId]: messages };
    setChatbotMessages(updatedMessages);
    syncAndSaveData({ chatbotMessages: updatedMessages });
  }, [chatbotMessages, syncAndSaveData]);

  const onReplyTicket = useCallback((id, text, image, replyToMsg) => {
    const isAdmin = userRole === 'admin';
    const result = TicketService.replyToTicket(id, text, image, replyToMsg, currentUserRef.current, supportTickets, isAdmin);
    if (result.success) {
      setSupportTickets(result.tickets);
      // 🛡️ [FIX v2.6.121] Atomic push to prevent replies from being lost on stale cloud pull
      syncAndSaveData({ supportTickets: result.tickets }, true);
      logSupportActivity('TICKET_REPLY', id, `Replied to ticket ${id}`);
    }
    return result;
  }, [supportTickets, userRole, syncAndSaveData]);

  const onUpdateTicketStatus = useCallback((id, status, summary, justification) => {
    const result = TicketService.updateStatus(id, status, summary, supportTickets, justification);
    if (result.success) {
      setSupportTickets(result.tickets);
      // 🛡️ [FIX v2.6.121] Atomic push to prevent status changes from being rolled back
      syncAndSaveData({ supportTickets: result.tickets }, true);
      logSupportActivity('TICKET_STATUS_CHANGE', id, `Changed status to ${status}`);
    }
    return result;
  }, [supportTickets, syncAndSaveData]);

  const onSaveTicket = useCallback(async (ticket) => {
    const isAdmin = userRole === 'admin';
    const result = await TicketService.saveTicket(ticket, supportTickets, isAdmin);
    if (result.success) {
      setSupportTickets(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets });
      logSupportActivity('TICKET_SAVE', ticket.id || 'new', `Saved/Created ticket`);
    }
    return result;
  }, [supportTickets, userRole, syncAndSaveData]);

  const onMarkSeen = useCallback((ticketId) => {
    if (!currentUserRef.current) return;
    const result = TicketService.markSeen(ticketId, currentUserRef.current.id, supportTickets);
    if (result.success) {
      setSupportTickets(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets }, true);
    }
    return result;
  }, [supportTickets, syncAndSaveData]);

  // 🛡️ [MIGRATION FIX] (v2.6.121) Retry failed message sync
  const onRetryMessage = useCallback((ticketId, msgId) => {
    console.log(`🛡️ Retrying sync for message ${msgId} in ticket ${ticketId}`);
    // Force a re-push of supportTickets to sync the pending message
    syncAndSaveData({ supportTickets }, true);
  }, [supportTickets, syncAndSaveData]);

  /** 🛡️ [NEW v2.6.132] Claim a ticket from the unassigned pool */
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
        
        // 🛡️ [REAL-TIME FIX] Update local state immediately
        if (data && data.ticket) {
           setSupportTickets(prev => prev.map(t => t.id === ticketId ? data.ticket : t));
        }
        
        // The server updated the master state; we rely on the next ENTITY_UPDATED to refresh globally.
        return { success: true };
      }
      return { success: false, error: "Failed to claim ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [currentUserRef, logSupportActivity]);

  /** 🛡️ [NEW v2.6.162] Reassign a specific ticket to another agent */
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
           setSupportTickets(prev => prev.map(t => t.id === ticketId ? data.ticket : t));
        }
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || "Failed to reassign ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, [currentUserRef, logSupportActivity]);


  const value = {
    supportTickets,
    setSupportTickets,
    chatbotMessages,
    setChatbotMessages,
    onSendChatMessage,
    onReplyTicket,
    onMarkSeen,
    onUpdateTicketStatus,
    onSaveTicket,
    onClaimTicket,
    onReassignTicket,
    // 🛡️ [MIGRATION FIX] (v2.6.121) Missing handler
    onRetryMessage
  };


  return (
    <SupportContext.Provider value={value}>
      {children}
    </SupportContext.Provider>
  );
};
