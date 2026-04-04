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
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twentyFiveHoursFromNow = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    for (const tournament of tournaments) {
      const tournamentDate = new Date(tournament.date);
      
      // Check if tournament starts in the next 24-25 hours window
      if (tournamentDate >= twentyFourHoursFromNow && tournamentDate < twentyFiveHoursFromNow) {
        console.log(`🔔 Sending reminders for tournament: ${tournament.title}`);
        
        const registeredPlayerIds = tournament.registeredPlayerIds || [];
        const tokensToNotify = players
          .filter(p => registeredPlayerIds.includes(p.id) && p.pushToken)
          .map(p => p.pushToken);

        if (tokensToNotify.length > 0) {
          const tickets = await sendPushNotification(
            tokensToNotify,
            'Tournament Reminder! 🏆',
            `Your tournament "${tournament.title}" starts in 24 hours. Get ready!`,
            { tournamentId: tournament.id, type: 'TOURNAMENT_REMINDER' }
          );
          console.log(`✅ Sent ${tokensToNotify.length} reminders for tourney ${tournament.id}. Tickets:`, tickets.length);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in Tournament Reminders Job:', error.message);
  }
});

console.log('📅 Tournament Reminders Job initialized (Hourly)');
