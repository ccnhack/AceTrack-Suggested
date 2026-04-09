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

console.log('📅 Tournament Reminders Job initialized (Hourly)');
