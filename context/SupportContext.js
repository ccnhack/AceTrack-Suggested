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
    }
    return result;
  }, [supportTickets, userRole, syncAndSaveData]);

  const onUpdateTicketStatus = useCallback((id, status, summary) => {
    const result = TicketService.updateStatus(id, status, summary, supportTickets);
    if (result.success) {
      setSupportTickets(result.tickets);
      // 🛡️ [FIX v2.6.121] Atomic push to prevent status changes from being rolled back
      syncAndSaveData({ supportTickets: result.tickets }, true);
    }
    return result;
  }, [supportTickets, syncAndSaveData]);

  const onSaveTicket = useCallback(async (ticket) => {
    const isAdmin = userRole === 'admin';
    const result = await TicketService.saveTicket(ticket, supportTickets, isAdmin);
    if (result.success) {
      setSupportTickets(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets });
    }
    return result;
  }, [supportTickets, userRole, syncAndSaveData]);

  const onMarkSeen = useCallback((ticketId) => {
    if (!currentUserRef.current) return;
    const result = TicketService.markSeen(ticketId, currentUserRef.current.id, supportTickets);
    if (result.success) {
      setSupportTickets(result.tickets);
      syncAndSaveData({ supportTickets: result.tickets });
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
      const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('CLAIM_TICKET')}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${await storage.getItem('userToken')}`, // authenticateToken usage
          'x-ace-api-key': config.PUBLIC_APP_ID
        },
        body: JSON.stringify({ ticketId })
      });
      if (res.ok) {
        // The server updated the master state; we rely on the next ENTITY_UPDATED to refresh.
        return { success: true };
      }
      return { success: false, error: "Failed to claim ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);

  /** 🛡️ [NEW v2.6.162] Reassign a specific ticket to another agent */
  const onReassignTicket = useCallback(async (ticketId, targetAgentId) => {
    try {
      const res = await fetch(`${config.API_BASE_URL}${config.getEndpoint('REASSIGN_TICKET')}`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json', 
          'Authorization': `Bearer ${await storage.getItem('userToken')}`, 
          'x-ace-api-key': config.PUBLIC_APP_ID,
          'x-user-id': 'admin'
        },
        body: JSON.stringify({ ticketId, targetAgentId })
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, message: data.message };
      }
      return { success: false, error: data.error || "Failed to reassign ticket" };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }, []);


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
