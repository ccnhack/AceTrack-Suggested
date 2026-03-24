import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI not found!");
  process.exit(1);
}

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

const USERS_TO_KEEP = ['shashank', 'pranshu', 'coach_1', 'male', 'academy', 'riyaplay'];

async function cleanup() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) {
      console.log("🛑 No state found to cleanup.");
      process.exit(0);
    }

    const data = state.data;
    const oldPlayerCount = data.players?.length || 0;

    // 1. Filter Players
    data.players = (data.players || []).filter(p => 
      USERS_TO_KEEP.includes(String(p.id).toLowerCase())
    );
    console.log(`👤 Players: ${oldPlayerCount} -> ${data.players.length}`);

    // 2. Filter Tournaments (only keep those created by remaining users)
    const oldTCount = data.tournaments?.length || 0;
    data.tournaments = (data.tournaments || []).filter(t => 
      USERS_TO_KEEP.includes(String(t.creatorId).toLowerCase())
    );
    console.log(`🏆 Tournaments: ${oldTCount} -> ${data.tournaments.length}`);

    // 3. Filter Match Videos
    const oldVCount = data.matchVideos?.length || 0;
    data.matchVideos = (data.matchVideos || []).filter(v => 
      USERS_TO_KEEP.includes(String(v.userId).toLowerCase())
    );
    console.log(`📹 MatchVideos: ${oldVCount} -> ${data.matchVideos.length}`);

    // 4. Update atomic timestamp
    const newState = new AppState({
      data,
      lastUpdated: Date.now()
    });

    await newState.save();
    console.log("🚀 Database cleanup complete! New state saved.");

    await mongoose.disconnect();
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  }
}

cleanup();
