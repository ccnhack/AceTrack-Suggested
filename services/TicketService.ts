import logger from '../utils/logger';

/**
 * TICKET SERVICE (Phase 1.4)
 * Centralized business logic for support tickets, messaging, and status management.
 */
class TicketService {
  /**
   * Saves or creates a new support ticket with device metadata.
   */
  static saveTicket(ticket, prevTickets, deviceInfo) {
    logger.logAction('TICKET_SAVE_START', { ticketId: ticket.id });
    
    const generatedId = ticket.id || `${Math.floor(1000000 + Math.random() * 9000000)}`;
    const enrichmentTicket = { 
      id: generatedId,
      status: ticket.status || 'Open',
      createdAt: ticket.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...ticket, 
      deviceInfo: ticket.deviceInfo || deviceInfo
    };
    
    const ticketsArray = Array.isArray(prevTickets) ? prevTickets : [];
    const updated = ticketsArray.map(t => t && t.id === enrichmentTicket.id ? enrichmentTicket : t);
    
    if (!ticketsArray.find(t => t && t.id === enrichmentTicket.id)) {
      updated.unshift(enrichmentTicket);
    }
    
    return { success: true, tickets: updated };
  }

  /**
   * Handles replying to a support ticket.
   */
  static replyToTicket(ticketId, text, image, replyToMsg, currentUser, prevTickets, isAdmin) {
    logger.logAction('TICKET_REPLY_START', { ticketId });
    
    const msgText = typeof text === 'string' ? text : (text?.text || String(text || ''));
    const senderId = currentUser?.id || 'admin';
    
    const msg = { 
      id: `m-${Date.now()}`, 
      senderId, 
      text: msgText, 
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    if (image) msg.image = image;
    if (replyToMsg) {
      msg.replyTo = { 
        id: replyToMsg.id, 
        timestamp: replyToMsg.timestamp, 
        text: replyToMsg.text || '', 
        senderId: replyToMsg.senderId || '' 
      };
    }
    
    const updated = (prevTickets || []).map(t => {
      if (t && t.id === ticketId) {
        const newStatus = (!isAdmin && t.status === 'Awaiting Response') ? 'In Progress' : t.status;
        
        // 🛡️ [AUTO-ASSIGNMENT] (v2.6.254)
        // If ticket is unassigned and staff replies, assign locally for immediate UI feedback
        let assignedTo = t.assignedTo;
        const isUnassigned = !assignedTo || assignedTo === 'Unassigned' || assignedTo === '';
        const isStaff = isAdmin || currentUser?.role === 'support';
        
        if (isUnassigned && isStaff) {
           assignedTo = senderId;
        }

        return { 
          ...t, 
          status: newStatus,
          assignedTo,
          messages: [...(t.messages || []), msg],
          updatedAt: new Date().toISOString() 
        };
      }
      return t;
    });

    return { success: true, tickets: updated };
  }

  /**
   * Updates ticket status and logs administrative events.
   */
  static updateStatus(ticketId, newStatus, summary, prevTickets, justification) {
    logger.logAction('TICKET_STATUS_UPDATE', { ticketId, status: newStatus });
    
    const updated = (prevTickets || []).map(t => {
      if (t && t.id === ticketId) {
        const oldStatus = t.status || 'Open';
        const patch = { status: newStatus, updatedAt: new Date().toISOString() };
        if (summary) patch.closureSummary = summary;
        
        // 🔄 Transition logic
        const activeStates = ['Open', 'In Progress', 'Awaiting Response'];
        if (activeStates.includes(newStatus)) {
          if (oldStatus === 'Resolved' || oldStatus === 'Closed') {
            patch.closureSummary = null;
            patch.closedAt = null;
          }
        } else if (newStatus === 'Resolved' || newStatus === 'Closed') {
          patch.closedAt = new Date().toISOString();
        }

        const messages = [...(t.messages || [])];

        // 🛡️ [INTERNAL JUSTIFICATION] (v2.6.290)
        if (justification) {
          messages.push({
            id: `justification-${Date.now()}`,
            senderId: 'system',
            text: `REOPEN JUSTIFICATION: ${justification}`,
            timestamp: new Date().toISOString(),
            type: 'internal' // Private note
          });
        }

        // 📅 System Event Message
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const eventMsg = {
          id: `system-${Date.now()}`,
          senderId: 'system',
          text: `-------- ${newStatus.toUpperCase()} WAS ${oldStatus.toUpperCase()} --------\n(${time})`,
          timestamp: new Date().toISOString(),
          type: 'event'
        };
        messages.push(eventMsg);
        
        patch.messages = messages;
        return { ...t, ...patch };
      }
      return t;
    });
    return { success: true, tickets: updated };
  }

  /**
   * Marks incoming messages in a ticket as 'seen'.
   */
  static markSeen(ticketId, myId, prevTickets) {
    let changed = false;
    const updated = (prevTickets || []).map(t => {
      if (t && t.id === ticketId && t.messages) {
        const newMsgs = t.messages.map(m => {
          if (m.senderId !== myId && m.status !== 'seen') {
            changed = true;
            return { ...m, status: 'seen' };
          }
          return m;
        });
        if (changed) return { ...t, messages: newMsgs, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    return { success: changed, tickets: updated };
  }
}

export default TicketService;
