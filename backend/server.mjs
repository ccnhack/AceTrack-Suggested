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

const DIAGNOSTICS_DIR = path.join(__dirname, 'diagnostics');
if (!fs.existsSync(DIAGNOSTICS_DIR)) {
  fs.mkdirSync(DIAGNOSTICS_DIR);
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
    
    // 2. DATA DUMP: Return state as-is for client-side local validation
    const sanitizedData = JSON.parse(JSON.stringify(state.data)); // Deep clone
    
    res.json({ ...sanitizedData, lastUpdated: state.lastUpdated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/status', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated');
    res.json({ lastUpdated: state?.lastUpdated || 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    const files = fs.readdirSync(DIAGNOSTICS_DIR);
    res.json({ success: true, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/diagnostics/:filename', apiKeyGuard, async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    const content = fs.readFileSync(filepath, 'utf8');
    res.json(JSON.parse(content));
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

    // 4. ATOMIC MERGE: For arrays like 'players', merge instead of overwrite to prevent data loss
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    const currentData = (state && state.data) ? state.data : {};
    
    const updateObj = { lastUpdated: Date.now() };
    for (const key of syncableKeys) {
      if (req.body[key] !== undefined) {
        if (key === 'players' && Array.isArray(req.body[key]) && Array.isArray(currentData[key])) {
          // MERGE: Keep existing players not in the updates
          const incoming = req.body[key];
          const existing = currentData[key];
          const merged = [...incoming];
          
          existing.forEach(p => {
            if (p && p.id && !incoming.some(i => i && i.id && String(i.id).toLowerCase() === String(p.id).toLowerCase())) {
              merged.push(p);
            }
          });
          updateObj[`data.${key}`] = merged;
        } else {
          updateObj[`data.${key}`] = req.body[key];
        }
      }
    }
    
    const updatedState = await AppState.findOneAndUpdate(
      {}, // any record (we only have one)
      { $set: updateObj }, 
      { upsert: true, new: true }
    );
    res.json({ success: true, lastUpdated: updatedState.lastUpdated });
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

app.post('/api/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    const { username, logs } = req.body;
    if (!username || !logs) {
      return res.status(400).json({ error: 'Missing username or logs' });
    }

    // Format IST timestamp for filename
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const timestamp = istDate.toISOString()
      .replace(/T/, '_')
      .replace(/\..+/, '')
      .replace(/:/g, '-');

    const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // 1. Rotation Logic: Keep max 3 files per user
    try {
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`))
        .sort(); // Sort by name (which has timestamp)
      
      while (userFiles.length >= 3) {
        const oldest = userFiles.shift();
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, oldest));
        console.log(`♻️ Rotated (deleted) old diagnostics: ${oldest}`);
      }
    } catch (e) {
      console.error("⚠️ Rotation error:", e);
    }

    const filename = `${safeUsername}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify({
      username,
      uploadedAt: istDate.toISOString().replace('Z', '+05:30'),
      logs
    }, null, 2));

    console.log(`📝 Diagnostics saved: ${filename}`);
    res.json({ success: true, filename });
  } catch (error) {
    console.error("❌ Diagnostics Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 AceTrack Shared Backend running on port ${PORT}`);
  console.log(`🔗 Database: Cloud MongoDB Atlas`);
});
