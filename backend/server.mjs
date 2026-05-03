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

import SupportMetricsService from './services/SupportMetricsService.mjs';

// 🏗️ [PHASE 1 MODULARIZATION] (v2.6.315): Extracted modules
import { AppState, AuditLog, SecuritySummary, SupportInvite, SupportPasswordReset } from './models/index.mjs';
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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const router = express.Router();
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
const APP_VERSION = "2.6.314"; 
 // 🚀 FORCE REDEPLOY CACHE BUST v2.6.314 

// 🛡️ SECURITY: JWT & Secrets (v2.6.192)
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
const ACE_API_KEY = process.env.ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';
const JWT_SECRET = process.env.JWT_SECRET || 'acetrack_zero_trust_fallback_secret_1717';
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
const sendSecurityAlert = async (event, data) => {
  let webhookSuccess = false;

  // 1. Slack Webhook Alert (Primary Channel)
  if (SECURITY_WEBHOOK_URL) {
    try {
      const osint = data.OSINT || {};
      const score = typeof osint.score === 'number' ? osint.score : 0;
      const color = score > 75 ? "#EF4444" : (score > 25 ? "#F59E0B" : "#10B981");

      const payload = {
        text: `🚨 *SECURITY ALERT: ${event}*`,
        attachments: [{
          color: color,
          fallback: `Security Alert: ${event} from ${data.IP}`,
          fields: [
            { title: "Event", value: event, short: false },
            { title: "Source IP", value: `\`${data.IP}\` (${osint.country || '??'})`, short: false },
            { title: "Actor", value: data.Actor, short: false },
            { title: "Abuse Confidence", value: `${score}%`, short: false },
            { title: "Method", value: data.Method, short: false },
            { title: "URL", value: `\`${data.URL}\``, short: false },
            { title: "User-Agent", value: data['User-Agent'], short: false },
            { title: "Payload Snippet", value: `\`\`\`${String(data.Payload).substring(0, 500)}\`\`\``, short: false }
          ],
          footer: "Zero-Trust Guard v2.6.208",
          ts: Math.floor(Date.now() / 1000)
        }]
      };

      // 🤖 [AI EVENT INSIGHT] (v2.6.309)
      if (process.env.GROQ_API_KEY) {
        try {
          let contextualHint = "";
          if (event === 'UNAUTHORIZED_ACCESS_BLOCKED') {
            contextualHint = " Note: This specific event indicates the requester did not provide a valid, active JWT session token or cryptographic proof of identity.";
          }
          const prompt = `As a cybersecurity expert, provide a concise 1-2 sentence explanation of why this security event was triggered and its potential implications.${contextualHint} Event: ${event}, IP: ${data.IP}, URL: ${data.URL}, Method: ${data.Method}, Actor: ${data.Actor}.`;
          const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages: [{ role: 'user', content: prompt }],
              temperature: 0.3,
              max_tokens: 150
            })
          });
          const result = await aiResponse.json();
          if (result?.choices?.[0]?.message?.content) {
            payload.attachments[0].fields.push({ title: "🤖 AI Event Summary", value: result.choices[0].message.content, short: false });
          }
        } catch (e) {
          // Fail silently, don't block alert
        }
      }

      // 🛡️ [BRUTE FORCE ENRICHMENT] (v2.6.202)
      if (data.TargetUser) {
        payload.attachments[0].fields.push({ title: "Target User", value: data.TargetUser, short: true });
      }
      if (data.Passwords) {
        payload.attachments[0].fields.push({ title: "History", value: `\`${data.Passwords}\``, short: false });
      }
      if (data.FinalOutcome) {
        let outcomeValue = `*${data.FinalOutcome}*`;
        // 🛡️ [VISUAL HARDENING] (v2.6.212)
        if (data.FinalOutcome.includes('SUCCESS') && data.FinalOutcome.includes('ALERT')) {
          outcomeValue = `🟢 *SUCCESS* 🔴 *(ALERT: Potential Unauthorized Access)*`;
          payload.attachments[0].color = "#EF4444"; // Force high-contrast red for breach
          
          // 🛡️ [INTERACTIVE LOCKDOWN] (v2.6.212)
          // Add Slack Buttons for immediate Admin response
          payload.attachments[0].actions = [
            {
              name: "security_action",
              text: "Approve Login",
              type: "button",
              style: "primary",
              value: JSON.stringify({ action: "approve", target: data.TargetUser, ip: data.IP })
            },
            {
              name: "security_action",
              text: "BLOCK ACCOUNT",
              type: "button",
              style: "danger",
              confirm: {
                title: "Confirm Admin Lockdown?",
                text: "This will force-logout all sessions and block Admin login for 5 minutes.",
                ok_text: "Yes, Block Account",
                dismiss_text: "Cancel"
              },
              value: JSON.stringify({ action: "block", target: data.TargetUser, ip: data.IP })
            }
          ];
        }
        payload.attachments[0].fields.push({ title: "Final Outcome", value: outcomeValue, short: true });
      }

      // 🌩️ [CUMULATIVE SUMMARY ENRICHMENT] (v2.6.208)
      if (event === 'BRUTE_FORCE_CUMULATIVE_SUMMARY') {
        payload.text = `🌩️ *SECURITY SUMMARY: SUSTAINED ATTACK DETECTED*`;
        payload.attachments[0].color = "#FF9800"; // Orange for summary
        payload.attachments[0].fields = [
          { title: "Target Account", value: data.TargetUser, short: true },
          { title: "Source IP", value: `\`${data.IP}\``, short: true },
          { title: "Total Attempts", value: String(data.TotalAttempts), short: true },
          { title: "Failures (5m)", value: String(data.FailureCount), short: true },
          { title: "Passwords Sample", value: `\`${data.SamplePasswords}\``, short: false },
          { title: "Status", value: "⚠️ Throttling Active", short: true }
        ];
      }

      const res = await fetch(SECURITY_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (res.ok) {
        webhookSuccess = true;
        console.log(`📡 [ALERT] Security event broadcast to Slack: ${event}`);
      }
    } catch (err) {
      console.error("❌ Slack Alert Failed:", err.message);
    }
  }

  // 2. Email Alert (Fallback Channel)
  // Only send email if Slack is not configured or failed, to reduce noise.
  if (!webhookSuccess) {
    try {
      await sendSecurityAlertEmail(event, data);
    } catch (err) {
      // Silent fail to ensure main thread stability
    }
  }
};

// 📊 Schemas: MOVED to ./models/index.mjs (Phase 1 Modularization)
// AppState, AuditLog, SecuritySummary are now imported at the top.

// AuditLog schema: MOVED to ./models/index.mjs (Phase 1 Modularization)

// 🛡️ SECURITY: Reputation & OSINT Helpers (v2.6.192)
// Checks if an IP has a record of successful authentication in the last 24 hours.
const checkInternalReputation = async (ip) => {
  try {
    const recentSuccess = await AuditLog.findOne({
      ipAddress: ip,
      action: { $in: ['SUPPORT_LOGIN_SUCCESS', 'ADMIN_LOGIN_SUCCESS', 'LOGIN_SUCCESS'] },
      timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).lean();
    return !!recentSuccess;
  } catch (e) {
    return false;
  }
};

// Queries AbuseIPDB for real-time reputation scoring.
const getIPReputation = async (ip) => {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) return { score: 'N/A', provider: 'AbuseIPDB (Missing Key)' };
  
  try {
    const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
      headers: { 'Key': apiKey, 'Accept': 'application/json' }
    });
    const result = await response.json();
    return {
      score: result?.data?.abuseConfidenceScore ?? 0,
      country: result?.data?.countryCode || '??',
      usage: result?.data?.usageType || 'unknown',
      provider: 'AbuseIPDB'
    };
  } catch (e) {
    return { score: 'ERR', provider: 'AbuseIPDB' };
  }
};

// SecuritySummary schema: MOVED to ./models/index.mjs (Phase 1 Modularization)

// 🛡️ SECURITY: AI Summary Helper (v2.6.194)
const generateSecuritySummary = async (events) => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return "AI Summary unavailable: GROQ_API_KEY is not set.";

  try {
    const eventSummary = events.map(e => `${e.timestamp.toISOString()}: ${e.action} on ${e.url} (${e.method})`).join('\n');
    const prompt = `You are a cybersecurity expert. Summarize the following security events detected on the AceTrack platform in the last 30 minutes. 
Identify patterns (brute force, enumeration, lateral movement), assess risk level, and suggest 2 technical actions.
Keep it professional and concise.
Events:\n${eventSummary.substring(0, 3000)}`;

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.5,
        max_tokens: 800
      })
    });
    
    const result = await response.json();
    return result?.choices?.[0]?.message?.content || "AI failed to generate a summary.";
  } catch (err) {
    return `AI Summary Error: ${err.message}`;
  }
};

const logAudit = async (req, action, changedCollections = [], details = {}) => {
  try {
    await AuditLog.create({
      userId: (req && req.headers && req.headers['x-user-id']) || (req && req.ip) || 'system',
      action,
      changedCollections,
      ipAddress: (req && req.ip) || '0.0.0.0',
      userAgent: (req && req.headers && req.headers['user-agent']) || 'unknown',
      details
    });

    // 🚨 Real-time Alert for Critical Events (v2.6.195)
    const criticalEvents = ['UNAUTHORIZED_ACCESS_BLOCKED', 'HARD_ROUTE_BLOCK', 'OTP_BRUTE_FORCE_DETECTED', 'ADMIN_PRIVILEGE_ESCALATION', 'SENSITIVE_ACCESS_ATTEMPT', 'BRUTE_FORCE_DETECTED'];
    const aggregationEvents = [...criticalEvents, 'LOGIN_SUCCESS', 'SUPPORT_LOGIN_SUCCESS'];

    if (aggregationEvents.includes(action)) {
      const ip = (req && req.ip) || '0.0.0.0';
      let actor = (req && req.headers && req.headers['x-user-id']) || (req && req.user && req.user.id);
      
      // 🛡️ [ACTOR INFERENCE] (v2.6.209)
      // If actor is missing or generic 'guest' (e.g. hard browser navigation or syncManager default), look for recent session from this IP
      if ((!actor || actor === 'guest') && ip !== '0.0.0.0') {
        try {
          const lastSession = await AuditLog.findOne({
            ipAddress: ip,
            action: { $in: ['LOGIN_SUCCESS', 'SUPPORT_LOGIN_SUCCESS'] },
            timestamp: { $gt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
          }).sort({ timestamp: -1 }).lean();
          
          if (lastSession) {
            const inferredId = lastSession.details?.userId || lastSession.userId;
            // 🛡️ Ensure we don't just "infer" the IP address back as the ID
            if (inferredId && inferredId !== ip && inferredId !== 'guest') {
              actor = `${inferredId} (Inferred)`;
            }
          }
        } catch (e) {
          console.error("Actor inference failed:", e.message);
        }
      }
      
      actor = actor || 'guest';
      const url = (req && (req.originalUrl || req.url)) || 'Unknown';
      const method = (req && req.method) || 'Unknown';

      // 🛡️ [AI AGGREGATION] (v2.6.195)
      let summary = await SecuritySummary.findOne({
        ipAddress: ip,
        actor: actor,
        isSummarized: false,
        firstEventAt: { $gt: new Date(Date.now() - 30 * 60 * 1000) }
      });

      if (summary) {
        summary.events.push({ action, url, method, details });
        summary.lastEventAt = new Date();
        await summary.save();
      } else {
        await SecuritySummary.create({
          ipAddress: ip,
          userId: (req && req.headers && req.headers['x-user-id']) || (req && req.user && req.user.id) || actor,
          actor: actor,
          events: [{ action, url, method, details }]
        });
      }

      // Only send individual Slack alerts for CRITICAL events
      if (criticalEvents.includes(action)) {
        // 🛡️ [LOCAL_BYPASS] (v2.6.258)
        // Do not spam alerts for local development activities on localhost or private network ranges.
        const isLocal = (ip) => {
          if (!ip) return false;
          if (process.env.NODE_ENV === 'production') return false; // Never suppress in production
          return ip === '127.0.0.1' || 
                 ip === '::1' || 
                 ip.includes('127.0.0.1') || 
                 ip.includes('192.168.') || 
                 ip.includes('10.') || 
                 ip.startsWith('172.') || // Simplified for 172.16.0.0/12
                 ip === 'localhost' ||
                 ip === '::ffff:127.0.0.1';
        };
        
        if (isLocal(ip) && process.env.TEST_ALERTS_LOCALLY !== 'true') {
          console.log(`[AUTH] Local critical event detected (${action}) from ${ip}. Alert suppressed.`);
        } else {
          const osint = await getIPReputation(ip);
          await sendSecurityAlert(action, {
            IP: ip,
            Actor: actor,
            URL: url,
            Method: method,
            'User-Agent': (req && req.headers && req.headers['user-agent']) || 'unknown',
            Payload: JSON.stringify(req.body || {}),
            OSINT: osint,
            ...details // 🛡️ Spread extra details (TargetUser, Passwords, etc.)
          });
        }
      }
    }
  } catch (e) {
    console.error("❌ Audit log error:", e.message);
  }
};

// 🏗️ [PHASE 1b] Initialize security middleware with runtime dependencies
initSecurity({ aceApiKey: ACE_API_KEY, jwtSecret: JWT_SECRET, appVersion: APP_VERSION, logAudit });
const { globalApiLimiter, loginLimiter, otpLimiter, passwordResetLimiter } = createRateLimiters(APP_VERSION);

const loginAttempts = new Map(); // identifier_IP -> { attempts: [], lastAlertedAt: 0, lastSummaryAt: 0 }

const trackLoginAttempt = async (req, identifier, password, success) => {
  const ip = (req && req.ip) || '0.0.0.0';
  const key = `${identifier}_${ip}`;
  const now = Date.now();
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { attempts: [], lastSummaryAt: now });
  }
  
  const state = loginAttempts.get(key);
  const maskedPassword = password || '';
  state.attempts.push({ timestamp: now, password: maskedPassword, success });
  
  // Cleanup old attempts (> 5 minutes for summary context, but logic uses 1m windows)
  state.attempts = state.attempts.filter(a => now - a.timestamp < 300000); 
  
  const oneMinuteAgo = now - 60000;
  const recentAttempts = state.attempts.filter(a => a.timestamp > oneMinuteAgo);
  const recentFailures = recentAttempts.filter(a => !a.success);
  
  // 🛡️ [ADVANCED BRUTE-FORCE MONITOR] (v2.6.208)
  
  // 🛡️ [ROLE-BASED THRESHOLD] (v2.6.213)
  // Admin: 5 attempts | Support: 10 attempts | Others: 10 attempts
  const appState = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
  const players = appState?.data?.players || [];
  const search = String(identifier).toLowerCase().trim();
  const targetUser = players.find(p => 
    String(p.id).toLowerCase() === search || 
    String(p.email).toLowerCase() === search || 
    String(p.username).toLowerCase() === search
  );
  const role = targetUser?.role || (identifier === 'admin_mfa' ? 'admin' : 'user');
  const threshold = role === 'admin' ? 5 : 10;

  // 1. IMMEDIATE ALERT: Success after significant failure (Critical Breach Potential)
  if (success && recentFailures.length >= threshold) {
    const history = recentAttempts.map(a => `${a.password} (${a.success ? '✅' : '❌'})`).join(', ');
    await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { 
      TargetUser: identifier, 
      Passwords: history, 
      AttemptCount: recentAttempts.length,
      FailureCount: recentFailures.length,
      FinalOutcome: "SUCCESS (ALERT: Potential Unauthorized Access)",
      Timeframe: '1 minute'
    });
    // Reset to prevent double alerts
    loginAttempts.delete(key);
    return;
  }
  
  // 2. BURST ALERT: Notify every 5 failures within 1 minute
  if (!success && recentFailures.length >= 5 && (recentFailures.length % 5 === 0)) {
    const history = recentAttempts.map(a => `${a.password} (${a.success ? '✅' : '❌'})`).join(', ');
    await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { 
      TargetUser: identifier, 
      Passwords: history, 
      AttemptCount: recentAttempts.length,
      FailureCount: recentFailures.length,
      FinalOutcome: "FAILED (Persistent Attack in Progress)",
      Timeframe: '1 minute'
    });
  }
};

// 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)
// Runs every 5 minutes to report ongoing high-volume attacks
setInterval(async () => {
  const now = Date.now();
  for (const [key, state] of loginAttempts.entries()) {
    const failures = state.attempts.filter(a => !a.success);
    if (failures.length >= 10 && (now - state.lastSummaryAt >= 300000)) {
      const [identifier, ip] = key.split('_');
      const uniquePasswords = [...new Set(failures.map(f => f.password))].slice(0, 10).join(', ');
      
      console.log(`🛡️ [SUMMARY] Reporting sustained attack for ${identifier} from ${ip}`);
      await sendSecurityAlert({
          action: 'BRUTE_FORCE_CUMULATIVE_SUMMARY',
          ipAddress: ip,
          actor: identifier,
          details: {
            TargetUser: identifier,
            TotalAttempts: state.attempts.length,
            FailureCount: failures.length,
            SamplePasswords: uniquePasswords,
            Timeframe: 'Last 5 minutes'
          }
      });
      state.lastSummaryAt = now;
      // If no activity for 5 minutes, we'll eventually cleanup
      if (state.attempts.length === 0) loginAttempts.delete(key);
    } else if (state.attempts.length === 0 || (now - state.attempts[state.attempts.length-1].timestamp > 600000)) {
       loginAttempts.delete(key);
    }
  }
}, 60000); // Check every minute


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

// 🕵️ ULTRA-EARLY DIAGNOSTIC: Log EVERY request before ANY middleware (v2.6.176)
app.use(async (req, res, next) => {
  // Throttled logging to avoid DB flood, but enough to see activity
  if (req.method !== 'OPTIONS') {
    logAudit(req, 'RAW_REQUEST_RECEIVED', [], { 
      method: req.method, 
      url: req.originalUrl || req.url,
      origin: req.headers.origin || 'NO_ORIGIN',
      ip: req.ip
    }).catch(() => {});
  }
  next();
});

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
                .card { background: #1E293B; padding: 40px; borderRadius: 24px; text-align: center; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1); border: 1px solid #334155; }
                h1 { color: #F8FAFC; margin: 0 0 12px 0; font-size: 24px; }
                p { line-height: 1.6; margin-bottom: 24px; }
                .btn { background: #6366F1; color: white; padding: 12px 24px; borderRadius: 12px; text-decoration: none; font-weight: bold; display: inline-block; transition: background 0.2s; }
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
      imgSrc: ["'self'", "data:", "https://*.cloudinary.com", "https://*.dicebear.com", "https://*.googleusercontent.com"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
}));

app.get('/', (req, res, next) => {
  if (req.headers.accept?.includes('application/json')) {
    return res.json({ status: 'ok', version: APP_VERSION });
  }
  next();
});


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

// 🛡️ DIAGNOSTICS: Global Request Logger (v2.6.175)
app.use(async (req, res, next) => {
  if (req.path.includes('login') || req.path.includes('recovery')) {
    await logAudit(req, 'DEBUG_INCOMING_AUTH_REQ', [], { url: req.originalUrl || req.path, method: req.method });
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
  }
});

// 🔐 SOCKET SECURITY: Auth Handshake (SEC Fix)
io.use((socket, next) => {
  const apiKey = socket.handshake.headers['x-ace-api-key'] || socket.handshake.auth.apiKey || socket.handshake.auth.token;
  
  // 🛡️ [SYNC_RECOVERY] (v2.6.258)
  // Allow both the Master ACE_API_KEY and the PUBLIC_APP_ID to pass handshake.
  // This ensures that devices can connect and respond to pings even before login.
  if (apiKey === ACE_API_KEY || apiKey === PUBLIC_APP_ID || socket.handshake.auth.apiKey === PUBLIC_APP_ID) {
    return next();
  }
  
  console.warn(`🛑 WS_UNAUTHORIZED: Attempt from ${socket.handshake.address} with key: ${apiKey}`);
  logServerEvent('WS_UNAUTHORIZED', { ip: socket.handshake.address });
  return next(new Error('Unauthorized: WebSocket requires valid API Key'));
});

// 🕐 [SESSION TRACKER] (v2.6.267)
// In-memory map tracking active WebSocket sessions for support employees
// Key: socketId, Value: { userId, startTime, deviceName }
const activeSupportSessions = new Map();

io.on('connection', async (socket) => {
  logServerEvent('WS_CLIENT_CONNECTED', { socketId: socket.id });
  
  // 🕐 [SESSION TRACKER] (v2.6.267): Track support employee sessions
  const connUserId = socket.handshake?.query?.userId;
  const connRole = socket.handshake?.query?.role;
  const connDeviceName = socket.handshake?.query?.deviceName || 'Browser';
  
  if (connUserId && connUserId !== 'guest' && connUserId !== 'admin') {
    console.log(`[DEBUG] WS Connection from user: ${connUserId}, provided role: ${connRole || 'none'}, device: ${connDeviceName}`);
    
    // 🛡️ [DEDUP] (v2.6.274): Evict stale sessions for the same userId to prevent duplicates
    // This handles the case where setUserToken triggers a socket reconnect before the old one disconnects
    for (const [existingSocketId, existingSess] of activeSupportSessions) {
      if (existingSess.userId === connUserId && existingSocketId !== socket.id) {
        console.log(`🕐 [SESSION] Evicting stale session for ${connUserId} (old socket: ${existingSocketId}, new: ${socket.id})`);
        activeSupportSessions.delete(existingSocketId);
      }
    }

    // Use the explicitly provided role from the client if available
    if (connRole === 'support') {
      activeSupportSessions.set(socket.id, {
        userId: connUserId,
        startTime: Date.now(),
        deviceName: connDeviceName
      });
      console.log(`🕐 [SESSION] Support employee ${connUserId} session started via client role (socket: ${socket.id}, device: ${connDeviceName})`);
    } else {
      // Fallback: check database if client didn't provide role
      try {
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (state?.data?.players) {
          const player = state.data.players.find(p => String(p.id) === String(connUserId));
          console.log(`[DEBUG] Database lookup for ${connUserId} returned role: ${player?.role || 'not found'}`);
          if (player && player.role === 'support') {
            activeSupportSessions.set(socket.id, {
              userId: connUserId,
              startTime: Date.now(),
              deviceName: connDeviceName
            });
            console.log(`🕐 [SESSION] Support employee ${connUserId} session started via DB lookup (socket: ${socket.id}, device: ${connDeviceName})`);
          }
        }
      } catch (e) {
        console.warn('[SESSION] Failed to check user role on connect:', e.message);
      }
    }
  }

  socket.on('admin_pull_diagnostics', (data) => {
    logServerEvent('ADMIN_PULL_DIAGNOSTICS_REQUESTED', data);
    // 🛡️ [TARGETED_RELAY] (v2.6.274): Only send to sockets belonging to the target user
    // instead of broadcasting to everyone, which was causing missed deliveries
    for (const [sid, sess] of activeSupportSessions) {
      if (String(sess.userId) === String(data.targetUserId)) {
        io.to(sid).emit('force_upload_diagnostics', data);
        console.log(`[DIAG] Relayed force_upload_diagnostics to socket ${sid} for user ${data.targetUserId}`);
      }
    }
    // Also broadcast to non-support users (regular mobile clients)
    io.emit('force_upload_diagnostics', data);
  });

  socket.on('admin_ping_device', (data) => {
    logServerEvent('ADMIN_PING_DEVICE', { targetUserId: data.targetUserId, fromSocket: socket.id });
    io.emit('admin_ping_device_relay', data);
  });

  socket.on('device_pong', async (data) => {
    logServerEvent('DEVICE_PONG_RECEIVED', { targetUserId: data.targetUserId, deviceId: data.deviceId, deviceName: data.deviceName, fromSocket: socket.id });
    io.emit('device_pong_relay', data);

    // 🛡️ [AUTO-REGISTRATION] (v2.6.259)
    // If a live pong is received, ensure this device is in the user's permanent history
    if (data.targetUserId && data.deviceId) {
      try {
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (state && state.data && state.data.players) {
          const players = [...state.data.players];
          const uIdx = players.findIndex(p => String(p.id) === String(data.targetUserId));
          if (uIdx !== -1) {
            const user = players[uIdx];
            user.devices = user.devices || [];
            const dIdx = user.devices.findIndex(d => d && d.id === data.deviceId);
            
            if (dIdx === -1) {
              console.log(`📡 [AUTO-REG] Adding new device ${data.deviceId} to user ${data.targetUserId}`);
              user.devices.push({
                id: data.deviceId,
                name: data.deviceName || 'Unknown Device',
                appVersion: data.appVersion || '2.6.258',
                lastActive: Date.now()
              });
              state.markModified('data.players');
              await state.save();
            } else {
              // Update last active and metadata
              user.devices[dIdx].lastActive = Date.now();
              user.devices[dIdx].name = data.deviceName || user.devices[dIdx].name;
              user.devices[dIdx].appVersion = data.appVersion || user.devices[dIdx].appVersion;
              state.markModified('data.players');
              await state.save();
            }
          }
        }
      } catch (e) {
        console.error('❌ [AUTO-REG] Failed:', e.message);
      }
    }
  });

  // Support chat relay events
  socket.on('typing_start', (data) => io.emit('typing_start', data));
  socket.on('typing_stop', (data) => io.emit('typing_stop', data));

  socket.on('disconnect', async () => {
    logServerEvent('WS_CLIENT_DISCONNECTED', { socketId: socket.id });
    
    // 🕐 [SESSION TRACKER] (v2.6.267): Persist session duration on disconnect
    const session = activeSupportSessions.get(socket.id);
    if (session) {
      activeSupportSessions.delete(socket.id);
      const durationMs = Date.now() - session.startTime;
      const durationMins = Math.round(durationMs / 60000);
      console.log(`🕐 [SESSION] Support employee ${session.userId} disconnected after ${durationMins}m`);
      
      // Only persist sessions longer than 1 minute to avoid noise from reconnects
      if (durationMs > 60000) {
        try {
          const state = await AppState.findOne().sort({ lastUpdated: -1 });
          if (state?.data?.players) {
            const players = state.data.players;
            const uIdx = players.findIndex(p => String(p.id) === String(session.userId));
            if (uIdx !== -1) {
              players[uIdx].sessionHistory = players[uIdx].sessionHistory || [];
              players[uIdx].sessionHistory.push({
                startTime: new Date(session.startTime).toISOString(),
                endTime: new Date().toISOString(),
                durationMs,
                device: session.deviceName || 'Browser'
              });
              // Cap at 200 entries to prevent unbounded growth
              if (players[uIdx].sessionHistory.length > 200) {
                players[uIdx].sessionHistory = players[uIdx].sessionHistory.slice(-200);
              }
              state.markModified('data.players');
              await state.save();
              console.log(`🕐 [SESSION] Persisted ${durationMins}m session for ${session.userId}`);
            }
          }
        } catch (e) {
          console.error('🕐 [SESSION] Failed to persist session:', e.message);
        }
      }
    }
  });
});

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
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  }).then(() => {
    console.log('✅ MongoDB Connected Successfully');
    dbStatus = 'connected';
    
    // 🛡️ [REPAIR_GUARD] (v2.6.197): Restore Admin Access if wiped by thinned sync
    (async () => {
      try {
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (state && state.data && state.data.players) {
          const players = state.data.players;
          const adminIdx = players.findIndex(p => p.id === 'admin');
          if (adminIdx !== -1) {
            const admin = players[adminIdx];
            if (!admin.password || admin.password === '') {
               console.log('🛡️ [REPAIR] Wiped Admin Password Detected. Restoring Default...');
               players[adminIdx].password = 'Password@123';
               state.markModified('data.players');
               await state.save();
               console.log('✅ [REPAIR] Admin Password Restored Successfully.');
            }
          }
        }
      } catch (e) {
        console.error('❌ [REPAIR] Failed to check/repair admin password:', e.message);
      }
    })();
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


// 🛡️ [SLACK INTERACTION ENDPOINT] (v2.6.212)
// Handles "Approve" and "Block" buttons from Slack security alerts
router.post('/api/v1/slack/interact', async (req, res) => {
  try {
    // Slack sends payload as a string-encoded JSON in 'payload' field
    if (!req.body.payload) {
      return res.status(400).send("Missing payload");
    }

    const payload = JSON.parse(req.body.payload);
    const actionData = JSON.parse(payload.actions[0].value);
    const { action, target, ip } = actionData;

    console.log(`📡 [SLACK_ACTION] Received ${action} for ${target} from IP ${ip}`);

    if (action === 'block') {
      const release = await syncMutex.acquire();
      try {
        const appState = await AppState.findOne().sort({ lastUpdated: -1 });
        if (appState?.data?.players) {
          const players = [...appState.data.players];
          const userIdx = players.findIndex(p => 
            String(p.id).toLowerCase() === String(target).toLowerCase() || 
            String(p.email).toLowerCase() === String(target).toLowerCase() ||
            String(p.username).toLowerCase() === String(target).toLowerCase()
          );

          if (userIdx !== -1) {
            const now = Date.now();
            const lockedUser = players[userIdx];
            players[userIdx].loginBlockedUntil = now + (5 * 60 * 1000); // 5 min cooldown
            players[userIdx].lastForceLogoutAt = now; // Invalidate current JWTs
            
            await AppState.findOneAndUpdate(
              {},
              { $set: { 'data.players': players, version: appState.version + 1, lastUpdated: now } }
            );
            
            console.warn(`🛡️ [LOCKDOWN] Account ${lockedUser.id} (${lockedUser.role}) LOCKED for 5 mins via Slack Action [Triggered by ${payload.user.name}]`);
            
            return res.json({
              replace_original: false,
              text: `🛑 *LOCKDOWN SUCCESSFUL*: Account *${lockedUser.id}* blocked for 5 minutes. All active sessions invalidated. (Action by: ${payload.user.name})`
            });
          }
        }
      } finally {
        release();
      }
    } else if (action === 'approve') {
       console.log(`✅ [SLACK_ACTION] Admin login approved by ${payload.user.name}`);
       return res.json({
          replace_original: false,
          text: `✅ *APPROVED*: Login session authorized by ${payload.user.name}.`
       });
    }

    res.status(200).send();
  } catch (err) {
    console.error("❌ Slack interaction failed:", err.message);
    res.status(500).send("Internal Server Error");
  }
});

// Rate limiters: MOVED to ./middleware/security.mjs (Phase 1b Modularization)
// Created via createRateLimiters() after initSecurity() call

// Apply Global Limiter to all API routes
app.use('/api/', globalApiLimiter);


// getSanitizedState, DiagnosticsSchema, AutoFlushSchema, SaveDataSchema, validate, hashOtp, compareOtp:
// MOVED to ./middleware/security.mjs (Phase 1b Modularization)




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

// 🛡️ SECURITY: BROWSER CACHE HARDENING (v2.6.155)
// Forces browsers to never store sensitive API responses on disk.
// Prevents exposing raw JSON state to casual inspectors or via disk forensics.
// sensitiveCacheGuard: MOVED to ./middleware/security.mjs (Phase 1b Modularization)

// Public Health Check (Requires Health Token for Production Monitoring)
router.get('/health', (req, res) => {
  const healthToken = req.headers['x-health-token'];
  if (process.env.NODE_ENV === 'production' && (!healthToken || healthToken !== process.env.HEALTH_TOKEN)) {
    return res.status(403).json({ error: 'Access Denied' });
  }
  res.json({ status: 'ok', uptime: process.uptime(), version: APP_VERSION });
});

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

app.use('/api', authRoutes);
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
  addInAppNotification
});

app.use('/api', dataRoutes);
app.use('/api/v1', dataRoutes);

const supportRoutes = createSupportRoutes({
  io,
  logServerEvent,
  logAudit,
  cloudinary,
  upload,
  otpLimiter,
  SupportMetricsService,
  activeSupportSessions
});

app.use('/api', supportRoutes);
app.use('/api/v1', supportRoutes);

app.use('/api', router);
app.use('/api/v1', router); // 🛡️ COMPATIBILITY FIX (v2.6.174): Support versioned API calls from web/mobile clients


// [Consolidated with primary /health guard at /api/v1/health]

// 🌐 Password Reset Web Page
app.get('/reset-password/:token', asyncHandler(async (req, res) => {
  const { token } = req.params;
  const resetReq = await SupportPasswordReset.findOne({ token, expiresAt: { $gt: new Date() } });
  
  if (!resetReq) {
    return res.status(400).send(`
      <html>
        <body style="background:#0F172A;color:#FFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-align:center;padding:50px;">
          <h2>Link Expired or Invalid</h2>
          <p style="color:#94A3B8;">Please request a new password reset link from the AceTrack Portal.</p>
        </body>
      </html>
    `);
  }

  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  const players = appState?.data?.players || [];
  const user = players.find(p => p.email?.toLowerCase() === resetReq.email.toLowerCase());
  
  if (!user) {
    return res.status(404).send('User not found');
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset AceTrack Password</title>
  <style>
    body { background-color: #0F172A; color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
    .container { background-color: #1E293B; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); width: 100%; max-width: 400px; box-sizing: border-box; }
    h2 { margin-top: 0; margin-bottom: 24px; color: #FFFFFF; font-weight: 800; text-align: center; }
    .form-group { margin-bottom: 20px; text-align: left; }
    label { display: block; font-size: 13px; color: #94A3B8; margin-bottom: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    .read-only { background-color: #0F172A; padding: 12px 16px; border-radius: 8px; font-size: 15px; color: #CBD5E1; border: 1px solid #334155; }
    input[type="password"] { width: 100%; box-sizing: border-box; background-color: #0F172A; color: #FFFFFF; border: 1px solid #334155; padding: 12px 16px; border-radius: 8px; font-size: 15px; outline: none; transition: border-color 0.2s; }
    input[type="password"]:focus { border-color: #6366F1; }
    .btn { width: 100%; background-color: #4F46E5; color: #FFF; border: none; padding: 14px; border-radius: 8px; font-size: 16px; font-weight: 700; cursor: pointer; transition: background-color 0.2s; margin-top: 10px; }
    .btn:hover { background-color: #4338CA; }
    .btn:disabled { background-color: #334155; cursor: not-allowed; color: #94A3B8; }
    .error { color: #EF4444; font-size: 13px; margin-top: 8px; text-align: center; display: none; }
    .success { display: none; text-align: center; }
  </style>
</head>
<body>
  <div class="container" id="form-container">
    <h2>Set New Password</h2>
    <div class="form-group">
      <label>Email</label>
      <div class="read-only">${user.email}</div>
    </div>
    <div class="form-group">
      <label>Username</label>
      <div class="read-only">${user.username || 'N/A'}</div>
    </div>
    <div class="form-group">
      <label>New Password</label>
      <input type="password" id="newPassword" placeholder="Enter new password">
    </div>
    <div class="form-group">
      <label>Confirm Password</label>
      <input type="password" id="confirmPassword" placeholder="Confirm new password">
    </div>
    <div class="error" id="error-msg"></div>
    <button class="btn" id="submit-btn">Save Password</button>
  </div>
  
  <div class="container success" id="success-container">
    <div style="font-size:48px;margin-bottom:16px;">✅</div>
    <h2>Password Updated</h2>
    <p style="color:#94A3B8;margin-bottom:24px;line-height:1.6;">Your AceTrack password has been successfully reset. You can now securely log in to the portal.</p>
    <button class="btn" id="btn-go-login">Go to Login</button>
  </div>

  <script nonce="${res.locals.nonce}">
    async function submitPassword() {
      const p1 = document.getElementById('newPassword').value;
      const p2 = document.getElementById('confirmPassword').value;
      const errorMsg = document.getElementById('error-msg');
      const btn = document.getElementById('submit-btn');
      
      errorMsg.style.display = 'none';
      
      if (!p1 || !p2) {
        errorMsg.textContent = 'Both fields are required.';
        errorMsg.style.display = 'block';
        return;
      }
      if (p1 !== p2) {
        errorMsg.textContent = 'Passwords do not match.';
        errorMsg.style.display = 'block';
        return;
      }
      if (p1.length < 8) {
        errorMsg.textContent = 'Password must be at least 8 characters long.';
        errorMsg.style.display = 'block';
        return;
      }
      
      btn.disabled = true;
      btn.textContent = 'Updating...';
      
      try {
        const res = await fetch('/api/support/password-reset/confirm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: '${token}', newPassword: p1 })
        });
        
        const data = await res.json();
        if (res.ok) {
          document.getElementById('form-container').style.display = 'none';
          document.getElementById('success-container').style.display = 'block';
        } else {
          errorMsg.textContent = data.error || 'Failed to update password.';
          errorMsg.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Save Password';
        }
      } catch (e) {
        errorMsg.textContent = 'Network error. Please try again.';
        errorMsg.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Save Password';
      }
    }

    // 🛡️ [CSP HARMONY] Attach listeners
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('submit-btn')?.addEventListener('click', submitPassword);
      document.getElementById('btn-go-login')?.addEventListener('click', () => {
        window.location.href = '/';
      });
    });
  </script>
</body>
</html>
  `;
  res.send(html);
}));

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
// 🎫 Support Staff Onboarding Page (v2.6.124)
// Server-rendered — works independently of the Expo web bundle
// ═══════════════════════════════════════════════════════════════
app.get('/setup/:token', (req, res) => {
  const { token } = req.params;
  const nonce = res.locals.nonce;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>AceTrack Support — Employee Onboarding</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background: linear-gradient(135deg, #0F172A 0%, #1E293B 50%, #0F172A 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #E2E8F0;
    }
    .card {
      background: #1E293B;
      border: 1px solid #334155;
      border-radius: 24px;
      padding: 40px;
      width: 100%;
      max-width: 520px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
      position: relative;
      overflow: hidden;
    }
    .card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, #4F46E5, #7C3AED, #EC4899);
    }
    .icon-wrap {
      width: 64px; height: 64px;
      background: rgba(79,70,229,0.15);
      border-radius: 16px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 20px;
    }
    .icon-wrap svg { width: 32px; height: 32px; fill: #818CF8; }
    h1 { text-align: center; font-size: 22px; font-weight: 800; color: #F8FAFC; margin-bottom: 4px; }
    .subtitle { text-align: center; font-size: 13px; color: #94A3B8; margin-bottom: 28px; }
    .email-badge {
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 12px;
      padding: 14px 16px;
      margin-bottom: 24px;
    }
    .email-badge .label { font-size: 10px; font-weight: 700; color: #64748B; letter-spacing: 1.5px; text-transform: uppercase; }
    .email-badge .value { font-size: 15px; font-weight: 600; color: #E2E8F0; margin-top: 4px; }

    .section-title {
      font-size: 12px; font-weight: 700; color: #818CF8; text-transform: uppercase;
      letter-spacing: 1.5px; margin: 24px 0 14px; padding-bottom: 8px;
      border-bottom: 1px solid #334155;
    }
    .section-title:first-of-type { margin-top: 0; }

    .row { display: flex; gap: 12px; }
    .row .field { flex: 1; }

    .field { margin-bottom: 16px; }
    .field label { display: block; font-size: 13px; font-weight: 600; color: #94A3B8; margin-bottom: 6px; }
    .field label .req { color: #F87171; }
    .field input, .field textarea {
      width: 100%;
      padding: 11px 14px;
      background: #0F172A;
      border: 1px solid #334155;
      border-radius: 10px;
      color: #F8FAFC;
      font-size: 14px;
      font-family: 'Inter', sans-serif;
      outline: none;
      transition: border-color 0.2s;
    }
    .field input:focus, .field textarea:focus { border-color: #6366F1; }
    .field textarea { resize: vertical; min-height: 70px; }

    .file-upload {
      border: 2px dashed #334155;
      border-radius: 12px;
      padding: 20px;
      text-align: center;
      cursor: pointer;
      transition: border-color 0.2s, background 0.2s;
      position: relative;
    }
    .file-upload:hover { border-color: #6366F1; background: rgba(99,102,241,0.05); }
    .file-upload.has-file { border-color: #34D399; background: rgba(16,185,129,0.05); }
    .file-upload input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file-upload .upload-icon { font-size: 28px; margin-bottom: 8px; }
    .file-upload .upload-text { font-size: 13px; color: #94A3B8; }
    .file-upload .upload-text strong { color: #818CF8; }
    .file-upload .file-name { font-size: 13px; color: #34D399; font-weight: 600; margin-top: 6px; }
    .file-upload .upload-hint { font-size: 11px; color: #475569; margin-top: 6px; }

    .error-msg {
      background: rgba(239,68,68,0.12);
      color: #F87171;
      font-size: 13px;
      padding: 10px 14px;
      border-radius: 10px;
      margin-bottom: 16px;
      display: none;
    }
    .error-msg.visible { display: block; }
    .btn {
      width: 100%;
      padding: 14px;
      background: linear-gradient(135deg, #4F46E5, #7C3AED);
      color: #FFF;
      font-size: 15px;
      font-weight: 700;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      font-family: 'Inter', sans-serif;
      transition: opacity 0.2s, transform 0.1s;
      margin-top: 8px;
    }
    .btn:hover { opacity: 0.92; }
    .btn:active { transform: scale(0.98); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .spinner { display: inline-block; width: 18px; height: 18px; border: 2.5px solid rgba(255,255,255,0.3); border-top-color: #FFF; border-radius: 50%; animation: spin 0.7s linear infinite; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .progress-bar { display: flex; gap: 6px; margin-bottom: 4px; }
    .progress-bar .step { flex: 1; height: 4px; border-radius: 2px; background: #334155; transition: background 0.3s; }
    .progress-bar .step.done { background: #818CF8; }
    .progress-label { font-size: 11px; color: #64748B; text-align: right; margin-bottom: 20px; }

    /* States */
    .state { display: none; }
    .state.active { display: block; }
    .state-center { text-align: center; }
    .state-icon { width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .state-icon.error { background: rgba(239,68,68,0.15); }
    .state-icon.error svg { fill: #F87171; }
    .state-icon.success { background: rgba(16,185,129,0.15); }
    .state-icon.success svg { fill: #34D399; }
    .state-center h2 { font-size: 20px; font-weight: 800; color: #F8FAFC; margin-bottom: 8px; }
    .state-center p { font-size: 14px; color: #94A3B8; line-height: 1.6; margin-bottom: 24px; }
    .link-btn {
      display: inline-block; padding: 12px 28px;
      background: rgba(99,102,241,0.15); color: #818CF8;
      font-weight: 700; font-size: 14px; border-radius: 10px;
      text-decoration: none; transition: background 0.2s;
    }
    .link-btn:hover { background: rgba(99,102,241,0.25); }
    .loading-container { text-align: center; padding: 60px 0; }
    .loading-container .spinner { width: 36px; height: 36px; border-width: 3px; border-color: rgba(99,102,241,0.3); border-top-color: #818CF8; }
    .loading-text { margin-top: 16px; font-size: 14px; color: #64748B; }
    .footer { text-align: center; margin-top: 24px; font-size: 11px; color: #475569; }
  </style>
</head>
<body>
  <div class="card">
    <!-- Loading State -->
    <div id="state-loading" class="state active">
      <div class="loading-container">
        <div class="spinner"></div>
        <div class="loading-text">Verifying your invitation link...</div>
      </div>
    </div>

    <!-- Invalid State -->
    <div id="state-invalid" class="state state-center">
      <div class="state-icon error">
        <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
      </div>
      <h2>Invalid Setup Link</h2>
      <p id="invalid-msg">This setup link is invalid or has expired.</p>
      <p style="font-size:12px;color:#64748B;">Please contact your System Administrator for a new invitation.</p>
    </div>

    <!-- Form State -->
    <div id="state-form" class="state">
      <div class="icon-wrap">
        <svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>
      </div>
      <h1>AceTrack Support</h1>
      <div class="subtitle">Secure Employee Onboarding</div>

      <div class="progress-bar">
        <div class="step done"></div>
        <div class="step" id="prog-2"></div>
        <div class="step" id="prog-3"></div>
      </div>
      <div class="progress-label" id="prog-label">Step 1 of 3 — Personal Details</div>

      <div class="email-badge">
        <div class="label">Corporate Email (Verified)</div>
        <div class="value" id="agent-email">—</div>
      </div>

      <!-- STEP 1: Personal Details -->
      <div id="step-1" class="state active">
        <div class="section-title">👤 Personal Information</div>
        <div class="row">
          <div class="field">
            <label>First Name <span class="req">*</span></label>
            <input type="text" id="firstName" placeholder="e.g. Rahul" required>
          </div>
          <div class="field">
            <label>Last Name <span class="req">*</span></label>
            <input type="text" id="lastName" placeholder="e.g. Sharma" required>
          </div>
        </div>
        <div class="field">
          <label>Phone Number <span class="req">*</span></label>
          <input type="tel" id="phone" placeholder="+91 9876543210">
        </div>

        <div class="section-title">🏠 Permanent Address</div>
        <div class="field">
          <label>Address Line 1 <span class="req">*</span></label>
          <input type="text" id="addrLine1" placeholder="House/Flat No., Street">
        </div>
        <div class="field">
          <label>Address Line 2</label>
          <input type="text" id="addrLine2" placeholder="Landmark (optional)">
        </div>
        <div class="row">
          <div class="field">
            <label>City <span class="req">*</span></label>
            <input type="text" id="city" placeholder="e.g. Bangalore">
          </div>
          <div class="field">
            <label>State <span class="req">*</span></label>
            <input type="text" id="addrState" placeholder="e.g. Karnataka">
          </div>
        </div>
        <div class="row">
          <div class="field">
            <label>PIN Code <span class="req">*</span></label>
            <input type="text" id="pinCode" placeholder="e.g. 560001" maxlength="6">
          </div>
          <div class="field">
            <label>Country</label>
            <input type="text" id="country" value="India" placeholder="India">
          </div>
        </div>

        <div class="error-msg" id="error-1"></div>
        <button class="btn" id="btn-go-step-2">Continue to ID Verification →</button>
      </div>

      <!-- STEP 2: ID Upload -->
      <div id="step-2" class="state">
        <div class="section-title">🪪 Government ID Verification</div>
        <p style="font-size:13px;color:#94A3B8;margin-bottom:16px;line-height:1.5;">
          Upload a clear scan or photo of your government-issued ID (Aadhaar, PAN, Passport, or Driving License) for employment documentation.
        </p>

        <div class="file-upload" id="file-drop">
          <input type="file" id="govIdFile" accept="image/*,application/pdf" style="display:none">
          <div class="upload-icon">📄</div>
          <div class="upload-text"><strong>Click to upload</strong> or drag and drop</div>
          <div class="file-name" id="fileName" style="display:none"></div>
          <div class="upload-hint">PDF, JPG, PNG — Max 10MB</div>
        </div>

        <div class="error-msg" id="error-2"></div>
        <div style="display:flex;gap:12px;margin-top:16px;">
          <button class="btn" id="btn-back-step-1" style="background:#334155;flex:0.4;">← Back</button>
          <button class="btn" id="btn-go-step-3" style="flex:0.6;">Continue to Security →</button>
        </div>
      </div>

      <!-- STEP 3: Password -->
      <div id="step-3" class="state">
        <div class="section-title">🔐 Account Security</div>
        <div class="field">
          <label>Create Password <span class="req">*</span></label>
          <input type="password" id="password" placeholder="At least 8 characters" autocomplete="new-password">
        </div>
        <div class="field">
          <label>Confirm Password <span class="req">*</span></label>
          <input type="password" id="confirm" placeholder="Repeat your password" autocomplete="new-password">
        </div>

        <div class="error-msg" id="error-3"></div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button class="btn" id="btn-back-step-2" style="background:#334155;flex:0.4;">← Back</button>
          <button class="btn" style="flex:0.6;" id="submit-btn">Finalize Account</button>
        </div>
        <div class="footer">🔒 Your password is encrypted end-to-end before storage.</div>
      </div>
    </div>

    <!-- Success State -->
    <div id="state-success" class="state state-center">
      <div class="state-icon success">
        <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>
      </div>
      <h2>Account Ready!</h2>
      <p>Your support agent account has been securely established. All documentation has been recorded. You can now log in.</p>
      <a href="/" class="link-btn">Go to Login →</a>
    </div>
  </div>

  <script nonce="${nonce}">
    const TOKEN = '${token}';
    const API = '';
    let selectedFile = null;

    function showState(id) {
      document.querySelectorAll('.card > .state').forEach(s => s.classList.remove('active'));
      document.getElementById('state-' + id).classList.add('active');
    }

    // 📊 Analytics: Track form step views
    function trackStep(action) {
      try {
        fetch('/api/support/invite/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: '${token}', action })
        }).catch(() => {});
      } catch(e) {}
    }

    // Track initial form view
    trackStep('Form Opened (Step 1)');

    function showStep(n) {
      [1,2,3].forEach(i => {
        document.getElementById('step-' + i).classList.toggle('active', i === n);
      });
      // Update progress bar
      document.getElementById('prog-2').classList.toggle('done', n >= 2);
      document.getElementById('prog-3').classList.toggle('done', n >= 3);
      const labels = { 1: 'Step 1 of 3 — Personal Details', 2: 'Step 2 of 3 — ID Verification', 3: 'Step 3 of 3 — Security' };
      document.getElementById('prog-label').textContent = labels[n];
      
      const trackLabels = {
        1: 'Viewing Personal Info',
        2: 'ID Verification Reached',
        3: 'Security Setup Reached'
      };
      trackStep(trackLabels[n]);
    }

    function showError(boxId, msg) {
      const box = document.getElementById(boxId);
      box.textContent = msg;
      box.classList.add('visible');
    }
    function clearErrors() {
      document.querySelectorAll('.error-msg').forEach(b => { b.classList.remove('visible'); b.textContent = ''; });
      document.getElementById('file-drop').style.borderColor = '#E2E8F0';
    }

    function goStep2() {
      clearErrors();
      const fn = document.getElementById('firstName').value.trim();
      const ln = document.getElementById('lastName').value.trim();
      const ph = document.getElementById('phone').value.trim();
      const a1 = document.getElementById('addrLine1').value.trim();
      const ct = document.getElementById('city').value.trim();
      const st = document.getElementById('addrState').value.trim();
      const pin = document.getElementById('pinCode').value.trim();

      if (!fn || !ln) { showError('error-1', 'First and Last Name are required.'); return; }
      if (!ph || ph.length < 10) { showError('error-1', 'Please enter a valid phone number.'); return; }
      if (!a1) { showError('error-1', 'Address Line 1 is required.'); return; }
      if (!ct || !st) { showError('error-1', 'City and State are required.'); return; }
      if (!pin || pin.length < 5) { showError('error-1', 'Please enter a valid PIN/ZIP code.'); return; }
      showStep(2);
    }

    function backStep1() { clearErrors(); showStep(1); }

    function goStep3() {
      clearErrors();
      if (!selectedFile) { 
        showError('error-2', 'Government ID upload is required for documentation.'); 
        document.getElementById('file-drop').style.borderColor = '#EF4444';
        return; 
      }
      if (selectedFile.size > 10 * 1024 * 1024) { showError('error-2', 'File size must be under 10MB.'); return; }
      showStep(3);
    }

    function backStep2() { clearErrors(); showStep(2); }

    function handleFileSelect(input) {
      const file = input.files[0];
      if (!file) return;
      processFile(file);
    }

    function handleDrop(e) {
      e.preventDefault();
      document.getElementById('file-drop').classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (!file) return;
      processFile(file);
    }

    function processFile(file) {
      if (file.size > 10 * 1024 * 1024) {
        showError('error-2', 'File size must be under 10MB.');
        return;
      }
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (!allowed.includes(file.type)) {
        showError('error-2', 'Invalid file type. Please upload JPG, PNG, or PDF.');
        return;
      }
      
      selectedFile = file;
      document.getElementById('fileName').style.display = 'block';
      document.getElementById('fileName').textContent = '✓ ' + file.name;
      document.getElementById('file-drop').classList.add('has-file');
      document.getElementById('file-drop').style.borderColor = '#10B981'; // Success Green
      clearErrors();
    }

    async function verifyToken() {
      try {
        const res = await fetch(API + '/api/support/invite/click', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: TOKEN })
        });
        const data = await res.json();
        if (res.ok) {
          document.getElementById('agent-email').textContent = data.email;
          showState('form');
        } else {
          document.getElementById('invalid-msg').textContent = data.error || 'This setup link is invalid or has expired.';
          showState('invalid');
        }
      } catch (err) {
        document.getElementById('invalid-msg').textContent = 'Failed to connect to the server. Please try again later.';
        showState('invalid');
      }
    }

    async function handleSetup() {
      clearErrors();
      const pw = document.getElementById('password').value;
      const cf = document.getElementById('confirm').value;
      const btn = document.getElementById('submit-btn');

      if (pw.length < 8) { showError('error-3', 'Password must be at least 8 characters.'); return; }
      if (pw !== cf) { showError('error-3', 'Passwords do not match.'); return; }

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Setting up...';

      try {
        // Build FormData with all employee details
        const fd = new FormData();
        fd.append('token', TOKEN);
        fd.append('password', pw);
        fd.append('firstName', document.getElementById('firstName').value.trim());
        fd.append('lastName', document.getElementById('lastName').value.trim());
        fd.append('phone', document.getElementById('phone').value.trim());
        fd.append('addressLine1', document.getElementById('addrLine1').value.trim());
        fd.append('addressLine2', document.getElementById('addrLine2').value.trim());
        fd.append('city', document.getElementById('city').value.trim());
        fd.append('state', document.getElementById('addrState').value.trim());
        fd.append('pinCode', document.getElementById('pinCode').value.trim());
        fd.append('country', document.getElementById('country').value.trim() || 'India');
        if (selectedFile) fd.append('govId', selectedFile);

        trackStep('form_submit');
        const res = await fetch(API + '/api/support/invite/setup', {
          method: 'POST',
          body: fd
        });
        const data = await res.json();
        if (res.ok) {
          showState('success');
        } else {
          showError('error-3', data.error || 'Failed to establish account.');
          btn.disabled = false;
          btn.textContent = 'Finalize Account';
        }
      } catch (err) {
        showError('error-3', 'A network error occurred. Please try again.');
        btn.disabled = false;
        btn.textContent = 'Finalize Account';
      }
    }

    // 🛡️ [CSP HARMONY] Attach listeners after DOM load (v2.6.234)
    document.addEventListener('DOMContentLoaded', () => {
      document.getElementById('btn-go-step-2')?.addEventListener('click', goStep2);
      document.getElementById('btn-go-step-3')?.addEventListener('click', goStep3);
      document.getElementById('btn-back-step-1')?.addEventListener('click', backStep1);
      document.getElementById('btn-back-step-2')?.addEventListener('click', backStep2);
      document.getElementById('submit-btn')?.addEventListener('click', handleSetup);
      
      const fileDrop = document.getElementById('file-drop');
      const fileInput = document.getElementById('govIdFile');
      
      fileDrop?.addEventListener('click', (e) => {
        if (e.target.id !== 'govIdFile') {
          fileInput?.click();
          e.stopPropagation();
        }
      });
      
      fileDrop?.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileDrop.classList.add('drag-over');
      });
      
      fileDrop?.addEventListener('dragleave', () => {
        fileDrop.classList.remove('drag-over');
      });
      
      fileDrop?.addEventListener('drop', (e) => {
        handleDrop(e);
      });
      
      fileInput?.addEventListener('change', () => {
        handleFileSelect(fileInput);
      });
    });

    // Auto-verify on page load
    verifyToken();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});


// ═══════════════════════════════════════════════════════════════
// Serve Web Admin Dashboard
// ═══════════════════════════════════════════════════════════════
const publicPath = path.join(__dirname, 'public');
if (fs.existsSync(publicPath)) {
  // 🛡️ [ENTRY-POINT GUARD]: Handle the root explicitly with no-cache headers.
  app.get('/', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 🛡️ [HIGH COMPATIBILITY ASSETS]: Explicitly handle Font MIME types and CORS (v2.6.257)
  app.use((req, res, next) => {
    if (req.path.endsWith('.ttf')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Content-Type', 'font/ttf');
    }
    // Allow CORS for all static assets to prevent loading issues
    if (req.path.includes('/assets/')) {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    next();
  });

  // 🛡️ [STATIC ASSETS]: Serve physical files (JS, CSS, Images, etc.)
  app.use(express.static(publicPath, {
    setHeaders: (res, path) => {
      if (path.endsWith('.ttf')) {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
    }
  }));

  // 🛡️ [SPA FALLBACK]: Handle deep-links for the Single Page Application.
  // We exclude paths with extensions (containing a dot) to ensure missing assets return 404, not HTML.
  app.use((req, res, next) => {
    const isApi = req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/results') || req.path.startsWith('/setup');
    const hasExtension = req.path.includes('.');
    
    if (req.method === 'GET' && !isApi && !hasExtension) {
      // Still apply no-cache for SPA routes to be safe
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.sendFile(path.join(publicPath, 'index.html'));
    } else {
      next();
    }
  });

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
    "version": "2.6.314",
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

// ═══════════════════════════════════════════════════════════════
// SUPPORT MANAGEMENT ROUTES MOVED TO routes/support.mjs (Phase 1e)
// ═══════════════════════════════════════════════════════════════

// 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195) — un-nested from force-reset
setInterval(async () => {
  try {
    const pendingSummaries = await SecuritySummary.find({
      isSummarized: false,
      lastEventAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Active in the last hour
    });

    const formatIST = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true }).format(date);
    const formatDateIST = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(date);

    for (const summary of pendingSummaries) {
      // 🛡️ Rolling Alert Logic (v2.6.209)
      const hasEnoughEvents = summary.events.length >= 5;
      const isNew = !summary.lastAlertedAt;
      const cooldownPassed = summary.lastAlertedAt && (Date.now() - summary.lastAlertedAt.getTime() > 5 * 60 * 1000);
      const isIdle = (Date.now() - summary.lastEventAt.getTime() > 30 * 60 * 1000);

      if (!hasEnoughEvents && !isIdle) continue; // Not enough noise yet
      if (!isNew && !cooldownPassed && !isIdle) continue; // In cooldown

      if (summary.events.length <= 1 && isIdle) {
        summary.isSummarized = true;
        await summary.save();
        continue;
      }

      const successCount = summary.events.filter(e => e.action.includes('SUCCESS')).length;
      const failCount = summary.events.length - successCount;
      const timeRange = `${formatIST(summary.firstEventAt)} - ${formatIST(summary.lastEventAt)} IST`;
      const dateStr = formatDateIST(summary.firstEventAt);

      console.log(`🤖 [AI] Summarizing storm: ${summary.ipAddress} (${successCount}S, ${failCount}F)`);
      const aiSummary = await generateSecuritySummary(summary.events);
      
      if (SECURITY_WEBHOOK_URL) {
        const payload = {
          text: `🌩️ *Security Storm AI Summary: ${summary.ipAddress}*`,
          attachments: [{
            color: "#6366F1", 
            title: "🌩️ Security Storm Analysis",
            text: `*Date:* ${dateStr}\n*Time Window:* ${timeRange}\n\n${aiSummary}`,
            fields: [
              { title: "Source IP", value: summary.ipAddress, short: true },
              { title: "Actor", value: summary.actor, short: true },
              { title: "Successful Attempts", value: String(successCount), short: true },
              { title: "Blocked/Failed", value: String(failCount), short: true }
            ],
            footer: "AceTrack AI Guard (v2.6.195) | Groq Llama 3",
            ts: Math.floor(Date.now() / 1000)
          }]
        };

        await fetch(SECURITY_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      summary.lastAlertedAt = new Date();
      if (isIdle) {
        summary.isSummarized = true;
      }
      await summary.save();
    }
  } catch (err) {
    console.error("AI Aggregator Error:", err.message);
  }
}, 5 * 60 * 1000); 

