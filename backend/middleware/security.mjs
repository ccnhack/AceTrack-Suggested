/**
 * MIDDLEWARE: Security Guards, Rate Limiters, Validation
 * Extracted from server.mjs (v2.6.315 Phase 1b Modularization)
 * 
 * Contains all authentication, authorization, and request validation middleware.
 */
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppState, AuditLog, Player, RateLimit } from '../models/index.mjs';

class CustomMongoStore {
  constructor() {
    this.windowMs = 15 * 60 * 1000;
  }

  init(options) {
    if (options && options.windowMs) {
      this.windowMs = options.windowMs;
    }
  }

  async increment(key) {
    const now = new Date();
    const expireAt = new Date(now.getTime() + this.windowMs);

    try {
      const record = await RateLimit.findOneAndUpdate(
        { key },
        { 
          $inc: { hits: 1 },
          $setOnInsert: { expireAt }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      if (record.expireAt < now) {
        await RateLimit.updateOne({ key }, { $set: { hits: 1, expireAt } });
        return { totalHits: 1, resetTime: expireAt };
      }

      return { totalHits: record.hits, resetTime: record.expireAt };
    } catch (error) {
      console.error("[RateLimiter] Error incrementing:", error);
      return { totalHits: 1, resetTime: expireAt };
    }
  }

  async decrement(key) {
    await RateLimit.updateOne({ key }, { $inc: { hits: -1 } }).catch(() => {});
  }

  async resetKey(key) {
    await RateLimit.deleteOne({ key }).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// 🔑 Configuration (injected from server.mjs at boot)
// ═══════════════════════════════════════════════════════════════
let ACE_API_KEY = '';
let JWT_SECRET = '';
let APP_VERSION = '';
let logAuditFn = async () => {};

/**
 * Initialize the security module with runtime dependencies.
 * Called once from server.mjs during startup.
 */
export const initSecurity = ({ aceApiKey, jwtSecret, appVersion, logAudit }) => {
  ACE_API_KEY = aceApiKey;
  JWT_SECRET = jwtSecret;
  APP_VERSION = appVersion;
  logAuditFn = logAudit;
};

// 🛡️ SECURITY: ZERO-EXPOSURE ARCHITECTURE (v2.6.184)
// The PUBLIC_APP_ID is non-sensitive and used only for initial handshakes (Login/OTP).
export const PUBLIC_APP_ID = "AceTrack_Client_v2_Production";

// ═══════════════════════════════════════════════════════════════
// 🛡️ API Key Guard (v2.6.190 — Zero-Trust Architecture)
// ═══════════════════════════════════════════════════════════════
export const apiKeyGuard = async (req, res, next) => {
  const providedKey = req.headers['x-ace-api-key'];
  const userId = req.headers['x-user-id'];
  const authHeader = req.headers['authorization'];
  const bearerToken = (authHeader && authHeader.startsWith('Bearer ')) 
    ? authHeader.substring(7) 
    : (req.query.token || req.cookies?.acetrack_session || null);
  const path = req.path;
  
  // 🔍 LOGGED: Audit all API key requests
  console.log(`[AUTH] Guard Check: ${req.method} ${path} | Key: ${providedKey ? 'PROVIDED' : 'MISSING'} | JWT: ${bearerToken ? 'PROVIDED' : 'MISSING'}`);
  if (Object.keys(req.cookies || {}).length > 0) {
    console.log(`[AUTH] Cookies detected:`, Object.keys(req.cookies));
  } else {
    console.log(`[AUTH] No cookies detected in request.`);
  }

  // 1. JWT TOKEN (v2.6.190): High-security authenticated session
  if (bearerToken) {
    try {
      // 🛡️ [VAPT-F21] (v2.6.556): Validate issuer & audience claims
      const decoded = jwt.verify(bearerToken, JWT_SECRET, {
        issuer: 'acetrack-api',
        audience: 'acetrack-client'
      });
      
      // 🛡️ [PERFORMANCE FIX] (v2.6.325): Targeted Player.findOne is sub-ms.
      // 🛡️ [HIERARCHY ENRICHMENT] (v2.6.445): Hoisted outside role-check block so
      // supportLevel is always available on req.user for HR/hierarchy routes.
      const playerDoc = await Player.findOne({ id: decoded.id }).lean();
      const targetUser = playerDoc?.data;

      // 🛡️ [ROLE-BASED LOCKDOWN CHECK] (v2.6.214)
      // Force logout and concurrent session validation
      if (decoded.role === 'admin' || decoded.role === 'support') {
         if (targetUser) {
            // 1. Force Logout Verification
            if (targetUser.lastForceLogoutAt && (decoded.iat * 1000) < targetUser.lastForceLogoutAt) {
               console.warn(`🛑 Session Blocked: JWT for ${decoded.role} issued before force-logout timestamp.`);
               return res.status(401).json({ error: 'Session invalidated by security action. Please login again.' });
            }

             // 2. Status Guard: Block terminated/suspended accounts (v2.6.238)
             if (targetUser.role === 'support' && (targetUser.supportStatus === 'terminated' || targetUser.supportStatus === 'suspended')) {
                console.warn(`🛑 Access Denied: Authenticated request from ${targetUser.supportStatus} account ${targetUser.id}`);
                return res.status(403).json({ error: 'Access Denied: Your account has been deactivated.' });
             }

             // 3. Concurrent Session Verification (Support Only - v2.6.214)
            if (decoded.role === 'support' && decoded.jti) {
               const activeSessions = targetUser.activeSessions || [];
               const isSessionActive = activeSessions.some(s => s.jti === decoded.jti);
               if (!isSessionActive) {
                  console.warn(`🛑 Session Evicted: Support user ${decoded.id} exceeded concurrent limit.`);
                  return res.status(401).json({ error: 'Session invalidated: Maximum concurrent sessions (2) exceeded.' });
               }
            }
         }
      }

      // 🛡️ [HIERARCHY ENRICHMENT] (v2.6.445): Enrich req.user with supportLevel/designation
      // from the DB lookup. Without this, HR routes checking req.user.supportLevel
      // (e.g., manager leave approvals) always get undefined because JWT doesn't carry it.
      req.user = { ...decoded };
      if (targetUser) {
        req.user.supportLevel = targetUser.supportLevel || '';
        req.user.designation = targetUser.designation || '';
        req.user.managerId = targetUser.managerId || '';
        req.user.name = targetUser.name || '';
      }
      req.userId = decoded.id;
      req.userRole = decoded.role;

      // 🛡️ [SUPPORT ACCESS GUARD] (v2.6.194)
      const sensitivePaths = ['/api/diagnostics', '/api/logs', '/api/backup', '/api/config', '/api/admin', '/api/audit'];
      if (sensitivePaths.some(p => path.toLowerCase().startsWith(p)) && req.userRole === 'support') {
          await logAuditFn(req, 'SENSITIVE_ACCESS_ATTEMPT', [], { url: req.originalUrl || req.url, method: req.method, role: req.userRole });
          return res.status(403).json({ error: 'Access Denied: Support role cannot access administrative endpoints.' });
      }

      return next();
    } catch (err) {
      console.warn(`🛑 Invalid JWT from ${req.ip}: ${err.message}`);
      return res.status(401).json({ error: 'Session expired or invalid. Please login again.' });
    }
  }

  // 2. MASTER KEY: Full access for administrative/emergency use (from ENV)
  if (providedKey && providedKey === ACE_API_KEY) {
    req.user = { id: 'admin', role: 'admin', scopes: ['*'] };
    req.userId = 'admin';
    req.userRole = 'admin';
    return next();
  }

  // 3. PUBLIC BOOTSTRAP: Allow Handshake flows using the Public App ID (v2.6.210)
  const isPublicRoute = path.includes('/login') || 
                        path.includes('/otp') || 
                        path.includes('/health') || 
                        path.includes('/status') || 
                        path.includes('/data') || 
                        path.includes('/support/session-status') ||
                        path.includes('/support/ai-summary') ||
                        path.includes('/slack/interact') ||
                        (req.method === 'POST' && path.includes('/diagnostics'));
  if (isPublicRoute && providedKey === PUBLIC_APP_ID) {
    return next();
  }

  // 4. REJECT: All other unauthorized attempts
  await logAuditFn(req, 'UNAUTHORIZED_ACCESS_BLOCKED', [], { ip: req.ip, url: req.originalUrl || req.url, method: req.method });
  console.warn(`🛑 Unauthorized access attempt from ${req.ip} - Rejected by Zero-Exposure Guard`);
  return res.status(401).json({ 
    success: false, 
    error: 'Unauthorized. Please login again.',
    suggestion: 'Clear your browser cache if this persists.'
  });
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ Auth Guard — Ensures req.userRole was set by apiKeyGuard
// ═══════════════════════════════════════════════════════════════
export const authGuard = (req, res, next) => {
  if (!req.userRole) {
    return res.status(401).json({ error: 'Authentication required. Please login again.' });
  }
  next();
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ Rate Limiters (v2.6.185)
// ═══════════════════════════════════════════════════════════════
export const createRateLimiters = (appVersion) => {
  const skipTestRequests = (req) => {
    // 🛡️ [VAPT-F03] (v2.6.556): Rate limit bypass DISABLED in production.
    // In non-production, requires TEST_BYPASS_SECRET env var to match.
    if (process.env.NODE_ENV === 'production') return false;
    const bypassSecret = process.env.TEST_BYPASS_SECRET;
    if (!bypassSecret) return false;
    return req.headers['x-ace-test-bypass'] === bypassSecret;
  };

  const globalApiLimiter = rateLimit({
    store: new CustomMongoStore(),
    windowMs: 1 * 60 * 1000,
    max: 400,
    skip: skipTestRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
      success: false, 
      error: 'Too many requests. Your IP has been temporarily throttled for security.',
      version: appVersion
    }
  });

  const loginLimiter = rateLimit({
    store: new CustomMongoStore(),
    windowMs: 15 * 60 * 1000,
    max: 20,
    skip: skipTestRequests,
    message: { error: 'Password Attempt limit reached. Please try after sometime for security.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const otpLimiter = rateLimit({
    store: new CustomMongoStore(),
    windowMs: 10 * 60 * 1000,
    max: 5,
    skip: skipTestRequests,
    message: { error: 'Security Alert: Too many OTP attempts. Please wait 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const passwordResetLimiter = rateLimit({
    store: new CustomMongoStore(),
    windowMs: 15 * 60 * 1000,
    max: 5,
    skip: skipTestRequests,
    message: { error: 'Too many recovery attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const phoneLookupLimiter = rateLimit({
    store: new CustomMongoStore(),
    windowMs: 5 * 60 * 1000,
    max: 10,
    skip: skipTestRequests,
    message: { success: false, error: 'Too many phone lookups. Please try again after 5 minutes to prevent abuse.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  return { globalApiLimiter, loginLimiter, otpLimiter, passwordResetLimiter, phoneLookupLimiter };
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ PRIVACY GUARD: getSanitizedState (v2.6.165)
// ═══════════════════════════════════════════════════════════════
export const getSanitizedState = (fullData, req) => {
  if (!fullData) return {};
  
  const reqUserId = req.userId || req.headers?.['x-user-id'];
  const reqUserRole = req.userRole || (String(reqUserId).toLowerCase() === 'admin' ? 'admin' : null);
  const scopes = req.user?.scopes || (reqUserRole === 'admin' ? ['*'] : []);

  const normalizedReqId = String(reqUserId || '').toLowerCase();
  const isAdmin = reqUserRole === 'admin' || normalizedReqId === 'admin' || scopes.includes('*');
  const canReadPII = isAdmin || scopes.includes('read:pii');
  const canReadSupport = isAdmin || reqUserRole === 'support' || scopes.includes('read:support') || scopes.includes('read:basic');

  const sanitized = { ...fullData };

  // 1. Mask PII in Players (BOLA Protection)
  if (sanitized.players && Array.isArray(sanitized.players)) {
    sanitized.players = sanitized.players.map(p => {
      if (!p) return p;
      const isOwner = String(p.id).toLowerCase() === normalizedReqId;
      const { email, phone, password, pushTokens, devices, ...publicProfile } = p;
      if (canReadPII || isOwner) {
        // 🛡️ ARCHITECTURE FIX (v2.6.527): NEVER return passwords over the network
        const { password: _password, ...safeProfile } = p;
        return safeProfile;
      }
      return publicProfile;
    });
  }

  // 2. Filter Support Tickets (Principle of Least Privilege)
  if (sanitized.supportTickets && Array.isArray(sanitized.supportTickets)) {
    sanitized.supportTickets = sanitized.supportTickets.filter(t => {
      if (canReadSupport) return true;
      return String(t.userId).toLowerCase() === normalizedReqId;
    });
  }

  // 3. Filter Matches
  if (sanitized.matches && Array.isArray(sanitized.matches)) {
    sanitized.matches = sanitized.matches.filter(m => {
      if (isAdmin) return true;
      const p1 = String(m.player1Id || m.challengerId || '').toLowerCase();
      const p2 = String(m.player2Id || m.opponentId || '').toLowerCase();
      return p1 === normalizedReqId || p2 === normalizedReqId;
    });
  }

  // 4. Filter Evaluations
  if (sanitized.evaluations && Array.isArray(sanitized.evaluations)) {
    sanitized.evaluations = sanitized.evaluations.filter(e => {
      if (isAdmin) return true;
      return String(e.playerId).toLowerCase() === normalizedReqId;
    });
  }

  // 5. Restrict Audit Logs
  if (sanitized.auditLogs && Array.isArray(sanitized.auditLogs)) {
    if (!isAdmin) {
      sanitized.auditLogs = sanitized.auditLogs.filter(log => String(log.userId).toLowerCase() === normalizedReqId);
    }
  }

  // 6. Strict Chatbot Message Isolation (v2.6.257)
  if (sanitized.chatbotMessages) {
    if (isAdmin) {
      // Admin sees everything
    } else if (normalizedReqId && normalizedReqId !== 'guest') {
      const userThreads = {};
      if (sanitized.chatbotMessages[normalizedReqId]) {
        userThreads[normalizedReqId] = sanitized.chatbotMessages[normalizedReqId];
      }
      sanitized.chatbotMessages = userThreads;
    } else {
      sanitized.chatbotMessages = {};
    }
  }

  // 7. Global Shield: If unauthenticated, clear all sensitive collections (v2.6.257)
  if (!normalizedReqId || normalizedReqId === 'guest') {
    if (!isAdmin) {
      sanitized.players = [];
      sanitized.matches = [];
      sanitized.supportTickets = [];
      sanitized.evaluations = [];
      sanitized.auditLogs = [];
      sanitized.matchmaking = [];
      sanitized.seenAdminActionIds = [];
      sanitized.visitedAdminSubTabs = [];
    }
  }

  return sanitized;
};

// ═══════════════════════════════════════════════════════════════
// 📋 Zod Validation Schemas (SE/SEC Fix #5)
// ═══════════════════════════════════════════════════════════════
export const DiagnosticsSchema = z.object({
  username: z.string().min(1).max(100),
  logs: z.any(),
  prefix: z.string().optional(),
  deviceId: z.string().max(200).optional()
});

export const AutoFlushSchema = z.object({
  username: z.string().min(1).max(100),
  deviceId: z.string().max(200).optional(),
  logs: z.array(z.object({
    timestamp: z.string(),
    level: z.string(),
    type: z.string(),
    message: z.string()
  })).min(1)
});

export const SaveDataSchema = z.object({
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
export const validate = (schema) => (req, res, next) => {
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

// 🛡️ Sensitive Cache Guard: Prevent caching of API responses
export const sensitiveCacheGuard = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ [VAPT-F09] (v2.6.556): CSRF Protection for Web Admin/Support
// Uses double-submit cookie pattern. Token generated on GET /api/csrf-token,
// validated on state-changing requests from web origins.
// ═══════════════════════════════════════════════════════════════
import crypto from 'crypto';

const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_COOKIE_NAME = 'acetrack_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

export const attachCsrfCookie = (res) => {
  const token = crypto.randomBytes(32).toString('hex');
  const hmac = crypto.createHmac('sha256', CSRF_SECRET).update(token).digest('hex');
  const csrfValue = `${token}.${hmac}`;
  
  res.cookie(CSRF_COOKIE_NAME, csrfValue, {
    httpOnly: false, // Must be readable by JS to send as header
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 4 * 60 * 60 * 1000 // 4 hours
  });
  
  return csrfValue;
};

export const generateCsrfToken = (req, res) => {
  const csrfValue = attachCsrfCookie(res);
  res.json({ success: true, csrfToken: csrfValue });
};

export const csrfGuard = (req, res, next) => {
  // Skip CSRF for non-browser requests (mobile app uses Authorization header, no cookies)
  const origin = req.headers.origin || '';
  const isWebRequest = origin.includes('localhost') || origin.includes('render.com') || origin.includes('acetrack');
  const hasCookie = !!req.cookies?.acetrack_session;
  
  // Only enforce CSRF for web-based cookie-authenticated requests
  if (!isWebRequest && !hasCookie) return next();
  
  // Skip safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  
  const headerToken = req.headers[CSRF_HEADER_NAME];
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  
  if (!headerToken || !cookieToken) {
    console.warn(`🛑 [CSRF] Missing token. Header: ${!!headerToken}, Cookie: ${!!cookieToken}, Path: ${req.path}`);
    return res.status(403).json({ error: 'CSRF validation failed. Please refresh the page.' });
  }
  
  // Validate double-submit: header token must match cookie token
  if (headerToken !== cookieToken) {
    console.warn(`🛑 [CSRF] Token mismatch on ${req.path}`);
    return res.status(403).json({ error: 'CSRF validation failed. Token mismatch.' });
  }
  
  // Validate HMAC integrity
  const parts = headerToken.split('.');
  if (parts.length !== 2) {
    return res.status(403).json({ error: 'CSRF validation failed. Malformed token.' });
  }
  
  const [token, hmac] = parts;
  const expectedHmac = crypto.createHmac('sha256', CSRF_SECRET).update(token).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
    return res.status(403).json({ error: 'CSRF validation failed. Invalid signature.' });
  }
  
  next();
};
