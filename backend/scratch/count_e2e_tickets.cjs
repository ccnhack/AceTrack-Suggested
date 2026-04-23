const mongoose = require('mongoose');
const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now }
});

const AppState = mongoose.model('AppState', AppStateSchema);

async function checkTickets() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data || !state.data.supportTickets) {
      console.log('No tickets found in database.');
      return;
    }

    const tickets = state.data.supportTickets;
    console.log(`Total support tickets in database: ${tickets.length}`);

    const testUserIds = ['testindividual', 'testingacademy', 'testingcoach', 'saboteur', 'guest_test', 'testindividual2', 'testindividual3'];
    
    const e2eTickets = tickets.filter(t => {
      const title = String(t.title || '').toLowerCase();
      const desc = String(t.description || '').toLowerCase();
      const userId = String(t.userId || '').toLowerCase();
      
      return title.includes('e2e') || 
             title.includes('detox') || 
             title.includes('automated test') ||
             desc.includes('e2e') || 
             desc.includes('detox') || 
             desc.includes('automated test') ||
             testUserIds.includes(userId) ||
             userId.includes('test');
    });

    console.log(`Count of E2E Automated Test Tickets: ${e2eTickets.length}`);
    
    if (e2eTickets.length > 0) {
      console.log('\nSample E2E Tickets:');
      e2eTickets.slice(0, 5).forEach(t => {
        console.log(`- ID: ${t.id}, Title: ${t.title}, User: ${t.userId}, Created: ${t.createdAt || t.timestamp}`);
      });
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
  }
}

checkTickets();
