import cron from 'node-cron';
import mongoose from 'mongoose';
import { sendPushNotification } from './notifications.js';

/**
 * Scheduled task to send tournament reminders 24 hours before they start.
 * Runs every hour.
 */
cron.schedule('0 * * * *', async () => {
  console.log('⏰ Running Tournament Reminders Job...');
  
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    
    if (!state || !state.data || !state.data.tournaments) return;

    const tournaments = state.data.tournaments;
    const players = state.data.players || [];
    const now = new Date();
    
    // Windows for 24h and 48h reminders
    const windows = [
      { 
        hours: 24, 
        start: new Date(now.getTime() + 24 * 60 * 60 * 1000), 
        end: new Date(now.getTime() + 25 * 60 * 60 * 1000),
        title: 'Tournament Reminder! 🏆',
        body: (t) => `Your tournament "${t}" starts in 24 hours. Get ready!`
      },
      { 
        hours: 48, 
        start: new Date(now.getTime() + 48 * 60 * 60 * 1000), 
        end: new Date(now.getTime() + 49 * 60 * 60 * 1000),
        title: 'Tournament Coming Up! 🎾',
        body: (t) => `Your tournament "${t}" starts in 2 days. Mark your calendar!`
      }
    ];

    for (const tournament of tournaments) {
      const tournamentDate = new Date(tournament.date);
      
      for (const window of windows) {
        if (tournamentDate >= window.start && tournamentDate < window.end) {
          console.log(`🔔 Sending ${window.hours}h reminders for: ${tournament.title}`);
          
          const registeredPlayerIds = tournament.registeredPlayerIds || [];
          const tokensToNotify = players
            .filter(p => registeredPlayerIds.includes(p.id) && p.pushTokens && Array.isArray(p.pushTokens))
            .flatMap(p => p.pushTokens);

          if (tokensToNotify.length > 0) {
            await sendPushNotification(
              tokensToNotify,
              window.title,
              window.body(tournament.title),
              { tournamentId: tournament.id, type: 'TOURNAMENT_REMINDER', hours: window.hours }
            );
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in Tournament Reminders Job:', error.message);
  }
});


/**
 * 🛡️ v2.6.102: EXPIRE STAGNANT PENDING PAYMENTS
 * Runs every 5 minutes to sweep and clear users who didn't pay within the 30-min window.
 */
cron.schedule('*/5 * * * *', async () => {
  console.log('⏰ Running Pending Payment Expiry Job...');
  
  try {
    const AppState = mongoose.model('AppState');
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    
    if (!state || !state.data || !state.data.tournaments) return;

    const tournaments = state.data.tournaments;
    const now = Date.now();
    const THIRTY_MINS = 30 * 60 * 1000;
    let changed = false;

    const updatedTournaments = tournaments.map(t => {
      const timestamps = t.pendingPaymentTimestamps || {};
      const pending = t.pendingPaymentPlayerIds || [];
      
      const toExpire = pending.filter(pid => {
        const ts = timestamps[pid];
        return ts && (now - ts) > THIRTY_MINS;
      });

      if (toExpire.length > 0) {
        console.log(`🧹 Expiring ${toExpire.length} pending users for tournament: ${t.title}`);
        changed = true;
        const newPending = pending.filter(pid => !toExpire.includes(pid));
        const newTimestamps = { ...timestamps };
        toExpire.forEach(pid => delete newTimestamps[pid]);

        return {
          ...t,
          pendingPaymentPlayerIds: newPending,
          pendingPaymentTimestamps: newTimestamps,
          // Re-add to waitlist? User said: "removed from the tournament and again see the option to register"
          // So we don't move them back to waitlist automatically.
          playerStatuses: (() => {
            const ps = { ...(t.playerStatuses || {}) };
            toExpire.forEach(pid => delete ps[pid]);
            return ps;
          })()
        };
      }
      return t;
    });

    if (changed) {
      state.data.tournaments = updatedTournaments;
      state.markModified('data.tournaments');
      state.lastUpdated = new Date();
      await state.save();
      console.log('✅ Expired payments cleared globally.');
    }
  } catch (error) {
    console.error('❌ Error in Pending Expiry Job:', error.message);
  }
});

console.log('📅 Tournament Reminders Job initialized (Hourly)');
console.log('📅 Pending Payment Expiry Job initialized (5-Min)');
