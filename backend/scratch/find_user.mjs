import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

async function findUser() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected.');

    const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
    if (!state || !state.data) {
      console.log('❌ No data found in AppState');
      process.exit(0);
    }

    const players = state.data.players || [];
    console.log(`📊 Total players in DB: ${players.length}`);

    const searchStr = 'Nishant';
    const foundPlayers = players.filter(p => 
      (p.name && p.name.toLowerCase().includes(searchStr.toLowerCase())) ||
      (p.id && p.id.toLowerCase().includes(searchStr.toLowerCase())) ||
      (p.username && p.username.toLowerCase().includes(searchStr.toLowerCase()))
    );

    if (foundPlayers.length > 0) {
      console.log('✅ Found players:');
      foundPlayers.forEach(p => {
        console.log(JSON.stringify(p, null, 2));
      });
    } else {
      console.log('❌ No player matching "Nishant" found.');
      console.log('📝 All Player IDs in DB:', players.map(p => p.id).join(', '));
    }

    // Also check for 'riyaplay' to verify the script is working
    const riya = players.find(p => p.id === 'riyaplay');
    if (riya) {
      console.log('✅ Verification: "riyaplay" found.');
    } else {
      console.log('⚠️ Verification: "riyaplay" NOT found.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

findUser();
