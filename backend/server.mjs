import express from 'express';
import { v2 as cloudinary } from 'cloudinary';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import admin from 'firebase-admin';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════
// ☁️ Cloudinary Configuration
// ═══════════════════════════════════════════════════════════════
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
console.log('☁️ Cloudinary initialized');

// ═══════════════════════════════════════════════════════════════
// 🔥 FIREBASE: Initialize Admin SDK (SEC Fix #1)
// ═══════════════════════════════════════════════════════════════
const serviceAccountPath = path.join(__dirname, 'firebase-service-account.json');
try {
  let serviceAccount;
  if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      storageBucket: 'acetrack-ad98e.firebasestorage.app'
    });
    console.log('🔥 Firebase Admin initialized');
  } else {
    console.warn('⚠️ Firebase Admin NOT initialized: No service account found');
  }
} catch (error) {
  console.error('❌ Failed to initialize Firebase Admin:', error.message);
}

const APP_VERSION = '2.0.0'; // AceTrack Suggested — Expert Panel Enhanced

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: CORS Whitelist (SEC Fix #3)
// ═══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://acetrack-suggested.onrender.com',
  'https://acetrack-suggested.onrender.com',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3005'
];

const app = express();
app.set('trust proxy', true);

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Helmet for HTTP headers (SEC)
// ═══════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for SPA compatibility
  crossOriginEmbedderPolicy: false
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: CORS with whitelist (SEC Fix #3)
// ═══════════════════════════════════════════════════════════════
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Request body size limit (SEC Fix — 5MB max)
// ═══════════════════════════════════════════════════════════════
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: MongoDB injection prevention (SEC Fix #5)
// Express 5 Compatibility: Redefine req.query as writable
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (req.query) {
    Object.defineProperty(req, 'query', {
      value: { ...req.query },
      writable: true,
      enumerable: true,
      configurable: true
    });
  }
  next();
});
app.use(mongoSanitize());

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: HTTPS enforcement (SEC Fix #9)
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, 'https://' + req.hostname + req.url);
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Rate Limiting (SEC Fix #4)
// ═══════════════════════════════════════════════════════════════
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: 'Too many attempts. Please wait before trying again.' }
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many OTP attempts. Account temporarily locked.' }
});

app.use('/api/', globalLimiter);

// ═══════════════════════════════════════════════════════════════
// WebSocket Setup
// ═══════════════════════════════════════════════════════════════
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  logServerEvent('WS_CLIENT_CONNECTED', { socketId: socket.id });
  
  socket.on('admin_pull_diagnostics', (data) => {
    logServerEvent('ADMIN_PULL_DIAGNOSTICS_REQUESTED', data);
    io.emit('force_upload_diagnostics', data);
  });

  socket.on('admin_ping_device', (data) => {
    logServerEvent('ADMIN_PING_DEVICE', { targetUserId: data.targetUserId, fromSocket: socket.id });
    io.emit('admin_ping_device_relay', data);
  });

  socket.on('device_pong', (data) => {
    logServerEvent('DEVICE_PONG_RECEIVED', { targetUserId: data.targetUserId, deviceId: data.deviceId, deviceName: data.deviceName, fromSocket: socket.id });
    io.emit('device_pong_relay', data);
  });

  // Support chat relay events
  socket.on('typing_start', (data) => io.emit('typing_start', data));
  socket.on('typing_stop', (data) => io.emit('typing_stop', data));

  socket.on('disconnect', () => {
    logServerEvent('WS_CLIENT_DISCONNECTED', { socketId: socket.id });
  });
});

// ═══════════════════════════════════════════════════════════════
// Directories & DB
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3005;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIAGNOSTICS_DIR = path.join(__dirname, 'diagnostics');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DIAGNOSTICS_DIR)) fs.mkdirSync(DIAGNOSTICS_DIR);

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not defined in .env!");
} else {
  mongoose.connect(MONGODB_URI)
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

// ═══════════════════════════════════════════════════════════════
// 📊 Schemas (SE Fix: Database indexing)
// ═══════════════════════════════════════════════════════════════
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

// ═══════════════════════════════════════════════════════════════
// 📋 AUDIT LOG (SEC Fix #7 — Immutable audit trail)
// ═══════════════════════════════════════════════════════════════
const AuditLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  action: { type: String, required: true },
  changedCollections: [String],
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true }
});
AuditLogSchema.index({ timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ═══════════════════════════════════════════════════════════════
// 🔑 Firebase Auth Scaffolding (SEC Fix #1 — STUB)
// ═══════════════════════════════════════════════════════════════
// TODO: Replace with actual Firebase Admin SDK when credentials are available
// import admin from 'firebase-admin';
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
//
// const verifyFirebaseToken = async (req, res, next) => {
//   const idToken = req.headers.authorization?.split('Bearer ')[1];
//   if (!idToken) return res.status(401).json({ error: 'Missing auth token' });
//   try {
//     const decoded = await admin.auth().verifyIdToken(idToken);
//     req.user = decoded;
//     next();
//   } catch (e) {
//     return res.status(401).json({ error: 'Invalid or expired token' });
//   }
// };

// ═══════════════════════════════════════════════════════════════
// Security & Middleware
// ═══════════════════════════════════════════════════════════════
const ACE_API_KEY = process.env.ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';

const apiKeyGuard = (req, res, next) => {
  const providedKey = req.headers['x-ace-api-key'];
  if (providedKey !== ACE_API_KEY) {
    logAudit(req, 'UNAUTHORIZED_ACCESS', [], { ip: req.ip });
    console.warn(`🛑 Unauthorized access attempt from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized: Invalid or missing API Key' });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════
// 📋 Zod Validation Schemas (SE/SEC Fix #5)
// ═══════════════════════════════════════════════════════════════
const DiagnosticsSchema = z.object({
  username: z.string().min(1).max(100),
  logs: z.any(),
  prefix: z.string().optional(),
  deviceId: z.string().max(200).optional()
});

const AutoFlushSchema = z.object({
  username: z.string().min(1).max(100),
  deviceId: z.string().max(200).optional(),
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.string(),
    type: z.string(),
    message: z.string()
  })).min(1)
});

const SaveDataSchema = z.object({
  players: z.array(z.any()).optional(),
  tournaments: z.array(z.any()).optional(),
  matchVideos: z.array(z.any()).optional(),
  matches: z.array(z.any()).optional(),
  supportTickets: z.array(z.any()).optional(),
  evaluations: z.array(z.any()).optional(),
  auditLogs: z.array(z.any()).optional(),
  chatbotMessages: z.any().optional(),
  currentUser: z.any().optional(),
  overwrite: z.boolean().optional()
}).refine(data => {
  const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser'];
  return Object.keys(data).some(key => syncableKeys.includes(key));
}, { message: 'No syncable context found' });

// Validation middleware factory
const validate = (schema) => (req, res, next) => {
  try {
    schema.parse(req.body);
    next();
  } catch (e) {
    return res.status(400).json({ error: 'Validation failed', details: e.errors?.map(err => err.message) || [e.message] });
  }
};

// ═══════════════════════════════════════════════════════════════
// 🔑 OTP Hashing Utilities (SEC Fix #6)
// ═══════════════════════════════════════════════════════════════
export const hashOtp = async (otp) => {
  return bcrypt.hash(String(otp), 10);
};

export const compareOtp = async (plainOtp, hashedOtp) => {
  return bcrypt.compare(String(plainOtp), hashedOtp);
};

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════
const logServerEvent = (action, details = {}) => {
  try {
    const logFile = path.join(DIAGNOSTICS_DIR, 'server_events.json');
    let logs = [];
    if (fs.existsSync(logFile)) {
      const content = fs.readFileSync(logFile, 'utf8');
      logs = JSON.parse(content || '[]');
    }
    logs.unshift({ timestamp: new Date().toISOString(), action, ...details });
    fs.writeFileSync(logFile, JSON.stringify(logs.slice(0, 1000), null, 2));
    console.log(`📡 [Server Log] ${action}:`, details);
  } catch (e) {
    console.error("❌ Failed to write server log:", e.message);
  }
};

const logAudit = async (req, action, changedCollections = [], details = {}) => {
  try {
    await AuditLog.create({
      userId: req.headers['x-user-id'] || req.ip,
      action,
      changedCollections,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details
    });
  } catch (e) {
    console.error("❌ Audit log error:", e.message);
  }
};

// Static file serving
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

const storageConfig = multer.memoryStorage();
const upload = multer({ 
  storage: storageConfig,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max upload
});

// ═══════════════════════════════════════════════════════════════
// 🌐 API v1 Routes (SE Fix: API versioning)
// ═══════════════════════════════════════════════════════════════
const router = express.Router();

// GET /api/v1/data
router.get('/data', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.json({});
    const sanitizedData = JSON.parse(JSON.stringify(state.data));
    res.json({ ...sanitizedData, lastUpdated: state.lastUpdated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/status
router.get('/status', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated');
    res.json({ 
      lastUpdated: state?.lastUpdated || 0,
      latestAppVersion: process.env.LATEST_APP_VERSION || APP_VERSION
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics
router.get('/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    let cloudFiles = [];
    try {
      // Fetch raw files from the 'acetrack/diagnostics' folder
      const result = await cloudinary.search
        .expression('folder:acetrack/diagnostics/*')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute();
        
      cloudFiles = result.resources.map(file => {
        const parts = file.public_id.split('/');
        return parts[parts.length - 1];
      });
    } catch (e) {
      console.warn('Cloudinary search failed, fetching only local files:', e.message);
    }
    
    let localFiles = [];
    try {
      if (fs.existsSync(DIAGNOSTICS_DIR)) {
        localFiles = fs.readdirSync(DIAGNOSTICS_DIR);
      }
    } catch (e) {
      console.warn('Local read failed:', e.message);
    }
    
    // Combine and deduplicate
    const allFiles = [...new Set([...cloudFiles, ...localFiles])];
    res.json({ success: true, files: allFiles });
  } catch (error) {
    console.error('Diagnostics Fetch Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics/:filename
router.get('/diagnostics/:filename', apiKeyGuard, async (req, res) => {
  try {
    const { filename } = req.params;
    
    // 1. Check Cloudinary First
    try {
      const publicId = `acetrack/diagnostics/${filename}`;
      const fileUrl = cloudinary.url(publicId, { resource_type: 'raw', secure: true });
      // Fetch using global node fetch
      const cloudRes = await fetch(fileUrl);
      if (cloudRes.ok) {
        const data = await cloudRes.json();
        return res.json(data);
      }
    } catch (cloudErr) {
      console.log(`Cloudinary fetch failed for ${filename}, trying local fallback.`);
    }

    // 2. Fallback to Local Disk
    const filepath = path.join(DIAGNOSTICS_DIR, filename);
    if (fs.existsSync(filepath)) {
      const data = fs.readFileSync(filepath, 'utf8');
      return res.json(JSON.parse(data));
    }

    res.status(404).json({ error: 'File not found in cloud or local storage' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/save
router.post('/save', apiKeyGuard, validate(SaveDataSchema), async (req, res) => {
  try {
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser'];
    
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    const currentData = (state && state.data) ? state.data : {};
    
    // Audit log
    const changedKeys = Object.keys(req.body).filter(k => syncableKeys.includes(k));
    logAudit(req, 'DATA_SAVE', changedKeys, { overwrite: !!req.body.overwrite });
    
    if (req.body.overwrite === true) {
      console.log("⚠️ [Server] ATOMIC OVERWRITE REQUESTED.");
      const cleanData = {};
      for (const key of syncableKeys) {
        cleanData[key] = req.body[key] !== undefined ? req.body[key] : (currentData[key] || undefined);
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
          const merged = [...incoming];
          existing.forEach(oldItem => {
            if (oldItem && oldItem.id) {
              const isUpdated = incoming.some(newItem => 
                newItem && newItem.id && String(newItem.id).toLowerCase() === String(oldItem.id).toLowerCase()
              );
              if (!isUpdated) merged.push(oldItem);
            }
          });
          updateObj[`data.${key}`] = merged;
        } else if (incoming && typeof incoming === 'object' && !Array.isArray(incoming)) {
          for (const subKey in incoming) {
            updateObj[`data.${key}.${subKey}`] = incoming[subKey];
          }
        } else {
          updateObj[`data.${key}`] = incoming;
        }
      }
    }
    
    const updatedState = await AppState.findOneAndUpdate(
      {}, { $set: updateObj }, { upsert: true, new: true }
    );

    io.emit('data_updated', { lastUpdated: updatedState.lastUpdated, keys: Object.keys(req.body) });
    logServerEvent('DATA_SAVE_SUCCESS', { lastUpdated: updatedState.lastUpdated });
    res.json({ success: true, lastUpdated: updatedState.lastUpdated });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/upload
router.post('/upload', apiKeyGuard, upload.single('video'), async (req, res) => {
  if (!req.file) {
    logServerEvent('UPLOAD_FAILED', { error: 'No file received' });
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    // Stream upload to Cloudinary
    // Determine folder based on mimetype
    let uploadFolder = 'acetrack';
    if (req.file.mimetype.startsWith('video/')) uploadFolder = 'acetrack/videos';
    else if (req.file.mimetype.startsWith('image/')) uploadFolder = 'acetrack/images';
    else uploadFolder = 'acetrack/others';

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
      },
      (error, result) => {
        if (error) {
          console.error("❌ Cloudinary Upload Error:", error);
          logServerEvent('UPLOAD_FAILED_CLOUDINARY', { error: error.message });
          return res.status(500).json({ error: "Failed to upload to cloud" });
        }
        
        logAudit(req, 'FILE_UPLOAD_CLOUDINARY', [], { url: result.secure_url, size: req.file.size });
        logServerEvent('UPLOAD_SUCCESS_CLOUDINARY', { url: result.secure_url });
        
        res.json({ url: result.secure_url });
      }
    );

    stream.end(req.file.buffer);
  } catch (error) {
    console.error('Upload Process Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics
router.get('/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    // Fetch raw files from the 'acetrack/diagnostics' folder
    const result = await cloudinary.search
      .expression('folder:acetrack/diagnostics/*')
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();
      
    // Map to just the filenames to match the old frontend expectation
    const files = result.resources.map(file => {
      // Return just the filename part, with extension
      const parts = file.public_id.split('/');
      return parts[parts.length - 1] + '.' + file.format;
    });
    
    res.json({ success: true, files });
  } catch (error) {
    console.error('Cloudinary Diagnostics Fetch Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics/:filename
router.get('/diagnostics/:filename', apiKeyGuard, async (req, res) => {
  try {
    const { filename } = req.params;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);
    if (!fs.existsSync(filepath)) return res.status(404).json({ error: 'File not found' });
    const content = fs.readFileSync(filepath, 'utf8');
    res.json(JSON.parse(content));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/diagnostics
router.post('/diagnostics', apiKeyGuard, validate(DiagnosticsSchema), async (req, res) => {
  try {
    const { username, logs, prefix, deviceId } = req.body;
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const timestamp = istDate.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // Rotation: Keep max 5 files per user
    try {
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`))
        .sort();
      if (userFiles.length >= 5) {
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, userFiles.shift()));
      }
    } catch (e) { /* silent */ }

    const filePrefix = prefix === 'admin_requested' ? 'admin_requested_' : '';
    const safeDeviceId = deviceId ? `_${deviceId.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${filePrefix}${safeUsername}${safeDeviceId}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    const reportData = {
      username,
      deviceId: deviceId || 'Unknown Device',
      uploadedAt: istDate.toISOString().replace('Z', '+05:30'),
      logs
    };

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));

    // ☁️ Persistence Fix: Upload to Cloudinary
    console.log(`☁️ [Cloudinary] Starting upload for: ${filename} (Size: ${fs.statSync(filepath).size} bytes)`);
    try {
      const cloudResult = await cloudinary.uploader.upload(filepath, {
        folder: 'acetrack/diagnostics',
        resource_type: 'raw',
        public_id: filename,
        use_filename: true,
        unique_filename: false
      });
      console.log(`✅ [Cloudinary] Upload Success: ${cloudResult.secure_url} (ID: ${cloudResult.public_id})`);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_SUCCESS', { 
        url: cloudResult.secure_url,
        public_id: cloudResult.public_id,
        filename: filename
      });
      logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
    } catch (err) {
      console.error('❌ [Cloudinary] Diagnostics Backup Failed:', err.message);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_ERROR', { 
        error: err.message, 
        filename,
        stack: err.stack 
      });
      logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
    }

    res.json({ success: true, filename });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/diagnostics/auto-flush
router.post('/diagnostics/auto-flush', apiKeyGuard, validate(AutoFlushSchema), async (req, res) => {
  try {
    const { username, deviceId, logs } = req.body;
    const safeUser = String(username || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
    const safeDevice = String(deviceId || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
    const timestamp = Date.now();
    const filename = `${safeUser}_${safeDevice}_${timestamp}.log`;
    
    const filePath = path.join(DIAGNOSTICS_DIR, filename);
    const logContent = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()} [${l.type}]: ${l.message}`).join('\n');
    fs.writeFileSync(filePath, logContent);

    // ☁️ Persistence Fix: Upload to Cloudinary
    console.log(`☁️ [Cloudinary Auto-Flush] Starting upload for: ${filename} (Size: ${fs.statSync(filePath).size} bytes)`);
    try {
      const cloudResult = await cloudinary.uploader.upload(filePath, {
        folder: 'acetrack/diagnostics/auto-flush',
        resource_type: 'raw',
        public_id: filename,
        use_filename: true,
        unique_filename: false
      });
      console.log(`✅ [Cloudinary Auto-Flush] Success: ${cloudResult.secure_url}`);
      logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_SUCCESS', { 
        url: cloudResult.secure_url,
        filename: filename
      });
      logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
    } catch (err) {
      console.error('❌ [Cloudinary Auto-Flush] Backup Failed:', err.message);
      logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_ERROR', { 
        error: err.message, 
        filename,
        stack: err.stack
      });
      logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
    }

    // Retention: Keep 3 newest
    const allFiles = fs.readdirSync(DIAGNOSTICS_DIR);
    const userFiles = allFiles
      .filter(f => f.startsWith(`${safeUser}_${safeDevice}_`) && f.endsWith('.log'))
      .sort((a, b) => {
        const timeA = parseInt(a.split('_').pop().replace('.log', '')) || 0;
        const timeB = parseInt(b.split('_').pop().replace('.log', '')) || 0;
        return timeB - timeA;
      });

    if (userFiles.length > 3) {
      userFiles.slice(3).forEach(f => {
        try { fs.unlinkSync(path.join(DIAGNOSTICS_DIR, f)); } catch(e) {}
      });
    }

    res.json({ success: true, count: logs.length, retained: 3 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/audit-logs (Admin only)
router.get('/audit-logs', apiKeyGuard, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
    res.json({ success: true, logs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Mount API v1 + backward-compatible un-versioned routes
// ═══════════════════════════════════════════════════════════════
app.use('/api', router);

// Backward compatibility: also mount at /api/ for older clients
app.use('/api', router);

// ═══════════════════════════════════════════════════════════════
// 🌐 Public Tournament Results (OWNER Fix: public URL)
// ═══════════════════════════════════════════════════════════════
app.get('/results/:tournamentId', async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.status(404).send('No data');
    const tournament = (state.data.tournaments || []).find(t => t.id === req.params.tournamentId);
    if (!tournament) return res.status(404).send('Tournament not found');
    
    const matches = (state.data.matches || []).filter(m => m.tournamentId === tournament.id);
    const players = (state.data.players || []).filter(p => 
      (tournament.registeredPlayerIds || []).includes(p.id)
    );
    
    // Simple HTML result page
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${tournament.title} - Results | AceTrack</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #0F172A; color: #E2E8F0; }
  h1 { color: #3B82F6; } h2 { color: #94A3B8; }
  .match { background: #1E293B; padding: 16px; border-radius: 12px; margin: 8px 0; }
  .player { color: #F8FAFC; font-weight: 700; }
  .score { color: #3B82F6; font-size: 1.2em; font-weight: 900; }
  .meta { color: #64748B; font-size: 0.85em; }
  ${tournament.sponsorName ? '.sponsor { text-align: center; color: #94A3B8; margin-top: 40px; font-size: 0.8em; }' : ''}
</style>
</head><body>
<h1>🏆 ${tournament.title}</h1>
<h2>${tournament.sport} • ${tournament.date} • ${tournament.location || ''}</h2>
<p class="meta">${players.length} players • ${matches.length} matches</p>
${matches.map(m => {
  const p1 = players.find(p => p.id === m.player1Id);
  const p2 = players.find(p => p.id === m.player2Id);
  const sets = m.sets ? m.sets.map(s => `${s.score1}-${s.score2}`).join(', ') : `${m.score1 || 0}-${m.score2 || 0}`;
  return `<div class="match">
    <span class="player">${p1?.name || m.player1Id}</span> vs <span class="player">${p2?.name || m.player2Id}</span>
    <span class="score" style="float:right">${sets}</span>
    ${m.round ? `<div class="meta">Round ${m.round}</div>` : ''}
  </div>`;
}).join('')}
${tournament.sponsorName ? `<div class="sponsor">Sponsored by ${tournament.sponsorName}</div>` : ''}
<p class="meta" style="text-align:center;margin-top:40px">Powered by AceTrack</p>
</body></html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).send('Server error');
  }
});

// ═══════════════════════════════════════════════════════════════
// Serve Web Admin Dashboard
// ═══════════════════════════════════════════════════════════════
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  app.use(express.static(publicPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/socket.io') && !req.path.startsWith('/results')) {
      res.sendFile(path.join(publicPath, 'index.html'));
    } else {
      next();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 🚀 Start
// ═══════════════════════════════════════════════════════════════
httpServer.listen(PORT, () => {
  console.log(`🚀 AceTrack Suggested Backend v${APP_VERSION} on port ${PORT}`);
  console.log(`📡 WebSocket: Active`);
  console.log(`🔗 Database: Cloud MongoDB Atlas`);
  console.log(`🔐 Security: Rate Limiting ✅ | CORS Whitelist ✅ | Helmet ✅ | Zod Validation ✅ | Audit Logging ✅`);
});
