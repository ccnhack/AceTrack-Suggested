import { processTournamentWaitlist } from '../promotion_logic.mjs';

export async function processSaveBusinessLogic(deps, { req, changedKeys, currentData, newMasterData, modifiedEntities }) {
    const { SupportMetricsService, logAudit } = deps;
// ═══════════════════════════════════════════════════════════════
// 🏆 WAITLIST PROMOTION & PRIORITY LOGIC (v2.6.103)
if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
  // Create a snapshot of player notification lengths before processing
  const playerNotifMap = new Map();
  (newMasterData.players || []).forEach(p => {
    if (p && p.id) {
      playerNotifMap.set(String(p.id), (p.notifications || []).length);
    }
  });

  newMasterData.tournaments = newMasterData.tournaments.map(t => {
    const originalWaitlistStr = JSON.stringify(t.waitlistedPlayerIds || []);
    const originalPendingStr = JSON.stringify(t.pendingPaymentPlayerIds || []);
    const originalRegStr = JSON.stringify(t.registeredPlayerIds || []);
    
    const processed = processTournamentWaitlist(t, newMasterData.players || []);
    
    // 🛡️ SCALABILITY FIX (v2.6.316): Register side-effects in the delta tracker
    const changed = 
      JSON.stringify(processed.waitlistedPlayerIds || []) !== originalWaitlistStr ||
      JSON.stringify(processed.pendingPaymentPlayerIds || []) !== originalPendingStr ||
      JSON.stringify(processed.registeredPlayerIds || []) !== originalRegStr;
      
    if (changed) {
      modifiedEntities.tournaments.set(processed.id, processed);
    }
    return processed;
  });

  // 🛡️ [SIDE-EFFECT REPAIR] (v2.6.316): Explicitly register mutated players
  // processTournamentWaitlist appends in-app notifications directly to the masterPlayers array in memory.
  // We must explicitly register these mutated players in the delta tracker so they are saved to the DB.
  (newMasterData.players || []).forEach(p => {
    if (p && p.id) {
      const originalLen = playerNotifMap.get(String(p.id)) || 0;
      const newLen = (p.notifications || []).length;
      if (newLen > originalLen) {
        console.log(`[SIDE-EFFECT] Waitlist promotion detected. Explicitly marking player ${p.id} for sync.`);
        modifiedEntities.players.set(String(p.id).toLowerCase(), p);
      }
    }
  });
}

// 🛡️ [SUPPORT BUSINESS LOGIC ENGINE] (v2.6.438)
// Perform auto-assignment, termination cleanup, and response tracking BEFORE saving to database.
if (changedKeys.includes('supportTickets')) {
   const existingTickets = currentData.supportTickets || [];
   (newMasterData.supportTickets || []).forEach(ticket => {
     const existing = existingTickets.find(et => et.id === ticket.id);
     const isNew = !existing;
     const isUnassigned = !ticket.assignedTo || ticket.assignedTo === 'Unassigned' || ticket.assignedTo === '';
     
     // 1. 🤖 [AUTO-ASSIGNMENT]
     if (isNew && isUnassigned && ticket.status === 'Open') {
       const bestAgent = SupportMetricsService.findBestAgent(newMasterData.players, newMasterData.supportTickets || []);
       if (bestAgent) {
         console.log(`🤖 [ASSIGN] Pre-save auto-assigning ticket ${ticket.id} to agent ${bestAgent.id}`);
         ticket.assignedTo = bestAgent.id;
         ticket.assignedAt = new Date().toISOString();
         ticket.assignmentSource = 'auto';
         modifiedEntities.supportTickets.set(ticket.id, ticket);

         // Increment agent's lifetime handles
         const agentIndex = newMasterData.players.findIndex(p => p.id === bestAgent.id);
         if (agentIndex !== -1) {
           const agent = newMasterData.players[agentIndex];
           if (!agent.metrics) agent.metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
           agent.metrics.totalHandled += 1;
           modifiedEntities.players.set(agent.id.toLowerCase(), agent);
         }

         logAudit(req, 'TICKET_AUTO_ASSIGNED', ['supportTickets', 'players'], { 
           ticketId: ticket.id, 
           agentId: bestAgent.id,
           agentName: `${bestAgent.firstName || ''} ${bestAgent.lastName || ''}`.trim()
         }).catch(() => {});
       }
     }

     // 2. 🛡️ [TERMINATION CLEANUP]
     if (ticket.assignedTo) {
       const agent = newMasterData.players.find(p => p.id === ticket.assignedTo);
       const status = (agent?.supportStatus || '').toLowerCase();
       if (agent && ['terminated', 'left', 'ex-employee'].includes(status)) {
         console.log(`🛡️ [CLEANUP] Pre-save unassigning ticket ${ticket.id} due to agent termination.`);
         ticket.assignedTo = null;
         ticket.assignedAt = null;
         modifiedEntities.supportTickets.set(ticket.id, ticket);
       }
     }

     // 3. 🛡️ [RESPONSE TRACKING]
     const existingMsgCount = existing?.messages?.length || 0;
     const newMessages = (ticket.messages || []).slice(existingMsgCount);
     for (const msg of newMessages) {
       if (String(msg.senderId) !== String(ticket.userId) && !ticket.firstResponseAt && msg.senderId !== 'system') {
         ticket.firstResponseAt = new Date().toISOString();
         modifiedEntities.supportTickets.set(ticket.id, ticket);
       }
     }
   });
}


}
