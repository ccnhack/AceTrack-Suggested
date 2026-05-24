import cron from 'node-cron';
import mongoose from 'mongoose';
import { sendPushNotification, checkPushReceipts } from './notifications.js';
import { processTournamentWaitlist } from './promotion_logic.mjs';

/**
 * 📊 EXPO NOTIFICATION DELIVERY TRACKER
 * Runs every 30 minutes to check if pending Expo tickets have been delivered.
 */
cron.schedule('*/30 * * * *', async () => {
  console.log('⏰ Running Notification Delivery Tracker Job...');
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data || !state.data.tournaments) return;

    let changed = false;
    for (let t of state.data.tournaments) {
      if (!t.pingDeliveryTracking || t.pingDeliveryTracking.length === 0) continue;

      for (let tracking of t.pingDeliveryTracking) {
        // Skip if all tickets are already resolved or if there are no tickets
        if (!tracking.tickets || tracking.tickets.length === 0) continue;

        const receipts = await checkPushReceipts(tracking.tickets);
        
        let stillPending = [];
        let newlyDelivered = 0;

        for (let ticketId of tracking.tickets) {
          const receipt = receipts[ticketId];
          if (receipt && receipt.status === 'ok') {
            newlyDelivered++;
            
            // Move coach to delivered list
            const coachId = tracking.ticketToCoach?.[ticketId];
            if (coachId) {
               if (!tracking.deliveredCoachIds) tracking.deliveredCoachIds = [];
               if (!tracking.deliveredCoachIds.includes(coachId)) tracking.deliveredCoachIds.push(coachId);
               tracking.pendingCoachIds = (tracking.pendingCoachIds || []).filter(id => id !== coachId);
            }
            
          } else if (receipt && receipt.status === 'error') {
            console.error(`❌ [DELIVERY_ERROR] Ticket ${ticketId} failed: ${receipt.message} (${receipt.details?.error})`);
            // It's resolved (as an error), so we don't put it back in stillPending
          } else {
            // No receipt yet, or still pending
            stillPending.push(ticketId);
          }
        }

        if (newlyDelivered > 0 || stillPending.length < tracking.tickets.length) {
          tracking.deliveredCount = (tracking.deliveredCount || 0) + newlyDelivered;
          tracking.undeliveredCount = tracking.undeliveredCount - (tracking.tickets.length - stillPending.length);
          if (tracking.undeliveredCount < 0) tracking.undeliveredCount = 0;
          tracking.tickets = stillPending; // Keep only unresolved tickets
          changed = true;
        }
      }
    }

    if (changed) {
      state.markModified('data.tournaments');
      state.lastUpdated = new Date();
      await state.save();
      console.log('✅ Notification Delivery Tracker complete.');
    }
  } catch (error) {
    console.error('❌ Error in Notification Delivery Tracker Job:', error.message);
  }
});

// ... existing reminders code ...

/**
 * 🛡️ v2.6.103: HARDENED BATCH EXPIRY & PROMOTION
 * Runs every 5 minutes to sweep stagnant payments AND immediately promote the next batch.
 */
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Running Batch Expiry & Promotion Job...');
  
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    
    if (!state || !state.data || !state.data.tournaments) return;

    const tournaments = state.data.tournaments;
    const players = state.data.players || [];
    const now = Date.now();
    const THIRTY_MINS = 30 * 60 * 1000;
    let changed = false;

    const updatedTournaments = tournaments.map(t => {
      const timestamps = t.pendingPaymentTimestamps || {};
      const pending = t.pendingPaymentPlayerIds || [];
      const waitlist = t.waitlistedPlayerIds || [];
      
      const toWarn = [];

      const toExpire = pending.filter(pid => {
        const ts = timestamps[pid];
        const status = (t.playerStatuses || {})[pid];
        
        // 🛡️ [UPI_GUARD] (v2.6.309): Do NOT auto-expire UPI payments. 
        if (status === 'Pending UPI') return false;

        if (!ts) return false;
        const timeElapsed = now - ts;
        
        // Warning at 25 minutes (5 mins remaining)
        if (timeElapsed >= (25 * 60 * 1000) && timeElapsed < (30 * 60 * 1000)) {
          // Prevent spamming warning multiple times by checking player notifications if needed, 
          // or just assume they get it once during this 5-min window if we mark them.
          if (!t._warnedPaymentIds) t._warnedPaymentIds = [];
          if (!t._warnedPaymentIds.includes(pid)) {
            toWarn.push(pid);
            t._warnedPaymentIds.push(pid);
            changed = true;
          }
        }

        return timeElapsed > THIRTY_MINS;
      });

      if (toWarn.length > 0) {
        console.log(`⚠️ [WARNING_JOB] Sending 5-min warning to ${toWarn.length} users in "${t.title}".`);
        toWarn.forEach(pid => {
          const player = players.find(p => String(p.id) === String(pid));
          if (player && player.pushTokens?.length > 0) {
            sendPushNotification(player.pushTokens, "Payment Expiring! ⏳", `You have 5 minutes left to pay for ${t.title} before your slot is given to the waitlist!`, { type: 'PAYMENT_WARNING', tournamentId: t.id });
          }
        });
      }

      if (toExpire.length > 0) {
        console.log(`🧹 [EXPIRY_JOB] Expiring ${toExpire.length} users in "${t.title}".`);
        changed = true;
        
        // Remove expired users entirely (per user request)
        const newPending = pending.filter(pid => !toExpire.includes(pid));
        const newTimestamps = { ...timestamps };
        toExpire.forEach(pid => delete newTimestamps[pid]);

        const updatedT = {
          ...t,
          pendingPaymentPlayerIds: newPending,
          pendingPaymentTimestamps: newTimestamps,
          playerStatuses: (() => {
            const ps = { ...(t.playerStatuses || {}) };
            toExpire.forEach(pid => delete ps[pid]);
            return ps;
          })()
        };
        
        // Immediately promote next batch of 3
        return processTournamentWaitlist(updatedT, players);
      }
      
      // Even if none expired, check if we need to top up the "3-person race" pool
      // (e.g., if someone just registered or opted out)
      const refinedT = processTournamentWaitlist(t, players);
      if (JSON.stringify(refinedT) !== JSON.stringify(t)) changed = true;
      return refinedT;
    });

    if (changed) {
      state.data.tournaments = updatedTournaments;
      state.data.players = players; // Save potentially updated player notification arrays
      state.markModified('data.tournaments');
      state.markModified('data.players');
      state.lastUpdated = new Date();
      await state.save();
      console.log('✅ Batch Expiry & Promotion sweep complete.');
    }
  } catch (error) {
    console.error('❌ Error in Batch Expiry Job:', error.message);
  }
});

/**
 * 📣 AUTO-PING COACHES JOB (v2.6.350)
 * Runs every 15 minutes to ping available coaches for tournaments needing one.
 */
cron.schedule('*/15 * * * *', async () => {
  console.log('⏰ Running Auto-Ping Coaches Job...');
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data || !state.data.tournaments) return;

    const tournaments = state.data.tournaments;
    const players = state.data.players || [];
    const now = Date.now();
    let changed = false;

    for (let t of tournaments) {
      if (t.coachAssignmentType !== 'platform' || t.assignedCoachId || !t.autoPingInterval) continue;
      if (t.status === 'completed' || t.tournamentConcluded) continue;

      const lastPing = t.lastCoachPingTimestamp || 0;
      if (now - lastPing >= t.autoPingInterval) {
        // Time to ping!
        const platformCoaches = players.filter(p => p.role === 'coach' && p.isApprovedCoach);
        const occupiedCoaches = platformCoaches.filter(c => tournaments.some(other => other.id !== t.id && other.date === t.date && other.assignedCoachId === c.id));
        
        const availableCoaches = platformCoaches.filter(c => {
           if (occupiedCoaches.some(oc => oc.id === c.id)) return false;
           if (t.declinedCoachIds && t.declinedCoachIds.includes(c.id)) return false;
           if (t.interestedCoachIds && t.interestedCoachIds.includes(c.id)) return false;
           return true;
        });

        if (availableCoaches.length > 0) {
           const pingCount = (t.lastCoachPingCount || 0) + 1;
           
           // 🛡️ Track ignored pings if this is a follow-up
           if (pingCount > 1) {
             availableCoaches.forEach(c => {
               const metrics = c.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
               c.coachMetrics = { ...metrics, pingsIgnored: (metrics.pingsIgnored || 0) + 1 };
             });
           }

           let title = "New Coaching Opportunity! 🏆";
           let body = `A new tournament (${t.title}) needs a coach. Tap to view.`;

           if (pingCount === 2) {
             title = "Follow-up: Coach needed 🔔";
             body = `If you are not available for ${t.title}, please click Decline in the app so we can notify others.`;
           } else if (pingCount >= 3) {
             title = "Urgent: Available Coaches Needed ⏳";
             body = `We are still looking for a coach for ${t.title} on ${t.date}. Please RSVP or Decline ASAP.`;
           }

           const tokensToPing = availableCoaches.flatMap(c => c.pushTokens || []);
           
           if (tokensToPing.length > 0) {
             console.log(`[AUTO-PING] Ping #${pingCount} for tournament ${t.id} to ${tokensToPing.length} tokens.`);
             const tickets = await sendPushNotification(tokensToPing, title, body, { type: 'COACH_AUTO_PING', tournamentId: t.id, pingCount });
             
             // 🛡️ Delivery Tracking Setup
             if (tickets && tickets.length > 0) {
               if (!t.pingDeliveryTracking) t.pingDeliveryTracking = [];
               
               const tokenToCoach = {};
               availableCoaches.forEach(c => {
                 (c.pushTokens || []).forEach(tok => { tokenToCoach[tok] = c.id; });
               });
               
               const ticketToCoach = {};
               tickets.forEach(ticket => {
                 if (ticket.status === 'ok' && ticket.pushToken && tokenToCoach[ticket.pushToken]) {
                   ticketToCoach[ticket.id] = tokenToCoach[ticket.pushToken];
                 }
               });

               t.pingDeliveryTracking.push({
                 timestamp: new Date().toISOString(),
                 pingCount,
                 tickets: tickets.filter(t => t.status === 'ok').map(t => t.id),
                 ticketToCoach,
                 deliveredCoachIds: [],
                 pendingCoachIds: availableCoaches.map(c => c.id),
                 deliveredCount: 0,
                 undeliveredCount: tokensToPing.length
               });
             }

             t.lastCoachPingTimestamp = now;
             t.lastCoachPingCount = pingCount;
             changed = true;
           }
        }
      }
    }

    if (changed) {
      state.markModified('data.tournaments');
      state.markModified('data.players'); // Save coachMetrics updates
      state.lastUpdated = new Date();
      await state.save();
      console.log('✅ Auto-Ping Coaches Job complete.');
    }
  } catch (error) {
    console.error('❌ Error in Auto-Ping Coaches Job:', error.message);
  }
});

/**
 * 📅 TOURNAMENT DAILY REMINDERS (Runs every day at 10:00 AM IST)
 * Handles: 24h Tournament Start reminders & Registration Deadline warnings.
 */
cron.schedule('30 4 * * *', async () => { // 4:30 AM UTC = 10:00 AM IST
  console.log('⏰ Running Daily Tournament Reminders Job...');
  
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
    if (!state || !state.data || !state.data.tournaments) return;

    const tournaments = state.data.tournaments;
    const players = state.data.players || [];
    const now = new Date();
    
    // Check tomorrow's date string (YYYY-MM-DD)
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    // Check day after tomorrow (for 48h deadline warnings)
    const dayAfter = new Date(now);
    dayAfter.setDate(dayAfter.getDate() + 2);
    const dayAfterStr = dayAfter.toISOString().split('T')[0];

    tournaments.forEach(t => {
      // 1. 24h Start Reminder
      if (t.date === tomorrowStr && !t.tournamentStarted && !t.tournamentConcluded) {
        console.log(`[REMINDER] Sending 24h start reminder for ${t.title}`);
        const registered = t.registeredPlayerIds || [];
        registered.forEach(pid => {
          const player = players.find(p => String(p.id) === String(pid));
          if (player && player.pushTokens?.length > 0) {
             sendPushNotification(player.pushTokens, "Tournament Tomorrow! ⏳", `Get ready! ${t.title} starts tomorrow.`, { type: 'TOURNAMENT_REMINDER', tournamentId: t.id });
          }
        });
      }

      // 2. Registration Deadline Approaching (if tournament date is day after tomorrow, registration closes soon)
      if (t.date === dayAfterStr && (t.waitlistedPlayerIds?.length > 0 || t.pendingPaymentPlayerIds?.length > 0)) {
        console.log(`[REMINDER] Sending deadline warning for ${t.title}`);
        const waitlistedAndPending = [...(t.waitlistedPlayerIds || []), ...(t.pendingPaymentPlayerIds || [])];
        waitlistedAndPending.forEach(pid => {
          const player = players.find(p => String(p.id) === String(pid));
          if (player && player.pushTokens?.length > 0) {
             sendPushNotification(player.pushTokens, "Registration Closing! ⚠️", `Hurry! The registration for ${t.title} is closing soon. Secure your slot!`, { type: 'TOURNAMENT_DEADLINE', tournamentId: t.id });
          }
        });
      }
    });

  } catch (error) {
    console.error('❌ Error in Daily Reminders Job:', error.message);
  }
});

console.log('📅 Tournament Reminders Job initialized (Daily at 10 AM IST)');
console.log('📅 Pending Payment Expiry Job initialized (5-Min)');
