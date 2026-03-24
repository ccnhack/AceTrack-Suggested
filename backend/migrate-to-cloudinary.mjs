import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const MONGODB_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGODB_URI);

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema, 'appstates');

async function migrate() {
  console.log('🚀 Starting Migration to Cloudinary...');
  
  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!state || !state.data) {
    console.error('❌ No AppState found to migrate.');
    process.exit(1);
  }

  const data = state.data;
  console.log(`📊 Data Summary: ${data.players?.length || 0} players, ${data.matchVideos?.length || 0} videos`);
  
  let changed = false;

  // 1. Migrate Player Avatars
  if (data.players) {
    for (let player of data.players) {
      if (player.avatar && player.avatar.includes('/uploads/')) {
        const url = player.avatar;
        console.log(`📸 Migrating avatar for ${player.name}...`);
        const cloudURL = await migrateFile(url, 'avatars');
        if (cloudURL) {
          player.avatar = cloudURL;
          changed = true;
        }
      }
    }
  }

  // 2. Migrate Match Videos
  if (data.matchVideos) {
    for (let video of data.matchVideos) {
      const fields = ['videoUrl', 'previewUrl', 'watermarkedUrl'];
      for (let field of fields) {
        if (video[field] && video[field].includes('/uploads/')) {
          const url = video[field];
          console.log(`📽️ Migrating ${field} for video ${video.id}...`);
          const cloudURL = await migrateFile(url, 'videos');
          if (cloudURL) {
            video[field] = cloudURL;
            changed = true;
          }
        }
      }
    }
  }

  if (changed) {
    state.lastUpdated = new Date();
    state.markModified('data');
    await state.save();
    console.log('✅ Migration Complete! Database updated with Cloudinary URLs.');
  } else {
    console.log('ℹ️ No files found that needed migration.');
  }

  mongoose.disconnect();
}

async function migrateFile(url, folder) {
  try {
    const result = await cloudinary.uploader.upload(url, {
      folder: `acetrack/${folder}`,
      resource_type: 'auto'
    });
    return result.secure_url;
  } catch (error) {
    console.error(`❌ Failed to migrate ${url}:`, error.message);
    return null;
  }
}

migrate().catch(console.error);
