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
    // 1. Players (Preserved)
    console.log(`👤 Players: ${data.players?.length || 0} (Preserved)`);

    // 2. Tournaments (Preserved)
    console.log(`🏆 Tournaments: ${data.tournaments?.length || 0} (Preserved)`);

    // 3. Match Videos (Preserved)
    console.log(`📹 MatchVideos: ${data.matchVideos?.length || 0} (Preserved)`);

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
