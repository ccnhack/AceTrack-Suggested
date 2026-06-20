import { sendPushNotification } from './notifications.js';

/**
 * 🛡️ [Group Promotion Hub] (v2.6.110): Circular-Safe Logic
 * Handles the logic for moving players from Waitlist to Pending Payment.
 * Dynamic batch size = availableSlots + 2 (redundancy)
 */
export const processTournamentWaitlist = (tournament, masterPlayers = []) => {
  if (!tournament) return tournament;
  const updatedT = { ...tournament };
  
  const max = updatedT.maxPlayers || 0;
  const registered = Array.isArray(updatedT.registeredPlayerIds) ? updatedT.registeredPlayerIds.filter(pid => !!pid) : [];
  const pending = Array.isArray(updatedT.pendingPaymentPlayerIds) ? updatedT.pendingPaymentPlayerIds.filter(pid => !!pid) : [];
  const waitlisted = Array.isArray(updatedT.waitlistedPlayerIds) ? updatedT.waitlistedPlayerIds.filter(pid => !!pid) : [];
  const timestamps = updatedT.pendingPaymentTimestamps || {};

  const availableSlots = Math.max(0, max - registered.length);
  
  // 🛡️ [Race-Loser Demotion]: If tournament is now FULL, push all 'Pending' back to Waitlist FRONT
  if (availableSlots <= 0 && pending.length > 0) {
    console.log(`📡 [PROMOTION_HUB] Tournament "${updatedT.title}" is full. Moving ${pending.length} pending losers back to FRONT of waitlist.`);
    
    // 🔔 Notify the losers of the race
    pending.forEach(pid => {
        const pIndex = masterPlayers.findIndex(p => String(p.id) === String(pid));
        if (pIndex >= 0) {
            const player = masterPlayers[pIndex];
            const title = "Oops! Slot Grabbed! 🎾";
            const body = `Someone else just grabbed the last slot in ${updatedT.title}. Don't worry, you're back at the front of the waitlist!`;
            
            player.notifications = [
                {
                    id: `notif-race-loss-${Date.now()}-${pid}`,
                    title,
                    message: body,
                    date: new Date().toISOString(),
                    read: false,
                    type: 'TOURNAMENT_RACE_LOSS',
                    tournamentId: updatedT.id
                },
                ...(player.notifications || [])
            ].slice(0, 50);
            
            masterPlayers[pIndex] = { ...player };
            
            // 🛡️ Trigger Push Notification
            if (player.pushTokens && player.pushTokens.length > 0) {
                sendPushNotification(player.pushTokens, title, body, { 
                    type: 'TOURNAMENT_RACE_LOSS', 
                    tournamentId: updatedT.id 
                });
            }
        }
    });

    // Maintain priority: pending[0] was 1st in waitlist, so it should stay 1st.
    updatedT.waitlistedPlayerIds = [...pending, ...waitlisted];
    updatedT.pendingPaymentPlayerIds = [];
    
    // Clear timestamps for these people so they get a fresh 30m later
    pending.forEach(pid => delete timestamps[pid]);
    updatedT.pendingPaymentTimestamps = timestamps;
    return updatedT;
  }

  // 🛡️ [Group Promotion]: Dynamic batch size = availableSlots + 2 (redundancy)
  const targetPendingCount = availableSlots + 2;
  if (availableSlots > 0 && waitlisted.length > 0 && pending.length < targetPendingCount) {
    const slotsToFill = targetPendingCount - pending.length;
    const promotedIds = waitlisted.splice(0, slotsToFill);
    
    console.log(`📡 [PROMOTION_HUB] Promoting batch of ${promotedIds.length} for tournament "${updatedT.title}". (Target: ${targetPendingCount})`);
    
    promotedIds.forEach(pid => {
      pending.push(pid);
      timestamps[pid] = Date.now();
      
      // Add in-app notification (persisted in player object)
      const pIndex = masterPlayers.findIndex(p => String(p.id) === String(pid));
      if (pIndex >= 0) {
          const player = masterPlayers[pIndex];
          const title = "Boom! 🎾 Slot Alert!";
          const body = `Academy has just increased the slots for ${updatedT.title}! 🚀 Pay now to secure your spot before this batch finishes!`;
          
          player.notifications = [
              {
                  id: `notif-${Date.now()}-${pid}`,
                  title,
                  message: body,
                  date: new Date().toISOString(),
                  read: false,
                  type: 'TOURNAMENT_PROMOTION',
                  tournamentId: updatedT.id
              },
              ...(player.notifications || [])
          ].slice(0, 50);
          
          masterPlayers[pIndex] = { ...player };

          // Track for response if needed
          updatedT._justPromotedIds = updatedT._justPromotedIds || [];
          updatedT._justPromotedIds.push(pid);

          // 🛡️ Trigger Push Notification
          if (player.pushTokens && player.pushTokens.length > 0) {
              sendPushNotification(player.pushTokens, title, body, { 
                  type: 'TOURNAMENT_PROMOTION', 
                  tournamentId: updatedT.id 
              });
          }
      }
    });

    updatedT.waitlistedPlayerIds = waitlisted;
    updatedT.pendingPaymentPlayerIds = pending;
    updatedT.pendingPaymentTimestamps = timestamps;
  }

  return updatedT;
};
