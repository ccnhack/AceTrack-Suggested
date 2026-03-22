import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
  logServerEvent('WS_CLIENT_CONNECTED', { socketId: socket.id });
  
  socket.on('admin_pull_diagnostics', (data) => {
    logServerEvent('ADMIN_PULL_DIAGNOSTICS_REQUESTED', data);
    // Broadcast to ALL clients. The client will check targetUserId matching itself.
    io.emit('force_upload_diagnostics', data);
  });

  socket.on('admin_ping_device', (data) => {
    logServerEvent('ADMIN_PING_DEVICE', { targetUserId: data.targetUserId, fromSocket: socket.id });
    // Relay ping to all clients to see if the target is online
    io.emit('admin_ping_device_relay', data);
  });

  socket.on('device_pong', (data) => {
    logServerEvent('DEVICE_PONG_RECEIVED', { targetUserId: data.targetUserId, deviceId: data.deviceId, deviceName: data.deviceName, fromSocket: socket.id });
    // Relay pong back to the admin hub
    io.emit('device_pong_relay', data);
  });

  socket.on('disconnect', () => {
    logServerEvent('WS_CLIENT_DISCONNECTED', { socketId: socket.id });
  });
});

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

// Helper for Server-Side Diagnostics
const logServerEvent = (action, details = {}) => {
  try {
    const logFile = path.join(DIAGNOSTICS_DIR, 'server_events.json');
    let logs = [];
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      logs = JSON.parse(content || '[]');
    }
    const newEntry = {
      timestamp: new Date().toISOString(),
      action,
      ...details
    };
    logs.unshift(newEntry);
    fs.writeFileSync(logFile, JSON.stringify(logs.slice(0, 1000), null, 2));
    console.log(`📡 [Server Log] ${action}:`, details);
  } catch (e) {
    console.error("❌ Failed to write server log:", e.message);
  }
};

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
    res.json({ 
      lastUpdated: state?.lastUpdated || 0,
      latestAppVersion: process.env.LATEST_APP_VERSION || '1.0.43'
    });
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

    // 4. ATOMIC MERGE: Merge arrays instead of overwriting to prevent data loss
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    const currentData = (state && state.data) ? state.data : {};
    
    // 4.5 TOTAL OVERWRITE: If client explicitly requests a clean wipe/replace
    if (req.body.overwrite === true) {
      console.log("⚠️ [Server] ATOMIC OVERWRITE REQUESTED. Replacing all data.");
      const cleanData = {};
      for (const key of syncableKeys) {
        if (req.body[key] !== undefined) {
          cleanData[key] = req.body[key];
        } else if (currentData[key]) {
          cleanData[key] = currentData[key];
        }
      }
      
      const newState = new AppState({ data: cleanData, lastUpdated: Date.now() });
      await newState.save();
      return res.json({ success: true, message: 'Database overwritten successfully', lastUpdated: newState.lastUpdated });
    }
    
    const updateObj = { lastUpdated: Date.now() };
    for (const key of syncableKeys) {
      const incoming = req.body[key];
      const existing = currentData[key];
      
      if (incoming !== undefined) {
        if (Array.isArray(incoming) && Array.isArray(existing)) {
          // MERGE Strategy: Start with the new incoming data
          const merged = [...incoming];
          
          // Add existing items ONLY if they are NOT in the incoming list (by ID)
          existing.forEach(oldItem => {
            if (oldItem && oldItem.id) {
              const isUpdated = incoming.some(newItem => 
                newItem && newItem.id && String(newItem.id).toLowerCase() === String(oldItem.id).toLowerCase()
              );
              if (!isUpdated) {
                merged.push(oldItem);
              }
            }
          });
          updateObj[`data.${key}`] = merged;

          if (key === 'players') {
            const sample = merged.find(p => p.avatar && p.avatar.includes('/uploads/'));
            logServerEvent('ARRAY_MERGE', { key, count: merged.length, sampleAvatar: sample?.avatar });
          }
        } else if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
          // Deep merge for nested objects like chatbotMessages or currentUser
          for (const subKey in incoming) {
            updateObj[`data.${key}.${subKey}`] = incoming[subKey];
            if (key === 'currentUser' && subKey === 'avatar') {
              logServerEvent('PROFILE_URL_UPDATE', { url: incoming[subKey] });
            }
          }
        } else {
          // Simple overwrite for non-objects (strings, numbers, arrays)
          updateObj[`data.${key}`] = incoming;
        }
      }
    }
    
    const updatedState = await AppState.findOneAndUpdate(
      {}, // any record (we only have one)
      { $set: updateObj }, 
      { upsert: true, new: true }
    );

    // 📢 WEBSOCKET EMIT: Notify ALL clients that data has changed instantly
    io.emit('data_updated', { 
      lastUpdated: updatedState.lastUpdated,
      keys: Object.keys(req.body) 
    });

    logServerEvent('DATA_SAVE_SUCCESS', { lastUpdated: updatedState.lastUpdated });
    res.json({ success: true, lastUpdated: updatedState.lastUpdated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/upload', apiKeyGuard, upload.single('video'), (req, res) => {
  if (!req.file) {
    logServerEvent('UPLOAD_FAILED', { error: 'No file received' });
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  logServerEvent('UPLOAD_SUCCESS', { filename: req.file.filename, url: fileUrl });
  res.json({ url: fileUrl, filename: req.file.filename });
});

app.post('/api/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    const { username, logs, prefix, deviceId } = req.body;
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
    // 1. Rotation Logic: Keep max 5 files per user
    try {
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`))
        .sort(); // Sort by name (which has timestamp)
      
      if (userFiles.length >= 5) {
        const oldest = userFiles.shift();
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, oldest));
        console.log(`♻️ Rotated (deleted) old diagnostics: ${oldest}`);
      }
    } catch (e) {
      console.error("⚠️ Rotation error:", e);
    }

    const filePrefix = prefix === 'admin_requested' ? 'admin_requested_' : '';
    const safeDeviceId = deviceId ? `_${deviceId.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${filePrefix}${safeUsername}${safeDeviceId}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    fs.writeFileSync(filepath, JSON.stringify({
      username,
      deviceId: deviceId || 'Unknown Device',
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

// Serve Web Admin Dashboard
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  // SPA Fallback mapping
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    } else {
      next();
    }
  });
}

httpServer.listen(PORT, () => {
  console.log(`🚀 AceTrack Shared Backend running on port ${PORT}`);
  console.log(`📡 WebSocket: Active`);
  console.log(`🔗 Database: Cloud MongoDB Atlas`);
});
