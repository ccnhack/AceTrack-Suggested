/**
 * AceTrack Backend — server.mjs
 * 🏗️ Phase 2 Modularization (v2.6.620): Decomposed from 889 lines to ~250 lines.
 * Config, Firebase, Cloudinary, and Admin Seed extracted to dedicated modules.
 */
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/mongo-adapter';
import mongoSanitize from 'express-mongo-sanitize';
import helmet from 'helmet';
import compression from 'compression';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

// 🏗️ [PHASE 2 MODULARIZATION] (v2.6.620): Extracted config modules
import { APP_VERSION, ACE_API_KEY, JWT_SECRET, ALLOWED_ORIGINS, signToken } from './config/app.mjs';
import { initFirebase } from './config/firebase.mjs';
import { initCloudinary, cloudinary } from './config/cloudinary.mjs';
import { seedAdmin } from './boot/adminSeed.mjs';

// Services & Helpers
import { sendPushNotification } from './notifications.js';
import { sendPasswordResetEmail, sendCoachInviteEmail } from './emailService.mjs';
import { logAudit, logServerEvent, sendSecurityAlert } from './services/AuditService.mjs';
import { loginAttempts, trackLoginAttempt } from './services/LoginTracker.mjs';
import SupportMetricsService from './services/SupportMetricsService.mjs';
import { AppState, Player } from './models/index.mjs';
import { getISTDate, addInAppNotification } from './helpers/utils.mjs';
import {
  initSecurity, PUBLIC_APP_ID,
  apiKeyGuard, authGuard, sensitiveCacheGuard,
  createRateLimiters,
  generateCsrfToken, csrfGuard
} from './middleware/security.mjs';

// Route modules
import createAuthRoutes from './routes/auth.mjs';
import createDataRoutes from './routes/data.mjs';
import createSupportRoutes from './routes/support.mjs';
import createAdminCoreRoutes from './routes/admin_core.mjs';
import createHrRoutes from './routes/hr.mjs';
import createCommsRoutes from './routes/comms.mjs';
import createWebRoutes from './routes/web.mjs';
import createInfrastructureRoutes from './routes/infrastructure.mjs';
import tournamentsRoutes from './routes/tournaments.mjs';
import evaluationsRoutes from './routes/evaluations.mjs';
import bookingsRoutes from './routes/bookings.mjs';
import registerWebSocketHandlers from './services/websocket.mjs';
import initScheduler from './services/scheduler.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

// ═══════════════════════════════════════════════════════════════
// Boot: Initialize third-party services
// ═══════════════════════════════════════════════════════════════
initCloudinary();
initFirebase();

// ═══════════════════════════════════════════════════════════════
// Security Middleware Initialization
// ═══════════════════════════════════════════════════════════════
initSecurity({ aceApiKey: ACE_API_KEY, jwtSecret: JWT_SECRET, appVersion: APP_VERSION, logAudit });
const { globalApiLimiter, loginLimiter, otpLimiter, passwordResetLimiter, phoneLookupLimiter } = createRateLimiters(APP_VERSION);

initScheduler(loginAttempts, sendSecurityAlert);

// 🛡️ STABILITY: Panic Handlers
process.on('uncaughtException', (err) => {
  console.error('🔥 [PANIC] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 [PANIC] Unhandled Rejection at:', promise, 'reason:', reason);
});

let dbStatus = 'connecting';

app.use(cookieParser());

// 🛡️ SECURITY: Global Hardening (v2.6.192)
app.disable('x-powered-by'); 
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64');
  next();
});

// HARDENED ROUTE GUARD
app.use((req, res, next) => {
  const path = req.path.toLowerCase();
  const sensitivePaths = ['/admin', '/debug', '/config', '/metrics', '/swagger', '/env', '/graphql', '/.env', '/config.php'];
  
  if (sensitivePaths.some(p => path.startsWith(p))) {
    const providedKey = req.headers['x-ace-api-key'] || req.query.key;
    const cookieToken = req.cookies?.acetrack_session;
    let isAuthorized = (providedKey === ACE_API_KEY);

    if (!isAuthorized && cookieToken) {
      try {
        const decoded = jwt.verify(cookieToken, JWT_SECRET, { issuer: 'acetrack-api', audience: 'acetrack-client' });
        if (decoded.role === 'admin' || decoded.role === 'support') {
          isAuthorized = true;
        }
      } catch (err) { /* Token invalid */ }
    }

    if (!isAuthorized) {
      logAudit(req, 'HARD_ROUTE_BLOCK', [], { path: req.path, ip: req.ip });
      console.warn(`🛑 Hard Block: Unauthorized access to ${req.path} from ${req.ip}`);
      const acceptHeader = req.headers['accept'] || '';
      if (acceptHeader.includes('text/html')) {
        return res.status(403).send(`<!DOCTYPE html><html><head><title>Access Denied | AceTrack</title><style>body{background:#0F172A;color:#94A3B8;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.card{background:#1E293B;padding:40px;border-radius:24px;text-align:center;max-width:400px;box-shadow:0 20px 25px -5px rgba(0,0,0,0.1);border:1px solid #334155}h1{color:#F8FAFC;margin:0 0 12px;font-size:24px}p{line-height:1.6;margin-bottom:24px}.btn{background:#6366F1;color:white;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold;display:inline-block;transition:background .2s}.btn:hover{background:#4F46E5}</style></head><body><div class="card"><h1>🛑 Access Denied</h1><p>Direct access to administrative routes is prohibited by the AceTrack security engine.</p><a href="/" class="btn">Return to Dashboard</a></div></body></html>`);
      }
      return res.status(403).json({ success: false, error: 'Forbidden: Direct access to administrative routes is prohibited.', code: 'HARD_ROUTE_BLOCK' });
    }
  }
  next();
});

// Security Headers
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

// CORS
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin === 'null') {
      console.warn(`🛑 CORS REJECTED: Malicious 'null' origin detected.`);
      return callback(new Error('CORS: null origin is not permitted for security reasons.'));
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn(`🛑 CORS Blocked: origin=${origin}`);
    return callback(new Error(`Not allowed by CORS: ${origin}`));
  },
  allowedHeaders: ['Content-Type', 'x-ace-api-key', 'x-socket-id', 'Authorization', 'x-user-id'],
  credentials: true
}));

// Body parsing & compression
app.use(compression());
app.use(express.json({ limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '10mb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// Request logger for sensitive paths
app.use(async (req, res, next) => {
  if (req.path.includes('login') || req.path.includes('recovery') || req.path.includes('slack')) {
    await logAudit(req, 'DEBUG_NETWORK_SNIFFER', [], { url: req.originalUrl || req.path, method: req.method, hasPayload: !!req.body?.payload });
  }
  next();
});

// MongoDB injection prevention
app.use((req, res, next) => {
  if (req.query) {
    Object.defineProperty(req, 'query', { value: { ...req.query }, writable: true, enumerable: true, configurable: true });
  }
  next();
});
app.use(mongoSanitize());

// HTTPS enforcement
app.use((req, res, next) => {
  if (req.headers['x-forwarded-proto'] && req.headers['x-forwarded-proto'] !== 'https' && process.env.NODE_ENV === 'production') {
    return res.redirect(301, 'https://' + req.hostname + req.url);
  }
  next();
});

// Database readiness guard
app.use((req, res, next) => {
  if (dbStatus !== 'connected' && req.path.startsWith('/api') && !req.path.endsWith('/health') && !req.path.endsWith('/status')) {
    return res.status(503).json({ error: "Service Warming Up", message: "Database connection in progress. Please retry in a few seconds.", status: dbStatus });
  }
  next();
});

// ═══════════════════════════════════════════════════════════════
// WebSocket Setup
// ═══════════════════════════════════════════════════════════════
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'x-ace-api-key', 'x-socket-id', 'Authorization'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// 🔐 SOCKET SECURITY: Auth Handshake
io.use((socket, next) => {
  const apiKey = socket.handshake.headers['x-ace-api-key'] || socket.handshake.auth.apiKey || socket.handshake.auth.token;
  if (apiKey === ACE_API_KEY || apiKey === PUBLIC_APP_ID || socket.handshake.auth.apiKey === PUBLIC_APP_ID) {
    const cookieHeader = socket.handshake.headers.cookie;
    if (cookieHeader) {
      const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
      const token = cookies['acetrack_session'];
      if (token) {
        try {
          const decoded = jwt.verify(token, JWT_SECRET, { issuer: 'acetrack-api', audience: 'acetrack-client' });
          socket.user = decoded;
          console.log(`✅ [WS_AUTH] Authenticated Web socket ${socket.id} via HttpOnly Cookie (User: ${decoded.id})`);
          return next();
        } catch (err) {
          console.warn(`🛑 [WS_AUTH] Invalid Cookie JWT for socket ${socket.id}`);
        }
      }
    }
    return next();
  }
  console.warn(`🛑 WS_UNAUTHORIZED: Attempt from ${socket.handshake.address} with key: ${apiKey}`);
  logServerEvent('WS_UNAUTHORIZED', { ip: socket.handshake.address });
  return next(new Error('Unauthorized: WebSocket requires valid API Key'));
});

registerWebSocketHandlers(io, logServerEvent);

// ═══════════════════════════════════════════════════════════════
// Database Connection & Boot
// ═══════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3005;
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIAGNOSTICS_DIR = path.join(__dirname, 'diagnostics');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);
if (!fs.existsSync(DIAGNOSTICS_DIR)) fs.mkdirSync(DIAGNOSTICS_DIR);

const startServices = async () => {
  const MONGODB_URI = process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    console.error("❌ MONGODB_URI is missing - Backend will stay in 503 state.");
    dbStatus = 'error_config';
    return;
  }

  console.log('📡 Connecting to MongoDB Atlas...');
  mongoose.connect(MONGODB_URI, {
    maxPoolSize: 100,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  }).then(async () => {
    console.log('✅ MongoDB Connected Successfully');
    dbStatus = 'connected';

    // Initialize Multi-Instance WebSocket Pub/Sub via MongoDB
    try {
      const DB = mongoose.connection.db;
      const COLLECTION = "socket_io_adapter_events";
      await DB.createCollection(COLLECTION, { capped: true, size: 1048576 }).catch(() => {});
      const mongoCollection = DB.collection(COLLECTION);
      io.adapter(createAdapter(mongoCollection));
      console.log('✅ MongoDB WebSocket Adapter Initialized (Multi-Instance Ready)');
    } catch (adapterErr) {
      console.error('❌ [WEBSOCKET] Failed to initialize Mongo Adapter:', adapterErr.message);
    }

    // Admin Seed (extracted to boot/adminSeed.mjs)
    await seedAdmin();
  }).catch(err => {
    console.error('❌ MongoDB Connection Error:', err.message);
    dbStatus = 'error_connection';
  });
};
startServices();

// ═══════════════════════════════════════════════════════════════
// Security validation
// ═══════════════════════════════════════════════════════════════
if (!ACE_API_KEY && process.env.NODE_ENV === 'production') {
  console.error("❌ CRITICAL: ACE_API_KEY is missing in production environment!");
}

app.use('/api/', globalApiLimiter);

// Static file serving
app.use((req, res, next) => { res.setHeader('Accept-Ranges', 'bytes'); next(); });
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
  filename: (req, file, cb) => { cb(null, `${Date.now()}-${file.originalname}`); }
});

import './reminders.mjs';

const upload = multer({ storage: storageConfig, limits: { fileSize: 50 * 1024 * 1024 } });

// 🛡️ SYNC MUTEX
class AsyncMutex {
  constructor(maxQueueSize = 1000, timeoutMs = 15000) {
    this.queue = [];
    this.isLocked = false;
    this.maxQueueSize = maxQueueSize;
    this.timeoutMs = timeoutMs;
  }
  acquire() {
    return new Promise((resolve, reject) => {
      if (this.queue.length >= this.maxQueueSize) return reject(new Error('MUTEX_QUEUE_FULL'));
      let isTimeout = false;
      const timeoutId = setTimeout(() => { isTimeout = true; reject(new Error('MUTEX_TIMEOUT')); }, this.timeoutMs);
      const release = () => {
        let nextResolved = false;
        while (this.queue.length > 0 && !nextResolved) {
          const nextItem = this.queue.shift();
          if (!nextItem.isTimeout) { clearTimeout(nextItem.timeoutId); nextItem.resolve(release); nextResolved = true; }
        }
        if (!nextResolved) this.isLocked = false;
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
// Route Mounting
// ═══════════════════════════════════════════════════════════════
app.use((req, res, next) => {
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/v1/')) {
    req.url = req.url.replace('/api/', '/api/v1/');
  }
  next();
});

app.get('/api/csrf-token', apiKeyGuard, generateCsrfToken);
app.use('/api/v1/admin', csrfGuard);
app.use('/api/support', csrfGuard);
app.use('/api/comms', csrfGuard);

app.use('/api/v1', createAuthRoutes({ ACE_API_KEY, loginLimiter, passwordResetLimiter, phoneLookupLimiter, trackLoginAttempt, logServerEvent, logAudit, syncMutex, signToken, sendPasswordResetEmail }));
app.use('/api/v1', createDataRoutes({ APP_VERSION, io, logServerEvent, logAudit, syncMutex, cloudinary, DIAGNOSTICS_DIR, upload, SupportMetricsService, sendPushNotification, addInAppNotification, sendCoachInviteEmail }));
app.use('/api/v1', createSupportRoutes({ io, logServerEvent, logAudit, cloudinary, upload, otpLimiter, SupportMetricsService, syncMutex }));
app.use('/api/v1/admin-core', createAdminCoreRoutes());
app.use('/api/v1/hr', createHrRoutes());
app.use('/api/v1/comms', createCommsRoutes({ io, logAudit, cloudinary, upload }));

const infrastructureRoutes = createInfrastructureRoutes({ APP_VERSION, syncMutex, logAudit, sendSecurityAlert });
app.use('/', infrastructureRoutes);
app.use('/api/v1', infrastructureRoutes);

app.use('/api/v1/tournaments', apiKeyGuard, tournamentsRoutes({ io }));
app.use('/api/v1/evaluations', apiKeyGuard, evaluationsRoutes({ io }));
app.use('/api/v1/bookings', apiKeyGuard, authGuard, bookingsRoutes);

const webRoutes = createWebRoutes({ APP_VERSION });
app.use('/', webRoutes);

// 404 Handler
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    res.status(404).json({ success: false, error: `Resource not found: ${req.method} ${req.originalUrl}`, version: APP_VERSION });
  } else {
    next();
  }
});

// Centralized Error Handler
app.use((err, req, res, next) => {
  const status = err.status || 500;
  const message = err.message || 'Internal Server Error';
  if (status >= 500) {
    console.error(`❌ [SERVER_ERROR] ${req.method} ${req.url}:`, err.stack);
    logServerEvent('CRITICAL_ERROR', { url: req.url, error: message });
  }
  res.status(status).json({ "success": false, "error": message, "version": APP_VERSION, "timestamp": getISTDate() });
});

// ═══════════════════════════════════════════════════════════════
// Start Server
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
