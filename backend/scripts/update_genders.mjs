import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { Player } from '../models/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function updateGenders() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Find Nishant and Shashank
  const players = await Player.find({
    $or: [
      { 'data.name': { $regex: /nishant/i } },
      { 'data.username': { $regex: /nishant/i } },
      { 'data.name': { $regex: /shashank/i } },
      { 'data.username': { $regex: /shashank/i } }
    ]
  });

  console.log(`Found ${players.length} matching players.`);

  for (const player of players) {
    console.log(`Found player: ${player.data.name} (id: ${player.id}) - Current gender: ${player.data.gender}`);
    player.data.gender = 'Male';
    player.markModified('data');
    await player.save();
    console.log(`Updated gender to 'Male' for ${player.data.name}.`);
  }

  // NOTE: In Phase 1 architecture, Player profiles are stored in the `players` collection.
  // Wait, I should also check if they are in the legacy `AppState` global blob just in case.
  const { AppState } = await import('../models/index.mjs');
  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  if (appState && appState.data && appState.data.players) {
    let modified = false;
    for (const p of appState.data.players) {
      if ((p.name && p.name.toLowerCase().includes('nishant')) || 
          (p.username && p.username.toLowerCase().includes('nishant')) ||
          (p.name && p.name.toLowerCase().includes('shashank')) || 
          (p.username && p.username.toLowerCase().includes('shashank'))) {
        console.log(`Found player in AppState: ${p.name} (id: ${p.id}) - Current gender: ${p.gender}`);
        p.gender = 'Male';
        modified = true;
      }
    }
    if (modified) {
      appState.markModified('data');
      await appState.save();
      console.log("Updated genders in AppState.");
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

updateGenders().catch(console.error);
