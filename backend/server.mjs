import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3005;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env! Please add it to stay permanent.");
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

// Schema for the entire app state (Atomic Dump)
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

// Constants and Security
const ACE_API_KEY = process.env.ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';
if (!process.env.ACE_API_KEY) {
  console.warn("⚠️ ACE_API_KEY is using a hardcoded fallback. Set it in .env for production.");
}

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: '500mb' }));

// 1. API Key Guard
const apiKeyGuard = (req, res, next) => {
  const providedKey = req.headers['x-ace-api-key'];
  if (providedKey !== ACE_API_KEY) {
    console.warn(`🛑 Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};

app.use((req, res, next) => {
  res.setHeader('Accept-Ranges', 'bytes');
  next();
});

app.use('/uploads', express.static(UPLOADS_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4') || filePath.endsWith('.mov') || filePath.endsWith('.webm')) {
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'video/mp4');
    }
  }
}));

const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storageConfig });

// Routes
app.get('/api/data', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.json({});
    
    // 2. DATA SANITIZATION: Remove passwords before sending to client
    const sanitizedData = JSON.parse(JSON.stringify(state.data)); // Deep clone
    if (sanitizedData.players && Array.isArray(sanitizedData.players)) {
      sanitizedData.players = sanitizedData.players.map(p => {
        const { password, ...safePlayer } = p;
        return safePlayer;
      });
    }
    
    res.json(sanitizedData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/save', apiKeyGuard, async (req, res) => {
  try {
    // 3. BASIC VALIDATION: Ensure payload has correct structure and syncable keys
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser'];
    const hasSyncableKey = Object.keys(req.body).some(key => syncableKeys.includes(key));
    
    if (!req.body || typeof req.body !== 'object' || !hasSyncableKey) {
      return res.status(400).json({ error: 'Invalid payload: No syncable context found' });
    }

    // 4. ATOMIC MERGE: Move to item-level merging for arrays (tournaments, players)
    // This prevents one user's registration from overwriting another user's status update.
    const currentState = await AppState.findOne({});
    let updateOps = { lastUpdated: Date.now() };
    
    Object.keys(req.body).forEach(key => {
      if (!syncableKeys.includes(key)) return;
      
      const incomingValue = req.body[key];
      const existingValue = (currentState && currentState.data) ? currentState.data.get(key) : null;

      if (Array.isArray(incomingValue) && Array.isArray(existingValue)) {
        // Merge Array items by ID
        const mergedArray = [...existingValue];
        incomingValue.forEach(incomingItem => {
          if (!incomingItem || !incomingItem.id) return;
          const idx = mergedArray.findIndex(item => item && item.id === incomingItem.id);
          if (idx > -1) {
            mergedArray[idx] = { ...mergedArray[idx], ...incomingItem };
          } else {
            mergedArray.push(incomingItem);
          }
        });
        updateOps[`data.${key}`] = mergedArray;
      } else {
        // Standard set for objects/primitives
        updateOps[`data.${key}`] = incomingValue;
      }
    });

    await AppState.findOneAndUpdate(
      {}, 
      { $set: updateOps },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', apiKeyGuard, upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: fileUrl, filename: req.file.filename });
});

app.listen(PORT, () => {
  console.log(`🚀 AceTrack Shared Backend running on port ${PORT}`);
  console.log(`🔗 Database: Cloud MongoDB Atlas`);
});
