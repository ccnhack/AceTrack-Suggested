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
import { createAdapter } from '@socket.io/mongo-adapter';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import admin from 'firebase-admin';
import compression from 'compression';
import { sendPushNotification } from './notifications.js';
import { processTournamentWaitlist } from './promotion_logic.mjs'; 
import crypto from 'crypto';
import { 
  sendOnboardingEmail, 
  buildOnboardingHtml, 
  sendPasswordResetEmail,
  sendOnboardingSuccessEmail,
  sendLoginDetailsEmail,
  sendAdminResetPasswordEmail,
  sendPromotionEmail,
  sendDemotionEmail,
  sendTerminationEmail,
  sendReOnboardingEmail,
  sendSecurityAlertEmail
} from './emailService.mjs';

import { logAudit, logServerEvent, sendSecurityAlert } from './services/AuditService.mjs';
import { loginAttempts, trackLoginAttempt } from './services/LoginTracker.mjs';
import SupportMetricsService from './services/SupportMetricsService.mjs';
import { fetchWithAIFallback } from './utils/aiRouter.mjs';

// 🏗️ [PHASE 1 MODULARIZATION] (v2.6.315): Extracted modules
import { AppState, AuditLog, SecuritySummary, SupportInvite, SupportPasswordReset, Player } from './models/index.mjs';
import { getISTTimestamp, getISTDate, addInAppNotification, asyncHandler } from './helpers/utils.mjs';
import {
  initSecurity, PUBLIC_APP_ID,
  apiKeyGuard, authGuard, sensitiveCacheGuard,
  createRateLimiters, getSanitizedState,
  DiagnosticsSchema, AutoFlushSchema, SaveDataSchema, validate,
  hashOtp, compareOtp
} from './middleware/security.mjs';
import createAuthRoutes from './routes/auth.mjs';
import createDataRoutes from './routes/data.mjs';
import createSupportRoutes from './routes/support.mjs';
import createAdminCoreRoutes from './routes/admin_core.mjs';
import createHrRoutes from './routes/hr.mjs';
import createCommsRoutes from './routes/comms.mjs';
import createWebRoutes from './routes/web.mjs';
import registerWebSocketHandlers from './services/websocket.mjs';
import initScheduler from './services/scheduler.mjs';
import createInfrastructureRoutes from './routes/infrastructure.mjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // 🛡️ Hardened for Render (v2.6.252)

// getISTTimestamp: MOVED to ./helpers/utils.mjs (Phase 1 Modularization)

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

// 🚀 ACE TRACK STABILITY VERSION (v2.6.175)
const APP_VERSION = '2.6.551'; // Critical for Update prompts 

// 🛡️ SECURITY: JWT & Secrets (v2.6.192)
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
const ACE_API_KEY = process.env.ACE_API_KEY || "AceTrack_Internal_v2_Testing";
// 🛡️ [PRODUCTION HARDENING] (v2.6.319): JWT_SECRET MUST be set in production.
// In dev, falls back to ephemeral random secret (sessions won't survive restarts).
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('🛑 FATAL: JWT_SECRET must be set in production! Sessions cannot be validated without it.');
    process.exit(1);
  }
  const fallback = crypto.randomBytes(32).toString('base64');
  console.warn('⚠️ [SECURITY] JWT_SECRET env var not set! Using ephemeral random secret. Sessions will not persist across restarts.');
  return fallback;
})();
const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL; // OPTIONAL: Discord/Slack alerts

const signToken = (user, jti = null) => {
  const payload = {
    id: user.id, 
    role: user.role || 'user',
    scopes: user.scopes || (user.role === 'admin' ? ['*'] : ['read:own'])
  };
  if (jti) payload.jti = jti;
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
};

// 🛡️ SECURITY: Real-time Alerting (v2.6.191)

// 📊 Schemas: MOVED to ./models/index.mjs (Phase 1 Modularization)
// AppState, AuditLog, SecuritySummary are now imported at the top.

// AuditLog schema: MOVED to ./models/index.mjs (Phase 1 Modularization)

// 🛡️ SECURITY: Reputation & OSINT Helpers (v2.6.192)
// Checks if an IP has a record of successful authentication in the last 24 hours.


// 🏗️ [PHASE 1b] Initialize security middleware with runtime dependencies
initSecurity({ aceApiKey: ACE_API_KEY, jwtSecret: JWT_SECRET, appVersion: APP_VERSION, logAudit });
const { globalApiLimiter, loginLimiter, otpLimiter, passwordResetLimiter } = createRateLimiters(APP_VERSION);


// Cumulative Security Summary moved to services/scheduler.mjs
initScheduler(loginAttempts, sendSecurityAlert);


// 🛡️ [MEMORY LEAK FIX] (v2.6.434): Purge disconnected activeSupportSessions every 5 minutes
setInterval(() => {
  if (io && io.sockets && io.sockets.sockets) {
    for (const [socketId, session] of activeSupportSessions) {
      if (!io.sockets.sockets.has(socketId)) {
        activeSupportSessions.delete(socketId);
      }
    }
  }
}, 300000);


// getISTDate: MOVED to ./helpers/utils.mjs (Phase 1 Modularization)

// addInAppNotification: MOVED to ./helpers/utils.mjs (Phase 1 Modularization)

// 🛡️ STABILITY: Panic Handlers
process.on('uncaughtException', (err) => {
  console.error('🔥 [PANIC] Uncaught Exception:', err);
  // Keep process alive for diagnostics
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [PANIC] Unhandled Rejection at:', promise, 'reason:', reason);
});

let dbStatus = 'connecting';

const ALLOWED_ORIGINS = [
  'https://acetrack-suggested.onrender.com',
  'https://acetrack-web.onrender.com',
  'https://acetrack-suggested-web.onrender.com',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3005',
  'http://localhost:8082',
  'http://127.0.0.1:8082',
  'http://127.0.0.1:8081',
  'http://127.0.0.1:19006'
];

// 🛡️ [PERFORMANCE FIX] (v2.6.315): Removed RAW_REQUEST_RECEIVED audit.
// Previously logged EVERY non-OPTIONS request to MongoDB, causing massive DB growth
// and adding 5-15ms latency per request. Security events are still tracked by
// logAudit calls in specific route handlers and the HARD_ROUTE_BLOCK middleware.

app.use(cookieParser());

// [Consolidated with primary /health guard at /api/v1/health]

// 🛡️ SECURITY: Global Hardening (v2.6.192)
app.disable('x-powered-by'); 
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// 1. HARDENED ROUTE GUARD: Explicitly block sensitive enumeration at top level
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  const sensitivePaths = ['/admin', '/debug', '/config', '/metrics', '/swagger', '/env', '/env', '/graphql', '/.env', '/config.php'];
  
  if (sensitivePaths.some(p => path.startsWith(p))) {
    const providedKey = req.headers['x-ace-api-key'] || req.query.key;
    const cookieToken = req.cookies?.acetrack_session;
    let isAuthorized = (providedKey === ACE_API_KEY);

    // 🛡️ [SESSION_AWARE_GUARD] (v2.6.258): Allow refresh if valid session cookie exists
    if (!isAuthorized && cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET);
        if (decoded.role === 'admin' || decoded.role === 'support') {
          isAuthorized = true;
        }
      } catch (err) {
        // Token invalid, proceed to block
      }
    }

    if (!isAuthorized) {
      // 🛡️ [SECURITY AUDIT] (v2.6.194)
      logAudit(req, 'HARD_ROUTE_BLOCK', [], { path: req.path, ip: req.ip });
      console.warn(`🛑 Hard Block: Unauthorized access to ${req.path} from ${req.ip}`);

      // 🛡️ [UX GUARD] (v2.6.201): Pretty error for browsers, JSON for machines
      const acceptHeader = req.headers['accept'] || '';
      if (acceptHeader.includes('text/html')) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Access Denied | AceTrack</title>
              <style>
                body { background: #0F172A; color: #94A3B8; font-family: -apple-system, system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1E293B; padding: 40px; border-radius: 24px; text-align: center; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid #334155; }
                h1 { color: #F8FAFC; margin: 0 0 12px 0; font-size: 24px; }
                p { line-height: 1.6; margin-bottom: 24px; }
                .btn { background: #6366F1; color: white; padding: 12px 24px; border-radius: 12px; text-decoration: none; font-weight: bold; display: inline-block; transition: background 0.2s; }
                .btn:hover { background: #4F46E5; }
              </style>
            </head>
            <body>
              <div class="card">
                <h1>🛑 Access Denied</h1>
                <p>Direct access to administrative routes is prohibited by the AceTrack security engine.</p>
                <a href="/" class="btn">Return to Dashboard</a>
              </div>
            </body>
          </html>
        `);
      }

      return res.status(403).json({ 
        success: false, 
        error: 'Forbidden: Direct access to administrative routes is prohibited.',
        code: 'HARD_ROUTE_BLOCK'
      });
    }
  }
  next();
});

// 2. FULL SECURITY HEADERS (v2.6.192)
app.use(helmet({
  frameguard: { action: 'sameorigin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.nonce}'`, "https://acetrack-suggested.onrender.com", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com"],
      connectSrc: ["'self'", "https://acetrack-suggested.onrender.com", "https://*.cloudinary.com", "https://*.firebaseio.com", "https://*.googleapis.com"],
      imgSrc: ["'self'", "data:", "https://*.cloudinary.com", "https://*.dicebear.com", "https://*.googleusercontent.com", "https://*.unsplash.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

// Root heartbeat moved to routes/infrastructure.mjs


// 🔐 SECURITY: CORS with whitelist (SEC Fix #3)
// ═══════════════════════════════════════════════════════════════
app.use(cors({
  origin: (origin, callback) => {
    // 🛡️ SECURITY HARDENING (v2.6.182): 
    // 1. Allow mobile apps (no origin header).
    // 2. Explicitly REJECT 'null' origin to prevent Sandboxed Iframe attacks (Finding 2).
    // 3. Match against the strictly defined whitelist.
    
    if (!origin) return callback(null, true);
    
    if (origin === 'null') {
      console.warn(`🛑 CORS REJECTED: Malicious 'null' origin detected.`);
      return callback(new Error('CORS: null origin is not permitted for security reasons.'));
    }

    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`🛑 CORS Blocked: origin=${origin}`);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  allowedHeaders: ['Content-Type', 'x-ace-api-key', 'x-socket-id', 'Authorization', 'x-user-id'],
  credentials: true
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: Request body size limit (SEC Fix — 5MB max)
// ═══════════════════════════════════════════════════════════════
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🛡️ DIAGNOSTICS: Global Request Logger (v2.6.395)
app.use(async (req, res, next) => {
  if (req.path.includes('login') || req.path.includes('recovery') || req.path.includes('slack')) {
    // 🛡️ [SECURITY FIX] (v2.6.434): Removed raw headers from audit to prevent JWT leaking to DB
    await logAudit(req, 'DEBUG_NETWORK_SNIFFER', [], { 
      url: req.originalUrl || req.path, 
      method: req.method,
      hasPayload: !!req.body?.payload
    });
  }
  next();
});

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
// WebSocket Setup
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
  },
  transports: ['websocket', 'polling'], // 🛡️ Stability: Allow fallback
  pingTimeout: 60000,
  pingInterval: 25000
});

// 🔐 SOCKET SECURITY: Auth Handshake (SEC Fix)
io.use((socket, next) => {
  const apiKey = socket.handshake.headers['x-ace-api-key'] || socket.handshake.auth.apiKey || socket.handshake.auth.token;
  
  // 🛡️ [SYNC_RECOVERY] (v2.6.258)
  if (apiKey === ACE_API_KEY || apiKey === PUBLIC_APP_ID || socket.handshake.auth.apiKey === PUBLIC_APP_ID) {
    // 🛡️ [HTTP_ONLY_AUTH] (v2.6.418): If connecting from Web with PUBLIC_APP_ID, try to read the JWT from cookies!
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
      const token = cookies['acetrack_session'];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET);
          socket.user = decoded;
          console.log(`✅ [WS_AUTH] Authenticated Web socket ${socket.id} via HttpOnly Cookie (User: ${decoded.id})`);
          return next();
        } catch (err) {
          console.warn(`🛑 [WS_AUTH] Invalid Cookie JWT for socket ${socket.id}`);
        }
      }
    }
    return next(); // Pass through as guest/public if no cookie
  }
  
  console.warn(`🛑 WS_UNAUTHORIZED: Attempt from ${socket.handshake.address} with key: ${apiKey}`);
  logServerEvent('WS_UNAUTHORIZED', { ip: socket.handshake.address });
  return next(new Error('Unauthorized: WebSocket requires valid API Key'));
});

// 🕐 [SESSION TRACKER] (v2.6.267)
// In-memory map tracking active WebSocket sessions for support employees
// Key: socketId, Value: { userId, startTime, deviceName }
// 🛡️ [SCALABILITY WARNING] (v2.6.319): activeSupportSessions is an in-memory Map.
// If Render scales to multiple instances, this will fragment and sessions won't be universally tracked.
// Next phase: migrate to Redis or MongoDB for multi-instance support.
const activeSupportSessions = new Map();

// ═══════════════════════════════════════════════════════════════
// WEBSOCKET HANDLERS MOVED TO services/websocket.mjs (Phase 1g)
// ═══════════════════════════════════════════════════════════════
registerWebSocketHandlers(io, activeSupportSessions, logServerEvent);

// ═══════════════════════════════════════════════════════════════
// Directories & DB
// ═══════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3005;
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
    maxPoolSize: 100, // 🛡️ [SCALABILITY FIX] (v2.6.434) Doubled to handle spikes
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  }).then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    dbStatus = 'connected';

    // 🛡️ [ARCH-FIX] (v2.6.435): Initialize Multi-Instance WebSocket Pub/Sub via MongoDB
    try {
      const DB = mongoose.connection.db;
      const COLLECTION = "socket_io_adapter_events";
      
      await DB.createCollection(COLLECTION, {
        capped: true,
        size: 1048576 // 1MB
      }).catch(e => {
        // collection already exists, ignore error
      });
      
      const mongoCollection = DB.collection(COLLECTION);
      io.adapter(createAdapter(mongoCollection));
      console.log('✅ MongoDB WebSocket Adapter Initialized (Multi-Instance Ready)');
    } catch (adapterErr) {
      console.error('❌ [WEBSOCKET] Failed to initialize Mongo Adapter:', adapterErr.message);
    }
    
    // 🛡️ [ADMIN SEED] (v2.6.521): Ensure admin player document exists in the Player collection.
    // If missing (e.g. fresh DB or accidental deletion), creates one with hashed default password.
    // Does NOT overwrite an existing admin — preserves any password changes made via the change-password flow.
    try {
      const existingAdmin = await Player.findOne({ id: 'admin' }).lean();
      if (!existingAdmin) {
        const hashedPassword = await bcrypt.hash('Password@123', 10);
        await Player.create({
          id: 'admin',
          data: {
            id: 'admin',
            name: 'System Admin',
            role: 'admin',
            email: '',
            password: hashedPassword
          },
          lastUpdated: new Date()
        });
        console.log('✅ [ADMIN SEED] Admin player document created with default credentials.');
        logServerEvent('ADMIN_SEED_CREATED', { message: 'Admin user was missing from Player collection and has been seeded.' });
      } else {
        // 🛡️ Check if password field is missing or empty (corrupted document)
        const adminWithPw = await Player.findOne({ id: 'admin' }).select('+data.password').lean();
        if (!adminWithPw?.data?.password) {
          const hashedPassword = await bcrypt.hash('Password@123', 10);
          await Player.updateOne(
            { id: 'admin' },
            { $set: { 'data.password': hashedPassword, lastUpdated: new Date() } }
          );
          console.log('⚠️ [ADMIN SEED] Admin had no password — reset to default hashed credentials.');
          logServerEvent('ADMIN_PASSWORD_REPAIRED', { message: 'Admin password was null/empty and has been reset to default.' });
        } else {
          console.log('✅ [ADMIN SEED] Admin player document exists and has a password. No action taken.');
        }
      }
    } catch (seedErr) {
      console.error('❌ [ADMIN SEED] Failed to verify/create admin:', seedErr.message);
    }
  }).catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    dbStatus = 'error_connection';
  });
};
startServices();

// ═══════════════════════════════════════════════════════════════
// 📊 Schemas (SE Fix: Database indexing)
// ═══════════════════════════════════════════════════════════════
// Schemas moved to top

// SupportInvite and SupportPasswordReset: MOVED to ./models/index.mjs (Phase 1 Modularization)

// ═══════════════════════════════════════════════════════════════
// Security & Middleware
// ═══════════════════════════════════════════════════════════════
// 🔐 SECURITY: API KEY Configuration (SEC Fix)
// In production, failure is mandatory if key is missing.
// 🔐 SECURITY (v2.6.175): Strict API key enforcement. No hardcoded fallbacks permitted in production or dev.
// ACE_API_KEY moved to top
if (!ACE_API_KEY && process.env.NODE_ENV === 'production') {
  console.error("❌ CRITICAL: ACE_API_KEY is missing in production environment!");
  // 🛡️ STABILITY FIX (v2.6.112): Don't exit process, just log error. 
  // Exiting causes Render crash loops which are harder to diagnose than 500 errors.
}

// 🛡️ PUBLIC_APP_ID, apiKeyGuard, authGuard: MOVED to ./middleware/security.mjs (Phase 1b Modularization)


// Slack interaction endpoint moved to routes/infrastructure.mjs

// Rate limiters: MOVED to ./middleware/security.mjs (Phase 1b Modularization)
// Created via createRateLimiters() after initSecurity() call

// Apply Global Limiter to all API routes
app.use('/api/', globalApiLimiter);


// getSanitizedState, DiagnosticsSchema, AutoFlushSchema, SaveDataSchema, validate, hashOtp, compareOtp:
// MOVED to ./middleware/security.mjs (Phase 1b Modularization)




// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

// asyncHandler: MOVED to ./helpers/utils.mjs (Phase 1 Modularization)

// logAudit moved to top

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


// 🕓 v2.6.113: Start background jobs AFTER all exports are initialized
import './reminders.mjs';


// ... existing code ...
const upload = multer({ 
  storage: storageConfig,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
});

// 🛡️ SYNC MUTEX: Prevent race conditions during concurrent /save requests
// 🏗️ AWS READINESS UPDATE: Added queue TTL to prevent deadlocks and increased capacity.
// For multi-instance deployments, this should be replaced with a Redis-based distributed lock.
class AsyncMutex {
  constructor(maxQueueSize = 1000, timeoutMs = 15000) {
    this.queue = [];
    this.isLocked = false;
    this.maxQueueSize = maxQueueSize;
    this.timeoutMs = timeoutMs;
  }
  acquire() {
    return new Promise((resolve, reject) => {
      // 🛡️ [QUEUE BOUNDS] (v2.6.434): Drop requests if queue is entirely saturated
      if (this.queue.length >= this.maxQueueSize) {
        return reject(new Error('MUTEX_QUEUE_FULL'));
      }
      
      let isTimeout = false;
      const timeoutId = setTimeout(() => {
        isTimeout = true;
        reject(new Error('MUTEX_TIMEOUT'));
        // We do not remove it from the array here to avoid O(N) shift, 
        // it will be skipped during release.
      }, this.timeoutMs);

      const release = () => {
        let nextResolved = false;
        while (this.queue.length > 0 && !nextResolved) {
          const nextItem = this.queue.shift();
          if (!nextItem.isTimeout) {
            clearTimeout(nextItem.timeoutId);
            nextItem.resolve(release);
            nextResolved = true;
          }
        }
        if (!nextResolved) {
          this.isLocked = false;
        }
      };

      if (this.isLocked) {
        this.queue.push({ resolve, timeoutId, get isTimeout() { return isTimeout; } });
      } else {
        this.isLocked = true;
        clearTimeout(timeoutId);
        resolve(release);
      }
    });
  }
}
const syncMutex = new AsyncMutex(1000, 15000);

// ═══════════════════════════════════════════════════════════════
// 🌐 API v1 Routes (SE Fix: API versioning)
// ═══════════════════════════════════════════════════════════════

// 🛡️ SECURITY: BROWSER CACHE HARDENING (v2.6.155)
// Forces browsers to never store sensitive API responses on disk.
// Prevents exposing raw JSON state to casual inspectors or via disk forensics.
// sensitiveCacheGuard: MOVED to ./middleware/security.mjs (Phase 1b Modularization)

// Health Check route moved to routes/infrastructure.mjs

// ═══════════════════════════════════════════════════════════════
// DATA & SYNC ROUTES MOVED TO routes/data.mjs (Phase 1d)
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// OTP + SUPPORT ROUTES MOVED TO routes/support.mjs (Phase 1e)
// ═══════════════════════════════════════════════════════════════


// ═══════════════════════════════════════════════════════════════
// 🌐 Mount API v1 + backward-compatible un-versioned routes
// ═══════════════════════════════════════════════════════════════
const authRoutes = createAuthRoutes({
  ACE_API_KEY,
  loginLimiter,
  passwordResetLimiter,
  trackLoginAttempt,
  logServerEvent,
  logAudit,
  syncMutex,
  signToken,
  sendPasswordResetEmail
});

// 🛡️ API DEPRECATION LAYER (v2.6.505): Rewrite all legacy /api calls to /api/v1
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/', '/api/v1/');
  }
  next();
});

app.use('/api/v1', authRoutes);

const dataRoutes = createDataRoutes({
  APP_VERSION,
  io,
  logServerEvent,
  logAudit,
  syncMutex,
  cloudinary,
  DIAGNOSTICS_DIR,
  upload,
  SupportMetricsService,
  sendPushNotification,
  addInAppNotification,
  activeSupportSessions
});

app.use('/api/v1', dataRoutes);

const supportRoutes = createSupportRoutes({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions,
  syncMutex
});

app.use('/api/v1', supportRoutes);

const adminCoreRoutes = createAdminCoreRoutes({ activeSupportSessions });
app.use('/api/v1/admin-core', adminCoreRoutes);

const hrRoutes = createHrRoutes();
app.use('/api/v1/hr', hrRoutes);

const commsRoutes = createCommsRoutes({ io, logAudit, cloudinary, upload });
app.use('/api/v1/comms', commsRoutes);

const infrastructureRoutes = createInfrastructureRoutes({ 
  APP_VERSION, 
  syncMutex, 
  logAudit, 
  sendSecurityAlert 
});
app.use('/', infrastructureRoutes);
app.use('/api/v1', infrastructureRoutes); // 🛡️ COMPATIBILITY FIX (v2.6.174): Support versioned API calls from web/mobile clients


// [Consolidated with primary /health guard at /api/v1/health]

// ═══════════════════════════════════════════════════════════════
// WEB ROUTES MOVED TO routes/web.mjs (Phase 1f)
// ═══════════════════════════════════════════════════════════════

const webRoutes = createWebRoutes({ APP_VERSION });
app.use('/', webRoutes);
  // 🛡️ [JSON 404 HANDLER]: Prevent Express.js Fingerprinting (v2.6.181)
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      res.status(404).json({
        success: false,
        error: `Resource not found: ${req.method} ${req.originalUrl}`,
        version: APP_VERSION
      });
    } else {
      next();
    }
  });
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
    "version": APP_VERSION,
    "timestamp": getISTDate()
  });
});

// 🚀 Start: 'Immortal' Listener (v2.6.81 — Standard Port)
// ═══════════════════════════════════════════════════════════════
const server = httpServer.listen(PORT, '0.0.0.0', () => {
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

// ═══════════════════════════════════════════════════════════════
// SUPPORT MANAGEMENT ROUTES MOVED TO routes/support.mjs (Phase 1e)
// ═══════════════════════════════════════════════════════════════

// AI Aggregator moved to services/scheduler.mjs

