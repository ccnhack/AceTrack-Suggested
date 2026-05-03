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
import { AppState, AuditLog } from '../models/index.mjs';

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
      const decoded = jwt.verify(bearerToken, JWT_SECRET);
      
      // 🛡️ [ROLE-BASED LOCKDOWN CHECK] (v2.6.214)
      // Force logout and concurrent session validation
      if (decoded.role === 'admin' || decoded.role === 'support') {
         const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
         const targetUser = state?.data?.players?.find(p => p.id === decoded.id);
         
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

      req.user = decoded;
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
  const globalApiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { 
      success: false, 
      error: 'Too many requests. Your IP has been temporarily throttled for security.',
      version: appVersion
    }
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Password Attempt limit reached. Please try after sometime for security.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const otpLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 5,
    message: { error: 'Security Alert: Too many OTP attempts. Please wait 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many recovery attempts. Please try again in 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  return { globalApiLimiter, loginLimiter, otpLimiter, passwordResetLimiter };
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
  const canReadSupport = isAdmin || scopes.includes('read:support') || scopes.includes('read:basic');

  const sanitized = { ...fullData };

  // 1. Mask PII in Players (BOLA Protection)
  if (sanitized.players && Array.isArray(sanitized.players)) {
    sanitized.players = sanitized.players.map(p => {
      if (!p) return p;
      const isOwner = String(p.id).toLowerCase() === normalizedReqId;
      if (canReadPII || isOwner) return p;
      const { email, phone, password, pushTokens, devices, ...publicProfile } = p;
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
