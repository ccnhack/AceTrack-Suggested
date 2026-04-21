/**
 * 🏥 AceTrack Data Healing Script (v2.6.163)
 * -----------------------------------------
 * This script identifies and repairs "orphaned" local upload URLs in the database.
 * Specifically targets avatars and video links that point to the ephemeral Render
 * disk but no longer exist after a server restart.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Assuming script resides in backend/scripts/
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const BACKUP_DIR = path.join(__dirname, '..', 'backups', 'pre-healing');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env");
  process.exit(1);
}

// 1. Schema Definition (Matching server.mjs)
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema, 'appstates');

async function runHealing() {
  console.log('🚀 Starting Asset Healing Process...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('📡 Connected to MongoDB');

    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) {
      console.error('❌ No AppState found to heal.');
      process.exit(1);
    }

    const data = state.data;
    let healCount = 0;
    let totalPlayers = data.players?.length || 0;
    let totalVideos = data.matchVideos?.length || 0;

    console.log(`📊 Scanning ${totalPlayers} players and ${totalVideos} videos...`);

    // 💾 Pre-Healing Backup
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `pre-heal-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(state, null, 2));
    console.log(`💾 Safety backup created at: ${backupPath}`);

    // 2. Heal Player Avatars
    if (data.players) {
      for (let player of data.players) {
        if (player.avatar && player.avatar.includes('/uploads/')) {
          // Extract filename from URL (e.g., https://host.com/uploads/file.jpg -> file.jpg)
          const filename = player.avatar.split('/').pop();
          const filePath = path.join(UPLOADS_DIR, filename);

          if (!fs.existsSync(filePath)) {
            console.log(`🩹 HEALING: Avatar for ${player.name} (${player.id}) is orphaned. Resetting to null.`);
            player.avatar = null;
            healCount++;
          }
        }
      }
    }

    // 3. Heal Match Videos
    if (data.matchVideos) {
      for (let video of data.matchVideos) {
        const fields = ['videoUrl', 'previewUrl', 'watermarkedUrl'];
        for (let field of fields) {
          if (video[field] && video[field].includes('/uploads/')) {
            const filename = video[field].split('/').pop();
            const filePath = path.join(UPLOADS_DIR, filename);

            if (!fs.existsSync(filePath)) {
              console.log(`🩹 HEALING: ${field} for video ${video.id} is orphaned. Resetting to null.`);
              video[field] = null;
              healCount++;
            }
          }
        }
      }
    }

    // 4. Save Changes
    if (healCount > 0) {
      state.version = (state.version || 0) + 1;
      state.lastUpdated = new Date();
      state.markModified('data');
      
      await state.save();
      console.log(`✅ Healing Complete! ${healCount} orphaned links resolved.`);
      console.log(`📈 New AppState Version: ${state.version}`);
    } else {
      console.log('ℹ️ No orphaned assets found. Everything is healthy.');
    }

  } catch (error) {
    console.error('❌ Healing Process Failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🏁 Disconnected from MongoDB');
    process.exit(0);
  }
}

runHealing();
