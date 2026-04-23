const mongoose = require('mongoose');
const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now }
});

const AppState = mongoose.model('AppState', AppStateSchema);

async function cleanupTickets() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data || !state.data.supportTickets) {
      console.log('No tickets found in database.');
      return;
    }

    const tickets = state.data.supportTickets;
    const initialCount = tickets.length;
    console.log(`Initial ticket count: ${initialCount}`);

    const testUserIds = ['testindividual', 'testingacademy', 'testingcoach', 'saboteur', 'guest_test', 'testindividual2', 'testindividual3', 'e2e_user'];
    
    const cleanedTickets = tickets.filter(t => {
      const title = String(t.title || '').toLowerCase();
      const desc = String(t.description || '').toLowerCase();
      const userId = String(t.userId || '').toLowerCase();
      
      const isE2E = title.includes('e2e') || 
                   title.includes('detox') || 
                   title.includes('automated test') ||
                   desc.includes('e2e') || 
                   desc.includes('detox') || 
                   desc.includes('automated test') ||
                   testUserIds.includes(userId) ||
                   userId.includes('test');
      
      return !isE2E;
    });

    const deletedCount = initialCount - cleanedTickets.length;
    console.log(`Tickets to delete: ${deletedCount}`);
    console.log(`Remaining tickets: ${cleanedTickets.length}`);

    if (deletedCount > 0) {
      const nextVersion = (state.version || 1) + 1;
      await AppState.findOneAndUpdate(
        { _id: state._id },
        { 
          $set: { 
            'data.supportTickets': cleanedTickets,
            version: nextVersion,
            lastUpdated: new Date()
          } 
        }
      );
      console.log(`✅ Cleanup successful. Version bumped to ${nextVersion}`);
    } else {
      console.log('No E2E tickets found to delete.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

cleanupTickets();
