import admin from 'firebase-admin';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: 'acetrack-ad98e.firebasestorage.app'
});

const bucket = admin.storage().bucket();
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const MONGODB_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGODB_URI);

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema, 'appstates');

async function migrate() {
  console.log('🚀 Starting Migration to Firebase Storage...');
  
  // Debug: List buckets
  try {
    const [buckets] = await admin.storage().getBuckets();
    console.log('🪣 Available buckets:', buckets.map(b => b.name).join(', '));
  } catch (err) {
    console.error('❌ Failed to list buckets:', err.message);
  }

  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!state || !state.data) {
    const count = await AppState.countDocuments();
    console.log(`📊 Documents in [appstates]: ${count}`);
    console.error('❌ No AppState found to migrate.');
    process.exit(1);
  }
  if (!state || !state.data) {
    console.error('❌ No AppState found to migrate. Check if "AppState" collection exists in the current database.');
    process.exit(1);
  }

  const data = state.data;
  console.log(`📊 Data Summary: ${data.players?.length || 0} players, ${data.matchVideos?.length || 0} videos, ${data.tournaments?.length || 0} tournaments`);
  
  // Sample URL check
  if (data.players && data.players.length > 0) {
    console.log(`🔗 Sample player avatar: ${data.players[0].avatar}`);
  }
  if (data.matchVideos && data.matchVideos.length > 0) {
    console.log(`🔗 Sample video URL: ${data.matchVideos[0].videoUrl}`);
  }

  let changed = false;

  // 1. Migrate Player Avatars
  if (data.players) {
    for (let player of data.players) {
      if (player.avatar && player.avatar.includes('/uploads/')) {
        const url = player.avatar;
        const filename = url.split('/').pop();
        
        console.log(`📸 Migrating avatar for ${player.name}: ${filename}`);
        const firebaseURL = await migrateFromUrl(url, filename, 'image/jpeg');
        if (firebaseURL) {
          player.avatar = firebaseURL;
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
          const filename = url.split('/').pop();
          
          console.log(`📽️ Migrating ${field} for video ${video.id}: ${filename}`);
          const mimeType = filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
          const firebaseURL = await migrateFromUrl(url, filename, mimeType);
          if (firebaseURL) {
            video[field] = firebaseURL;
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
    console.log('✅ Migration Complete! Database updated with Firebase URLs.');
  } else {
    console.log('ℹ️ No files found that needed migration.');
  }

  mongoose.disconnect();
}

async function migrateFromUrl(url, filename, mimeType) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
    const buffer = await response.arrayBuffer();

    const destination = `uploads/${filename}`;
    const file = bucket.file(destination);
    
    await file.save(Buffer.from(buffer), {
      metadata: { contentType: mimeType },
      public: true
    });

    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
  } catch (error) {
    console.error(`❌ Failed to migrate ${filename}:`, error.message);
    return null;
  }
}

migrate().catch(console.error);
