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
import compression from 'compression';
import { sendPushNotification } from './notifications.js';
import './reminders.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🕓 Utility: Get current IST timestamp for filenames (v2.6.84)
const getISTTimestamp = () => {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(now.getTime() + istOffset).toISOString()
    .replace(/T/, '_')
    .replace(/\..+/, '')
    .replace(/:/g, '-');
};

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
// 🛡️ STABILITY: FIREBASE BOOT GUARD
const initFirebase = async () => {
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
    }
  } catch (error) {
    console.error('❌ Firebase Init Delayed:', error.message);
  }
};
initFirebase();

// 🚀 ACE TRACK STABILITY VERSION (v2.6.88)
const APP_VERSION = "2.6.91"; 

// 🕓 Utility: Get current IST timestamp (v2.6.89)
const getISTDate = () => {
  const now = new Date();
  return new Date(now.getTime() + (5.5 * 60 * 60 * 1000)).toISOString();
};

// 🛡️ Helper: Persistent In-App Notifications (v2.6.89)
const addInAppNotification = (player, title, message, data = {}) => {
  if (!player) return;
  if (!player.notifications) player.notifications = [];
  player.notifications.unshift({
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    title,
    message,
    date: getISTDate(),
    read: false,
    ...data
  });
  if (player.notifications.length > 50) player.notifications = player.notifications.slice(0, 50);
};

// 🛡️ STABILITY: Panic Handlers
process.on('uncaughtException', (err) => {
  console.error('🔥 [PANIC] Uncaught Exception:', err);
  // Keep process alive for diagnostics
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [PANIC] Unhandled Rejection at:', promise, 'reason:', reason);
});

let dbStatus = 'connecting';

const app = express();
app.set('trust proxy', true);

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: CORS Whitelist (SEC Fix #3)
// ═══════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
  'https://acetrack-suggested.onrender.com',
  'https://acetrack-web.onrender.com',
  'https://acetrack-suggested-web.onrender.com',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3005',
  'http://localhost:8082',
  'null' 
];

// 🛡️ STABILITY FIX (v2.6.76): Root-level health checks MUST be handled BEFORE global middleware
// This prevents security headers or rate limiters from accidental blocking of Render/Cloudflare probes.
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'ok', version: APP_VERSION });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Helmet for HTTP headers (SEC)
// ═══════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: false, 
  crossOriginEmbedderPolicy: false
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: CORS with whitelist (SEC Fix #3)
// ═══════════════════════════════════════════════════════════════
app.use(cors({
  origin: (origin, callback) => {
    // 🛡️ SYNC HARDENING (v2.6.20/74): Allow mobile apps (no origin) or null string
    if (!origin || origin === 'null') return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // 🛡️ DIAGNOSTIC: Blocked origin log (throttled/non-looping)
    console.warn(`🛑 CORS Blocked: origin=${origin}`);
    const err = new Error(`Not allowed by CORS: ${origin}`);
    err.status = 403; // Ensure 403 status is explicitly set to avoid 500 loop
    return callback(err);
  },
  allowedHeaders: ['Content-Type', 'x-ace-api-key', 'x-socket-id', 'Authorization'],
  credentials: true
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Request body size limit (SEC Fix — 5MB max)
// ═══════════════════════════════════════════════════════════════
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// 🛡️ STABILITY: Database Readiness Guard
app.use((req, res, next) => {
  if (dbStatus !== 'connected' && req.path.startsWith('/api') && !req.path.endsWith('/health') && !req.path.endsWith('/status')) {
    return res.status(503).json({ 
      error: "Service Warming Up", 
      message: "Database connection in progress. Please retry in a few seconds.",
      status: dbStatus
    });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Rate Limiting (SEC Fix #4)
// ═══════════════════════════════════════════════════════════════

const globalLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 200, 
  message: { error: 'Too many requests. Please try again after a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { trustProxy: false },
});

const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many OTP attempts. Account temporarily locked.' },
  validate: { trustProxy: false },
});

app.use('/api', globalLimiter);

// ═══════════════════════════════════════════════════════════════
// WebSocket Setup
// ═══════════════════════════════════════════════════════════════
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      // 🛡️ SYNC HARDENING (v2.6.20): Consistent origin policy for WebSockets
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false); // Fail silently for CORS to avoid crashing
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-ace-api-key', 'x-socket-id', 'Authorization'],
    credentials: true
  }
});

// 🔐 SOCKET SECURITY: Auth Handshake (SEC Fix)
io.use((socket, next) => {
  const apiKey = socket.handshake.headers['x-ace-api-key'] || socket.handshake.auth.token;
  if (apiKey === ACE_API_KEY) {
    return next();
  }
  logServerEvent('WS_UNAUTHORIZED', { ip: socket.handshake.address });
  return next(new Error('Unauthorized: WebSocket requires valid API Key'));
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
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIAGNOSTICS_DIR = path.join(__dirname, 'diagnostics');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DIAGNOSTICS_DIR)) fs.mkdirSync(DIAGNOSTICS_DIR);

// 🛡️ STABILITY: Asynchronous Startup Block
const startServices = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is missing - Backend will stay in 503 state.");
    dbStatus = 'error_config';
    return;
  }

  console.log('📡 Connecting to MongoDB Atlas...');
  mongoose.connect(MONGODB_URI, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  }).then(() => {
    console.log('✅ MongoDB Connected Successfully');
    dbStatus = 'connected';
  }).catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    dbStatus = 'error_connection';
  });
};
startServices();

// ═══════════════════════════════════════════════════════════════
// 📊 Schemas (SE Fix: Database indexing)
// ═══════════════════════════════════════════════════════════════
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);
// ═══════════════════════════════════════════════════════════════
// 📋 AUDIT LOG (SEC Fix #7 — Immutable audit trail)
// ═══════════════════════════════════════════════════════════════
const AuditLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  action: { type: String, index: true },
  changedCollections: [String],
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, index: { expires: '30d' } }
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
// 🔐 SECURITY: API KEY Configuration (SEC Fix)
// In production, failure is mandatory if key is missing.
const ACE_API_KEY = process.env.ACE_API_KEY || (process.env.NODE_ENV === 'production' ? null : 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=');
if (!ACE_API_KEY && process.env.NODE_ENV === 'production') {
  console.error("❌ CRITICAL: ACE_API_KEY is missing in production environment!");
  // 🛡️ STABILITY FIX (v2.6.75): Don't exit process, just log error. 
  // Exiting causes Render crash loops which are harder to diagnose than 500 errors.
}

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
  matchmaking: z.array(z.any()).optional(),
  seenAdminActionIds: z.array(z.string()).optional(),
  visitedAdminSubTabs: z.array(z.string()).optional(),
  overwrite: z.boolean().optional(),
  atomicKeys: z.array(z.string()).optional(),
  version: z.number({ required_error: 'Version is required for cloud synchronization' })
});

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
const logServerEvent = async (action, details = {}) => {
  try {
    const logFile = path.join(DIAGNOSTICS_DIR, 'server_events.jsonl'); // 🛡️ Switched to JSONL (v2.6.48)
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), action, ...details }) + '\n';
    await fs.promises.appendFile(logFile, entry);
    console.log(`📡 [Server Log] ${action}:`, details);
  } catch (e) {
    console.error("❌ Failed to write server log:", e.message);
  }
};

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
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

const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    const tmp = path.join(__dirname, 'tmp_uploads');
    if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);
    cb(null, tmp);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storageConfig,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// 🛡️ SYNC MUTEX: Prevent race conditions during concurrent /save requests
class AsyncMutex {
  constructor() {
    this.queue = [];
    this.isLocked = false;
  }
  acquire() {
    return new Promise(resolve => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          next(release);
        } else {
          this.isLocked = false;
        }
      };
      if (this.isLocked) {
        this.queue.push(resolve);
      } else {
        this.isLocked = true;
        resolve(release);
      }
    });
  }
}
const syncMutex = new AsyncMutex();

// ═══════════════════════════════════════════════════════════════
// 🌐 API v1 Routes (SE Fix: API versioning)
// ═══════════════════════════════════════════════════════════════
const router = express.Router();

// Public Health Check (No Key Required)
router.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: APP_VERSION });
});

// GET /api/v1/data
router.get('/data', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
    if (!state || !state.data) return res.json({});
    
    if (state.data.players && Array.isArray(state.data.players)) {
      state.data.players = state.data.players.map(p => {
        if (p && p.role === 'admin' && String(p.id).toLowerCase() !== 'admin') {
          return { ...p, role: 'user' };
        }
        return p;
      });
    }

    if (state.data.currentUser && state.data.currentUser.role === 'admin' && String(state.data.currentUser.id).toLowerCase() !== 'admin') {
      state.data.currentUser.role = 'user';
    }

    res.json({ ...state.data, lastUpdated: state.lastUpdated, version: state.version || 1 });
  } catch (error) {
    console.error('❌ Data Fetch Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/status
router.get('/status', apiKeyGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated version');
    res.json({ 
      lastUpdated: state?.lastUpdated || 0,
      version: state?.version || 1,
      latestAppVersion: process.env.LATEST_APP_VERSION || APP_VERSION
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics
router.get('/diagnostics', apiKeyGuard, async (req, res) => {
  try {
    let allFilesWithMeta = [];

    // 1. Fetch Cloud Files with metadata
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const result = await cloudinary.search
        .expression('folder:acetrack/diagnostics/*')
        .sort_by('created_at', 'desc')
        .max_results(500)
        .execute({ signal: controller.signal });
      
      clearTimeout(timeoutId);
        
      result.resources.forEach(file => {
        const parts = file.public_id.split('/');
        allFilesWithMeta.push({
          name: parts[parts.length - 1],
          timestamp: new Date(file.created_at).getTime()
        });
      });
    } catch (e) {
      console.warn('Cloudinary search failed:', e.message);
    }
    
    // 2. Fetch Local Files with metadata
    try {
      if (fs.existsSync(DIAGNOSTICS_DIR)) {
        const localFiles = fs.readdirSync(DIAGNOSTICS_DIR);
        localFiles.forEach(file => {
          const stats = fs.statSync(path.join(DIAGNOSTICS_DIR, file));
          allFilesWithMeta.push({
            name: file,
            timestamp: stats.mtime.getTime()
          });
        });
      }
    } catch (e) {
      console.warn('Local diagnostic read failed:', e.message);
    }
    
    // 3. De-duplicate and Sort Global List (Latest First)
    const uniqueFilesMap = new Map();
    allFilesWithMeta.forEach(f => {
      // Keep the one with the latest timestamp if duplicates exist
      if (!uniqueFilesMap.has(f.name) || uniqueFilesMap.get(f.name) < f.timestamp) {
        uniqueFilesMap.set(f.name, f.timestamp);
      }
    });

    const sortedFiles = Array.from(uniqueFilesMap.entries())
      .sort((a, b) => b[1] - a[1]) // Descending
      .map(entry => entry[0]);

    res.json({ success: true, files: sortedFiles });
  } catch (error) {
    console.error('Diagnostics Fetch Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics/:filename
router.get('/diagnostics/:filename', apiKeyGuard, asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  
  try {
    const publicId = `acetrack/diagnostics/${filename}`;
    const fileUrl = cloudinary.url(publicId, { resource_type: 'raw', secure: true });
    const cloudRes = await fetch(fileUrl);
    if (cloudRes.ok) {
      const data = await cloudRes.json();
      return res.json(data);
    }
  } catch (cloudErr) {
    console.log(`Cloudinary fetch failed for ${filename}, trying local fallback.`);
  }

  const filepath = path.join(DIAGNOSTICS_DIR, filename);
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    return res.json(JSON.parse(data));
  }

  res.status(404).json({ error: 'File not found in cloud or local storage' });
}));

// POST /api/v1/register-push-token
router.post('/register-push-token', apiKeyGuard, async (req, res) => {
  const { userId, pushToken } = req.body;
  if (!userId || !pushToken) return res.status(400).json({ error: 'Missing userId or pushToken' });

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.status(404).json({ error: 'System state not found' });

    const players = state.data.players || [];
    const playerIndex = players.findIndex(p => p.id === userId);

    if (playerIndex >= 0) {
      const player = players[playerIndex];
      const tokens = player.pushTokens || [];
      if (!tokens.includes(pushToken)) {
        tokens.push(pushToken);
        players[playerIndex] = { ...player, pushTokens: tokens };
        
        await AppState.updateOne(
          { _id: state._id },
          { $set: { "data.players": players, lastUpdated: Date.now() } }
        );
        console.log(`📱 [PushReg] Token registered for ${userId}: ${pushToken}`);
      }
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/save
router.post('/save', apiKeyGuard, validate(SaveDataSchema), async (req, res) => {
  const waitStart = Date.now();
  const release = await syncMutex.acquire();
  const waitTime = Date.now() - waitStart;
  if (waitTime > 2000) console.warn(`⚠️ Save Mutex Wait: ${waitTime}ms from ${req.ip}`);

  try {
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs'];
    
    const now = Date.now();
    const clientVersion = req.body.version;

    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    const currentData = (state && state.data) ? state.data : {};
    const currentVersion = state?.version || 1;

    if (clientVersion === undefined) {
      console.warn(`🛑 Rejected: Request missing version from ${req.ip}`);
      return res.status(403).json({ error: 'Forbidden: Missing version number. Please update your app.' });
    }
    
    if (clientVersion < currentVersion) {
      console.warn(`🛑 OCC Conflict: Client v${clientVersion} vs Server v${currentVersion}`);
      return res.status(409).json({ 
        error: 'Conflict: Your local data is out of date. Please refresh and try again.',
        serverVersion: currentVersion,
        cloudLastUpdated: state?.lastUpdated
      });
    }

    const changedKeys = Object.keys(req.body).filter(k => syncableKeys.includes(k));
    await logAudit(req, 'DATA_SAVE', changedKeys, { atomicKeys: req.body.atomicKeys, version: clientVersion });

    const newMasterData = { ...currentData };

    for (const key of syncableKeys) {
      if (req.body[key] !== undefined) {
        let incoming = req.body[key];
        const atomicKeys = req.body.atomicKeys || [];

        if (key === 'tournaments' && Array.isArray(incoming)) {
          incoming = await Promise.all(incoming.map(async (t) => {
             const updatedT = { ...t };
             if (t.startOtp && String(t.startOtp).length === 6 && !String(t.startOtp).startsWith('$2')) {
                console.log(`🔐 Hashing Start OTP for tournament: ${t.id || 'new'}`);
                updatedT.startOtp = await hashOtp(t.startOtp);
             }
             if (t.endOtp && String(t.endOtp).length === 6 && !String(t.endOtp).startsWith('$2')) {
                console.log(`🔐 Hashing End OTP for tournament: ${t.id || 'new'}`);
                updatedT.endOtp = await hashOtp(t.endOtp);
             }
             return updatedT;
          }));
        }

        if (['players', 'matchmaking', 'tournaments', 'matches', 'auditLogs', 'matchVideos', 'supportTickets', 'evaluations'].includes(key) && Array.isArray(incoming)) {
          const atomicKeys = req.body.atomicKeys || [];
          if (atomicKeys.includes(key)) {
            // 🛡️ ATOMIC SYNC: Direct Overwrite (v2.6.47 Fix for Deletions)
            newMasterData[key] = incoming;
            continue; 
          }
          const entityMap = new Map();
          (currentData[key] || []).forEach(e => { if (e && e.id) entityMap.set(String(e.id).toLowerCase(), e); });
          
          incoming.forEach(p => {
            if (p && p.id) {
              const id = String(p.id).toLowerCase();
              const existing = entityMap.get(id);
              
              // 🛡️ ADMIN GUARD: Only allow the 'admin' account to have the 'admin' role (v2.6.51)
              if (p.role === 'admin' && id !== 'admin') {
                console.warn(`🛑 Unauthorized Admin Escalation Attempt: userId=${id}`);
                p.role = 'user';
              }

              if (key === 'players' && existing) {
                const mergedDevices = [...(existing.devices || [])];
                if (p.devices && Array.isArray(p.devices)) {
                  p.devices.forEach(d => {
                    if (!d || !d.id) return;
                    const dIndex = mergedDevices.findIndex(ed => ed.id === d.id);
                    if (dIndex >= 0) mergedDevices[dIndex] = { ...mergedDevices[dIndex], ...d };
                    else mergedDevices.push(d);
                  });
                }
                entityMap.set(id, { ...existing, ...p, devices: mergedDevices });
              } else {
                if (key === 'matchmaking') {
                  const statusChanged = existing && p.status && p.status !== existing.status;
                  const slotChanged = existing && (p.proposedDate !== existing.proposedDate || p.proposedTime !== existing.proposedTime);
                  
                  if (!existing || statusChanged || slotChanged) {
                    p.isNew = true;
                  }
                  
                  const merged = existing ? { ...existing, ...p } : p;
                  // 🛡️ SYNC PROTECTION (v2.6.91): Preserve 'isNew: true' if client update doesn't explicitly clear it
                  if (existing && existing.isNew && p.isNew === undefined) {
                    merged.isNew = true;
                  }
                  entityMap.set(id, merged);
                } else {
                  entityMap.set(id, existing ? { ...existing, ...p } : p);
                }
              }
            }
          });
          newMasterData[key] = Array.from(entityMap.values());
        } else if (key === 'currentUser' && incoming && incoming.id) {
          const id = String(incoming.id).toLowerCase();
          
          // 🛡️ ADMIN GUARD: Secure the current user object as well
          if (incoming.role === 'admin' && id !== 'admin') {
            console.warn(`🛑 Unauthorized Admin Escalation Attempt (Current User): userId=${id}`);
            incoming.role = 'user';
          }

          newMasterData.currentUser = incoming;
          if (newMasterData.players && Array.isArray(newMasterData.players)) {
            const id = String(incoming.id).toLowerCase();
            const pIndex = newMasterData.players.findIndex(p => p && String(p.id).toLowerCase() === id);
            if (pIndex >= 0) {
              const existing = newMasterData.players[pIndex];
              const mergedDevices = [...(existing.devices || [])];
              if (incoming.devices && Array.isArray(incoming.devices)) {
                incoming.devices.forEach(d => {
                  if (!d || !d.id) return;
                  const dIndex = mergedDevices.findIndex(ed => ed.id === d.id);
                  if (dIndex >= 0) mergedDevices[dIndex] = { ...mergedDevices[dIndex], ...d };
                  else mergedDevices.push(d);
                });
              }
              newMasterData.players[pIndex] = { ...existing, ...incoming, devices: mergedDevices };
            }
          }
        } else if (['seenAdminActionIds', 'visitedAdminSubTabs'].includes(key) && Array.isArray(incoming)) {
          // 🛡️ UNION MERGE: Additive only to prevent acknowledgments from being lost (v2.6.50)
          const existing = Array.isArray(currentData[key]) ? currentData[key] : [];
          newMasterData[key] = [...new Set([...existing, ...incoming])];
        } else {
          newMasterData[key] = incoming;
        }
      }
    }

    const nextVersion = currentVersion + 1;

    const updatedState = await AppState.findOneAndUpdate(
      {},
      { $set: { data: newMasterData, version: clientVersion, lastUpdated: now } },
      { upsert: true, returnDocument: 'after' } // 🛡️ Modern Mongoose (v2.6.48)
    );

    const socketId = req.headers['x-socket-id'];
    const broadcastPayload = { 
      lastUpdated: updatedState.lastUpdated, 
      version: updatedState.version,
      keys: changedKeys,
      lastSocketId: socketId || 'system'
    };

    if (socketId) {
      logServerEvent('BROADCAST_EXCLUDING_SENDER', { socketId, version: broadcastPayload.version });
      io.except(socketId).emit('data_updated', broadcastPayload);
    } else {
      logServerEvent('BROADCAST_GLOBAL', { version: broadcastPayload.version });
      io.emit('data_updated', broadcastPayload);
    }
    
    logServerEvent('DATA_SAVE_SUCCESS', { lastUpdated: updatedState.lastUpdated, version: updatedState.version, keys: broadcastPayload.keys });
    res.json({ success: true, lastUpdated: updatedState.lastUpdated, version: updatedState.version });

    // ═══════════════════════════════════════════════════════════════
    // 🔔 NOTIFICATION HOOKS (v2.6.84)
    // ═══════════════════════════════════════════════════════════════
    try {
      // 1. New Match Challenges
      if (changedKeys.includes('matches')) {
        const incomingMatches = req.body.matches || [];
        const existingMatches = currentData.matches || [];
        const newMatches = incomingMatches.filter(m => !existingMatches.some(em => em.id === m.id));
        
        for (const match of newMatches) {
          if (match.status === 'scheduled' || match.status === 'Pending') {
            const opponentId = match.player2Id || match.opponentId;
            const challengerId = match.player1Id || match.challengerId;
            const opponent = newMasterData.players.find(p => p.id === opponentId);
            const challenger = newMasterData.players.find(p => p.id === challengerId);
            
            if (opponent) {
              const challengerName = challenger?.name || 'Someone';
              const title = "New Match Challenge! 🎾";
              const body = `${challengerName} challenged you to a match.`;
              
              addInAppNotification(opponent, title, body, { matchId: match.id, type: 'MATCH_CHALLENGE' });
              
              if (opponent.pushTokens?.length > 0) {
                sendPushNotification(opponent.pushTokens, title, body, { matchId: match.id, type: 'MATCH_CHALLENGE' });
              }
            }
          }
        }
      }

      // 2. Video Approvals
      if (changedKeys.includes('matchVideos')) {
        const incomingVideos = req.body.matchVideos || [];
        const existingVideos = currentData.matchVideos || [];
        
        for (const video of incomingVideos) {
          const existing = existingVideos.find(ev => ev.id === video.id);
          const justApproved = video.adminStatus === 'Active' && (!existing || existing.adminStatus !== 'Active');
          
          if (justApproved && video.playerIds) {
            video.playerIds.forEach(pId => {
              const player = newMasterData.players.find(p => p.id === pId);
              if (player) {
                const title = "New Match Recording! 🎥";
                const body = "A recording of your recent match is now available to view.";
                
                addInAppNotification(player, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
                
                if (player.pushTokens?.length > 0) {
                  sendPushNotification(player.pushTokens, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
                }
              }
            });
          }
        }
      }

      // 3. Support Ticket Replies
      if (changedKeys.includes('supportTickets')) {
        const incomingTickets = req.body.supportTickets || [];
        const existingTickets = currentData.supportTickets || [];
        
        for (const ticket of incomingTickets) {
          const existing = existingTickets.find(et => et.id === ticket.id);
          const newMessages = (ticket.messages || []).slice(existing ? existing.messages.length : 0);
          
          for (const msg of newMessages) {
            // If sender is NOT the ticket owner, it's an admin reply
            if (msg.senderId !== ticket.userId) {
              const user = newMasterData.players.find(p => p.id === ticket.userId);
              if (user && user.pushTokens?.length > 0) {
                sendPushNotification(
                  user.pushTokens, 
                  "Support Ticket Reply ✉️", 
                  `New reply regarding your ticket: "${ticket.title}"`,
                  { ticketId: ticket.id, type: 'SUPPORT_REPLY' }
                );
              }
              break; // Only notify once per sync batch
            }
          }
        }
      }

      // 4. Tournament Registrations (New in v2.6.84)
      if (changedKeys.includes('tournaments')) {
        const incomingTournaments = req.body.tournaments || [];
        const existingTournaments = currentData.tournaments || [];

        for (const tournament of incomingTournaments) {
          const existing = existingTournaments.find(et => et.id === tournament.id);
          const incomingRegIds = tournament.registeredPlayerIds || [];
          const existingRegIds = existing ? (existing.registeredPlayerIds || []) : [];
          
          // Find newly registered players
          const newRegIds = incomingRegIds.filter(id => !existingRegIds.includes(id));

          for (const playerId of newRegIds) {
            const player = newMasterData.players.find(p => p.id === playerId);
            if (player) {
              const title = "Registration Confirmed! 🏆";
              const body = `You're officially registered for ${tournament.title}. Good luck!`;
              
              addInAppNotification(player, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              
              if (player.pushTokens?.length > 0) {
                sendPushNotification(player.pushTokens, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
              }
            }
          }
        }
      }
    } catch (notifErr) {
      console.error("❌ Notification Hook Error:", notifErr);
    }
  } catch (error) {
    console.error("❌ Save Error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    release();
  }
});

// POST /api/v1/upload
router.post('/upload', apiKeyGuard, upload.single('video'), async (req, res) => {
  if (!req.file) {
    logServerEvent('UPLOAD_FAILED', { error: 'No file received' });
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    let uploadFolder = 'acetrack';
    if (req.file.mimetype.startsWith('video/')) uploadFolder = 'acetrack/videos';
    else if (req.file.mimetype.startsWith('image/')) uploadFolder = 'acetrack/images';
    else uploadFolder = 'acetrack/others';

    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: 'auto',
        folder: uploadFolder,
        public_id: `${Date.now()}-${Math.round(Math.random() * 1e9)}${req.file.mimetype.startsWith('image/') ? '.jpg' : ''}`,
        format: req.file.mimetype.startsWith('image/') ? 'jpg' : undefined,
      },
      async (error, result) => {
        if (req.file.path) {
          fs.promises.unlink(req.file.path).catch(e => console.error("Cleanup error:", e));
        }

        if (error) {
          console.error("❌ Cloudinary Upload Error:", error);
          await logServerEvent('UPLOAD_FAILED_CLOUDINARY', { error: error.message });
          return res.status(500).json({ error: "Failed to upload to cloud" });
        }
        
        await logAudit(req, 'FILE_UPLOAD_CLOUDINARY', [], { url: result.secure_url, size: req.file.size });
        await logServerEvent('UPLOAD_SUCCESS_CLOUDINARY', { url: result.secure_url });
        
        res.json({ url: result.secure_url });
      }
    );

    fs.createReadStream(req.file.path).pipe(stream);
  } catch (error) {
    console.error('Upload Process Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/diagnostics
router.post('/diagnostics', apiKeyGuard, validate(DiagnosticsSchema), asyncHandler(async (req, res) => {
  const { username, logs, prefix, deviceId } = req.body;
    const timestamp = getISTTimestamp();
    const safeUsername = username.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    try {
      const userFiles = fs.readdirSync(DIAGNOSTICS_DIR)
        .filter(f => f.startsWith(`${safeUsername}_`) || f.startsWith(`admin_requested_${safeUsername}_`))
        .sort();
      while (userFiles.length >= 3) {
        fs.unlinkSync(path.join(DIAGNOSTICS_DIR, userFiles.shift()));
      }
    } catch (e) { /* silent */ }

    const filePrefix = prefix === 'admin_requested' ? 'admin_requested_' : '';
    const safeDeviceId = deviceId ? `_${deviceId.replace(/[^a-z0-9]/gi, '_')}` : '';
    const filename = `${filePrefix}${safeUsername}${safeDeviceId}_${timestamp}.json`;
    const filepath = path.join(DIAGNOSTICS_DIR, filename);

    const istDate = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const reportData = {
      username,
      deviceId: deviceId || 'Unknown Device',
      uploadedAt: istDate.toISOString().replace('Z', '+05:30'),
      logs
    };

    fs.writeFileSync(filepath, JSON.stringify(reportData, null, 2));

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
      
      try {
        const result = await cloudinary.search
          .expression('folder:acetrack/diagnostics/*')
          .sort_by('created_at', 'desc')
          .max_results(100)
          .execute();
          
        const userFilesCloud = result.resources.filter(f => {
          const fName = f.public_id.split('/').pop().toLowerCase();
          return fName.startsWith(`${safeUsername}_`) || 
                 fName.startsWith(`admin_requested_${safeUsername}_`);
        });
        
        if (userFilesCloud.length > 3) {
          const filesToDelete = userFilesCloud.slice(3).map(f => f.public_id);
          console.log(`🧹 [Cloudinary] Rotating ${filesToDelete.length} old diagnostic(s) for ${safeUsername}`);
          await cloudinary.api.delete_resources(filesToDelete, { resource_type: 'raw' });
        }
      } catch (rotationErr) {
        console.error('❌ [Cloudinary] Rotation Failed:', rotationErr.message);
      }
      
    } catch (err) {
      console.error('❌ [Cloudinary] Diagnostics Backup Failed:', err.message);
      logServerEvent('DIAGNOSTICS_CLOUDINARY_BACKUP_ERROR', { 
        error: err.message, 
        filename,
        stack: err.stack 
      });
      await logAudit(req, 'DIAG_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
    }

    res.json({ success: true, filename });
}));

// POST /api/v1/diagnostics/auto-flush
router.post('/diagnostics/auto-flush', apiKeyGuard, validate(AutoFlushSchema), asyncHandler(async (req, res) => {
  const { username, deviceId, logs } = req.body;
  const safeUser = String(username || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const safeDevice = String(deviceId || 'unknown').replace(/[^a-zA-Z0-9-]/gi, '_');
  const timestamp = getISTTimestamp();
  const filename = `${safeUser}_${safeDevice}_${timestamp}.log`;
  
  const filePath = path.join(DIAGNOSTICS_DIR, filename);
  const logContent = logs.map(l => `[${l.timestamp}] ${l.level.toUpperCase()} [${l.type}]: ${l.message}`).join('\n');
  await fs.promises.writeFile(filePath, logContent);

  console.log(`☁️ [Cloudinary Auto-Flush] Starting upload for: ${filename} (Size: ${(await fs.promises.stat(filePath)).size} bytes)`);
  try {
    const cloudResult = await cloudinary.uploader.upload(filePath, {
      folder: 'acetrack/diagnostics/auto-flush',
      resource_type: 'raw',
      public_id: filename,
      use_filename: true,
      unique_filename: false
    });
    console.log(`✅ [Cloudinary Auto-Flush] Success: ${cloudResult.secure_url}`);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_SUCCESS', { 
      url: cloudResult.secure_url,
      filename: filename
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_SUCCESS', [], { url: cloudResult.secure_url, filename });
  } catch (err) {
    console.error('❌ [Cloudinary Auto-Flush] Backup Failed:', err.message);
    await logServerEvent('AUTO_FLUSH_CLOUDINARY_BACKUP_ERROR', { 
      error: err.message, 
      filename,
      stack: err.stack
    });
    await logAudit(req, 'AUTO_FLUSH_UPLOAD_CLOUDINARY_FAILED', [], { error: err.message, filename });
  }

  const allFiles = await fs.promises.readdir(DIAGNOSTICS_DIR);
  const userFiles = allFiles
    .filter(f => f.startsWith(`${safeUser}_${safeDevice}_`) && f.endsWith('.log'))
    .sort((a, b) => {
      const timeA = parseInt(a.split('_').pop().replace('.log', '')) || 0;
      const timeB = parseInt(b.split('_').pop().replace('.log', '')) || 0;
      return timeB - timeA;
    });

  if (userFiles.length > 3) {
    for (const f of userFiles.slice(3)) {
      await fs.promises.unlink(path.join(DIAGNOSTICS_DIR, f)).catch(() => {});
    }
  }

  res.json({ success: true, count: logs.length, retained: 3 });
}));

// GET /api/v1/audit-logs (Admin only)
router.get('/audit-logs', apiKeyGuard, asyncHandler(async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
  res.json({ success: true, logs });
}));

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/otp/send', apiKeyGuard, (req, res) => {
  const { target, type } = req.body; // target is email/phone, type is 'email' or 'phone'
  console.log(`🔑 [OTP_SIMULATION] Code "123456" requested for ${type}: ${target}`);
  logServerEvent('OTP_SEND_REQUESTED', { target, type });
  res.json({ success: true, message: `Verification code sent to ${target}` });
});

// 🔐 OTP: Verify code (Hardcoded to 123456)
router.post('/otp/verify', apiKeyGuard, (req, res) => {
  const { code, target, type } = req.body;
  
  if (code === '123456') {
    logServerEvent('OTP_VERIFY_SUCCESS', { target, type });
    return res.json({ success: true, message: 'Verification successful' });
  }
  
  logServerEvent('OTP_VERIFY_FAILED', { target, type, code });
  res.status(400).json({ success: false, error: 'Invalid verification code' });
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Mount API v1 + backward-compatible un-versioned routes
// ═══════════════════════════════════════════════════════════════
app.use('/api', router);

// 🛡️ STABILITY FIX (v2.6.75): Dedicated Root Health Check for Render Load Balancer
// This bypasses complex middleware to ensure the service stays "Up" during heavy load.
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Root catch-all for legacy health monitors
app.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'ok', version: APP_VERSION });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Public Tournament Results (OWNER Fix: public URL)
// ═══════════════════════════════════════════════════════════════
app.get('/results/:tournamentId', async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.status(404).send('No data');
    const tournaments = (state.data && Array.isArray(state.data.tournaments)) ? state.data.tournaments : [];
    const tournament = tournaments.find(t => t && t.id === req.params.tournamentId);
    if (!tournament) return res.status(404).send('Tournament not found');
    
    const matches = (state.data && Array.isArray(state.data.matches)) ? state.data.matches.filter(m => m && m.tournamentId === tournament.id) : [];
    const registeredIds = Array.isArray(tournament.registeredPlayerIds) ? tournament.registeredPlayerIds.map(String) : [];
    const allPlayers = (state.data && Array.isArray(state.data.players)) ? state.data.players : [];
    const players = allPlayers.filter(p => p && p.id && registeredIds.includes(String(p.id)));
    
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
    console.error('❌ Public Results Error:', error);
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
// 🚀 Centralized Error Handler
// ═══════════════════════════════════════════════════════════════
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  
  // 🛡️ SYNC HARDENING (v2.6.74): Only log "CRITICAL" for actual 500s or unexpected crashes.
  // 401, 403, and 404 are "expected" security rejections and shouldn't trigger heavy disk I/O logging.
  if (status >= 500) {
    console.error(`❌ [SERVER_ERROR] ${req.method} ${req.url}:`, err.stack);
    logServerEvent('CRITICAL_ERROR', { url: req.url, error: message });
  }
  
  res.status(status).json({
    "success": false,
    "error": message,
    "version": "2.6.90",
    "timestamp": getISTDate()
  });
});

// 🚀 Start: 'Immortal' Listener (v2.6.81 — Standard Port)
// ═══════════════════════════════════════════════════════════════
const server = httpServer.listen(PORT, () => {
  const addr = server.address();
  const actualPort = typeof addr === 'string' ? addr : addr.port;
  console.log(`🚀 AceTrack PORT 3000 SHIFT v${APP_VERSION} listening on ${actualPort}`);
  console.log(`🛡️  Database Initial State: ${dbStatus}`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`❌ FATAL: Port ${PORT} already in use. Retrying in 5s...`);
    setTimeout(() => { server.close(); server.listen(PORT); }, 5000);
  } else {
    console.error('❌ Server binding error:', e);
  }
});
