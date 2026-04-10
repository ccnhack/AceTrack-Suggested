import cron from 'node-cron';
import mongoose from 'mongoose';
import { sendPushNotification } from './notifications.js';
import { processTournamentWaitlist } from './server.mjs';

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
      
      const toExpire = pending.filter(pid => {
        const ts = timestamps[pid];
        return ts && (now - ts) > THIRTY_MINS;
      });

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

console.log('📅 Tournament Reminders Job initialized (Hourly)');
console.log('📅 Pending Payment Expiry Job initialized (5-Min)');
