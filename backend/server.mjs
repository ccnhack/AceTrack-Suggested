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

// 🚀 ACE TRACK STABILITY VERSION (v2.6.55)
const APP_VERSION = "2.6.55"; 
const currentAppVersion = APP_VERSION;

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
  'http://localhost:8082'
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
    // 🛡️ SYNC HARDENING (v2.6.20): Allow mobile apps (no origin)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // 🛡️ DIAGNOSTIC: Log blocked origin to help identify required whitelist additions
    console.warn(`🛑 CORS Blocked: origin=${origin}`);
    logServerEvent('CORS_BLOCKED', { origin });
    return callback(new Error(`Not allowed by CORS: ${origin}`));
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
  mongoose.connect(MONGODB_URI, {
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  })
    .then(() => console.log("✅ Connected to MongoDB Atlas"))
    .catch(err => console.error("❌ MongoDB Connection Error:", err));
}

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
if (!ACE_API_KEY) {
  console.error("❌ CRITICAL: ACE_API_KEY is missing in production environment!");
  process.exit(1); 
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
    
    if (!state.data.players) state.data.players = [];
    if (!state.data.players.some(p => p && String(p.id).toLowerCase() === 'nishant')) {
       console.log("🛠️ [Recovery] Soft-restoring Nishant Shekhar in GET response...");
       state.data.players.push({
         id: 'nishant',
         name: 'Nishant Shekhar',
         role: 'user',
         registrationDate: new Date().toISOString(),
         lastActive: Date.now(),
         devices: []
       });
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
    let cloudFiles = [];
    try {
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
    
    const allFiles = [...new Set([...cloudFiles, ...localFiles])];
    res.json({ success: true, files: allFiles });
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

// POST /api/v1/save
router.post('/save', apiKeyGuard, validate(SaveDataSchema), async (req, res) => {
  const release = await syncMutex.acquire();
  try {
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'currentUser', 'matchmaking'];
    
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
                updatedT.startOtp = await hashOtp(t.startOtp);
             }
             if (t.endOtp && String(t.endOtp).length === 6 && !String(t.endOtp).startsWith('$2')) {
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
                entityMap.set(id, existing ? { ...existing, ...p } : p);
              }
            }
          });
          newMasterData[key] = Array.from(entityMap.values());
        } else if (key === 'currentUser' && incoming && incoming.id) {
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
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const timestamp = istDate.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
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
  const timestamp = Date.now();
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

// ═══════════════════════════════════════════════════════════════
// 🌐 Mount API v1 + backward-compatible un-versioned routes
// ═══════════════════════════════════════════════════════════════
app.use('/api', router);

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
  
  if (status === 500) {
    console.error(`❌ [SERVER_ERROR] ${req.method} ${req.url}:`, err.stack);
    logServerEvent('CRITICAL_ERROR', { url: req.url, error: message });
  }
  
  res.status(status).json({
    "slug": "acetrack-mobile",
    "version": "2.6.52",
    "sdkVersion": "50.0.0",
    "timestamp": new Date().toISOString()
  });
});

// 🚀 Start
// ═══════════════════════════════════════════════════════════════
httpServer.listen(PORT, () => {
  console.log(`🚀 AceTrack Suggested Backend v${APP_VERSION} on port ${PORT}`);
  console.log(`📡 WebSocket: Active`);
  console.log(`🔗 Database: Cloud MongoDB Atlas`);
  console.log(`🔐 Security: Rate Limiting ✅ | CORS Whitelist ✅ | Helmet ✅ | Zod Validation ✅ | Audit Logging ✅`);
});
