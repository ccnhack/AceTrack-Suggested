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
  storageBucket: 'acetrack-ad98e.appspot.com'
});

const bucket = admin.storage().bucket();
const UPLOADS_DIR = path.join(__dirname, 'uploads');

const MONGODB_URI = process.env.MONGODB_URI;
await mongoose.connect(MONGODB_URI);

const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

async function migrate() {
  console.log('🚀 Starting Migration to Firebase Storage...');
  
  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!state || !state.data) {
    console.error('❌ No AppState found to migrate');
    process.exit(1);
  }

  const data = state.data;
  let changed = false;

  // 1. Migrate Player Avatars
  if (data.players) {
    for (let player of data.players) {
      if (player.avatar && player.avatar.includes('/uploads/')) {
        const filename = player.avatar.split('/').pop();
        const localPath = path.join(UPLOADS_DIR, filename);
        
        if (fs.existsSync(localPath)) {
          console.log(`📸 Migrating avatar for ${player.name}: ${filename}`);
          const firebaseURL = await uploadToFirebase(localPath, filename, 'image/jpeg');
          if (firebaseURL) {
            player.avatar = firebaseURL;
            changed = true;
          }
        }
      }
    }
  }

  // 2. Migrate Match Videos
  if (data.matchVideos) {
    for (let video of data.matchVideos) {
      // Check videoUrl, previewUrl, watermarkedUrl
      const fields = ['videoUrl', 'previewUrl', 'watermarkedUrl'];
      for (let field of fields) {
        if (video[field] && video[field].includes('/uploads/')) {
          const filename = video[field].split('/').pop();
          const localPath = path.join(UPLOADS_DIR, filename);
          
          if (fs.existsSync(localPath)) {
            console.log(`📽️ Migrating ${field} for video ${video.id}: ${filename}`);
            const mimeType = filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
            const firebaseURL = await uploadToFirebase(localPath, filename, mimeType);
            if (firebaseURL) {
              video[field] = firebaseURL;
              changed = true;
            }
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
    console.log('ℹ️ No local files found to migrate.');
  }

  mongoose.disconnect();
}

async function uploadToFirebase(localPath, filename, mimeType) {
  try {
    const destination = `uploads/${filename}`;
    await bucket.upload(localPath, {
      destination: destination,
      metadata: {
        contentType: mimeType,
      }
    });
    const file = bucket.file(destination);
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${destination}`;
  } catch (error) {
    console.error(`❌ Failed to upload ${filename}:`, error.message);
    return null;
  }
}

migrate().catch(console.error);
