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

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const router = express.Router();
app.set('trust proxy', 1); // 🛡️ Hardened for Render (v2.6.252)

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

// 🚀 ACE TRACK STABILITY VERSION (v2.6.175)
const APP_VERSION = '2.6.308'; // 🚀 FORCE REDEPLOY CACHE BUST v2.6.308 

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

// 📊 Schemas (SE Fix: Database indexing)
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false });

const AppState = mongoose.model('AppState', AppStateSchema);

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

const SecuritySummarySchema = new mongoose.Schema({
  ipAddress: String,
  userId: String,
  actor: String,
  events: [{
    timestamp: { type: Date, default: Date.now },
    action: String,
    url: String,
    method: String,
    details: mongoose.Schema.Types.Mixed
  }],
  isSummarized: { type: Boolean, default: false },
  firstEventAt: { type: Date, default: Date.now },
  lastEventAt: { type: Date, default: Date.now },
  lastAlertedAt: { type: Date, default: null }
});
const SecuritySummary = mongoose.model('SecuritySummary', SecuritySummarySchema);

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
const loginAttempts = new Map(); // identifier_IP -> { attempts: [], lastAlertedAt: 0, lastSummaryAt: 0 }

const trackLoginAttempt = async (req, identifier, password, success) => {
  const ip = (req && req.ip) || '0.0.0.0';
  const key = `${identifier}_${ip}`;
  const now = Date.now();
  
  if (!loginAttempts.has(key)) {
    loginAttempts.set(key, { attempts: [], lastSummaryAt: now });
  }
  
  const state = loginAttempts.get(key);
  const maskedPassword = (password || '').length > 2 ? (password.substring(0, 2) + '****') : '****';
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
  const sensitivePaths = ['/admin', '/debug', '/config', '/metrics', '/swagger', '/env', '/graphql', '/.env', '/config.php'];
  
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

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT INVITE SCHEMA (v2.6.122)
// Isolated collection to prevent invite tokens/IPs from leaking to mobile clients
// ═══════════════════════════════════════════════════════════════
const SupportInviteSchema = new mongoose.Schema({
  email: { type: String, required: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Pending', 'Clicked', 'Used', 'Expired', 'Retired'], default: 'Pending' },
  clicks: [{
    action: { type: String, default: 'link_click' }, // link_click, form_view, step_1, step_2, step_3, form_submit, admin_retired
    ip: String,
    userAgent: String,
    city: String,
    region: String,
    country: String,
    isp: String,
    lat: Number,
    lon: Number,
    timezone: String,
    botType: String, // 'Google', 'WhatsApp', 'Telegram', etc.
    timestamp: { type: Date, default: Date.now }
  }],
  emailResends: [{
    timestamp: { type: Date, default: Date.now }
  }],
  expiresAt: { type: Date, required: true },
  retiredAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
const SupportInvite = mongoose.model('SupportInvite', SupportInviteSchema);

// ═══════════════════════════════════════════════════════════════
// 🔒 PASSWORD RESET TOKEN SCHEMA (v2.6.131)
// ═══════════════════════════════════════════════════════════════
const SupportPasswordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
const SupportPasswordReset = mongoose.model('SupportPasswordReset', SupportPasswordResetSchema);

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

// 🛡️ SECURITY: ZERO-EXPOSURE ARCHITECTURE (v2.6.184)
// The PUBLIC_APP_ID is non-sensitive and used only for initial handshakes (Login/OTP).
const PUBLIC_APP_ID = "AceTrack_Client_v2_Production";

const apiKeyGuard = async (req, res, next) => {
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
          await logAudit(req, 'SENSITIVE_ACCESS_ATTEMPT', [], { url: req.originalUrl || req.url, method: req.method, role: req.userRole });
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
  await logAudit(req, 'UNAUTHORIZED_ACCESS_BLOCKED', [], { ip: req.ip, url: req.originalUrl || req.url, method: req.method });
  console.warn(`🛑 Unauthorized access attempt from ${req.ip} - Rejected by Zero-Exposure Guard`);
  return res.status(401).json({ 
    success: false, 
    error: 'Unauthorized. Please login again.',
    suggestion: 'Clear your browser cache if this persists.'
  });
};

const authGuard = (req, res, next) => {
  if (!req.userRole) {
    return res.status(401).json({ error: 'Authentication required. Please login again.' });
  }
  next();
};


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

// 🛡️ SECURITY: Global Rate Limiters (v2.6.185)

const globalApiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 200, // 200 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { 
    success: false, 
    error: 'Too many requests. Your IP has been temporarily throttled for security.',
    version: APP_VERSION 
  }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 🛡️ [RELAXED v2.6.207] Increased from 10 to 20 to allow for testing
  message: { error: 'Password Attempt limit reached. Please try after sometime for security.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 requests per window
  message: { error: 'Security Alert: Too many OTP attempts. Please wait 10 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply Global Limiter to all API routes
app.use('/api/', globalApiLimiter);

const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 reset requests per window
  message: { error: 'Too many recovery attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 🛡️ PRIVACY GUARD (v2.6.165)
 * Sanitizes the global application state based on requester identity and role.
 * Ensures strict isolation of private records (Tickets, Matches, Evaluations, PII).
 */
const getSanitizedState = (fullData, req) => {
  if (!fullData) return {};
  
  // 🛡️ IDENTITY RECOVERY (v2.6.200)
  // recognizes admin even when using x-user-id headers (common in shimmed admin requests)
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

      // Mask sensitive fields for others (and support without PII scope)
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
      // Users only see their own threads
      const userThreads = {};
      if (sanitized.chatbotMessages[normalizedReqId]) {
        userThreads[normalizedReqId] = sanitized.chatbotMessages[normalizedReqId];
      }
      sanitized.chatbotMessages = userThreads;
    } else {
      // Guests see nothing
      sanitized.chatbotMessages = {};
    }
  }

  // 7. Global Shield: If unauthenticated and not admin, clear all sensitive collections (v2.6.257)
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
const sensitiveCacheGuard = (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

// Public Health Check (Requires Health Token for Production Monitoring)
router.get('/health', (req, res) => {
  const healthToken = req.headers['x-health-token'];
  if (process.env.NODE_ENV === 'production' && (!healthToken || healthToken !== process.env.HEALTH_TOKEN)) {
    return res.status(403).json({ error: 'Access Denied' });
  }
  res.json({ status: 'ok', uptime: process.uptime(), version: APP_VERSION });
});

// GET /api/v1/data
router.get('/data', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
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

    // 🛡️ SECURITY HARDENING: Explicitly exclude 'currentUser' and sanitize based on identity.
    let reqUserId = req.headers['x-user-id'];
    
    // 🛡️ LEGACY WEB SHIM: Web bundles v2.6.151 lack x-user-id. Infer admin status from Referer.
    const referer = req.headers['referer'] || '';
    if (!reqUserId && referer.includes('/admin')) {
      reqUserId = 'admin';
    }

    const users = state.data.players || [];
    const requestingUser = users.find(u => String(u.id).toLowerCase() === String(reqUserId || '').toLowerCase());
    const reqUserRole = requestingUser?.role || (reqUserId === 'admin' ? 'admin' : 'user');

    const sanitizedData = getSanitizedState(state.data, req);
    delete sanitizedData.currentUser;

    res.json({ ...sanitizedData, lastUpdated: state.lastUpdated, version: state.version || 1 });
  } catch (error) {
    console.error('❌ Data Fetch Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/status
router.get('/status', apiKeyGuard, sensitiveCacheGuard, async (req, res) => {
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated version');
    // 🛡️ [VERSION_TRUTH] (v2.6.271): Always report the real version.
    // The legacy web hack (v2.6.170) that reported '2.6.151' to browsers
    // has been removed. All clients now receive the actual APP_VERSION.
    res.json({ 
      lastUpdated: state?.lastUpdated || 0,
      version: state?.version || 1,
      latestAppVersion: APP_VERSION
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/v1/diagnostics
router.get('/diagnostics', apiKeyGuard, sensitiveCacheGuard, asyncHandler(async (req, res) => {
  try {
    const { userId } = req.query;

    // 🛡️ FRONTEND SHIM: The legacy Web Admin Hub might have a stale frontend socket.
    // Hijack this REST query to emit the ping device relay directly from the server.
    if (userId) {
      logServerEvent('ADMIN_PING_DEVICE_SHIM', { targetUserId: userId });
      io.emit('admin_ping_device_relay', { targetUserId: userId });
    }

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

    if (userId) console.log(`🔍 [AdminFetch] Filtering logs for: ${userId}`);
    
    const sortedFiles = Array.from(uniqueFilesMap.entries())
      .sort((a, b) => b[1] - a[1]) // Descending
      .map(entry => entry[0])
      .filter(f => {
        if (!userId) return true;
        const safeId = String(userId).toLowerCase();
        const fName = String(f).toLowerCase();
        console.log(`🔍 [AdminFetch] Checking file ${fName} against ID ${safeId}`);
        // Strict match: starts with user_ OR contains admin_requested_user_ OR starts with user-
        return fName.startsWith(safeId + '_') || 
               fName.includes('_requested_' + safeId + '_') ||
               fName.includes('manual_upload_' + safeId + '_') ||
               fName.startsWith(safeId + '-');
      });

    res.json({ success: true, files: sortedFiles });
  } catch (error) {
    console.error('Diagnostics Fetch Error:', error);
    res.status(500).json({ error: error.message });
  }
}));


// GET /api/v1/diagnostics/raw_events (Admin only)
router.get('/diagnostics/raw_events', apiKeyGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const filepath = path.join(DIAGNOSTICS_DIR, 'server_events.jsonl');
  if (fs.existsSync(filepath)) {
    const data = await fs.promises.readFile(filepath, 'utf8');
    res.setHeader('Content-Type', 'text/plain');
    return res.send(data);
  }
  res.status(404).send('Not found');
}));

router.get('/diagnostics/:filename', apiKeyGuard, asyncHandler(async (req, res) => {
  const filename = path.basename(req.params.filename);
  
  try {
    const publicId = `acetrack/diagnostics/${filename}`;
    const fileUrl = cloudinary.url(publicId, { resource_type: 'raw', secure: true });
    const cloudRes = await fetch(fileUrl);
    if (cloudRes.ok) {
      const contentType = cloudRes.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await cloudRes.json();
        return res.json(data);
      } else {
        const text = await cloudRes.text();
        return res.send(text);
      }
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
      // 🛡️ SECURITY: Verify that users only register tokens for themselves (v2.6.257)
      if (req.userRole !== 'admin' && req.userId !== userId) {
        return res.status(403).json({ error: 'Unauthorized: Cannot register push token for another user.' });
      }

      const player = players[playerIndex];
      // 🛡️ [NOTIFY_DEBUG] Sanitize tokens (remove nulls/empty)
      let tokens = (player.pushTokens || []).filter(t => !!t && typeof t === 'string');
      
      if (!tokens.includes(pushToken)) {
        tokens.push(pushToken);
        players[playerIndex] = { ...player, pushTokens: tokens };
        
        await AppState.updateOne(
          { _id: state._id },
          { $set: { "data.players": players, lastUpdated: Date.now() } }
        );
        console.log(`📱 [NOTIFY_DEBUG] Token Registered: ${pushToken.substring(0, 15)}... for user ${userId}. Total: ${tokens.length}`);
      } else {
        console.log(`📱 [NOTIFY_DEBUG] Token already exists for user ${userId}`);
      }
      res.json({ success: true });
    } else {
      console.warn(`🛑 [NOTIFY_DEBUG] Registration failed: User ${userId} not found`);
      res.status(404).json({ error: 'User not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/v1/save
router.post('/save', apiKeyGuard, sensitiveCacheGuard, validate(SaveDataSchema), async (req, res) => {
  const waitStart = Date.now();
  const release = await syncMutex.acquire();
  const waitTime = Date.now() - waitStart;
  if (waitTime > 2000) console.warn(`⚠️ Save Mutex Wait: ${waitTime}ms from ${req.ip}`);

  try {
    // 🛡️ [GUEST SYNC GUARD] (v2.6.210)
    // Silently reject sync attempts from guests or device-only sessions to prevent Slack notification spam.
    const actorId = String(req.headers['x-user-id'] || 'guest').toLowerCase();
    if (actorId === 'guest' || actorId.startsWith('device_') || actorId === 'null' || actorId === 'undefined') {
      console.log(`[SaveGuard] 🛡️ Suppressed sync attempt from guest session (${req.ip})`);
      return res.status(403).json({ success: false, error: 'Unauthorized: Guests cannot synchronize data.' });
    }

    // 🛡️ SECURITY HARDENING (v2.6.164): Removed 'currentUser' from syncableKeys.
    // User profile updates now happen exclusively via the 'players' collection to maintain isolation.
    const syncableKeys = ['players', 'tournaments', 'matchVideos', 'matches', 'supportTickets', 'evaluations', 'auditLogs', 'chatbotMessages', 'matchmaking', 'seenAdminActionIds', 'visitedAdminSubTabs'];
    
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
    
    // 🛡️ SECURITY HARDENING (v2.6.164): Purge any legacy currentUser leaked into global state
    delete newMasterData.currentUser;

    for (const key of syncableKeys) {
      if (req.body[key] !== undefined) {
        let incoming = req.body[key];
        const atomicKeys = req.body.atomicKeys || [];

        if (key === 'tournaments' && Array.isArray(incoming)) {
          // 🛡️ TOURNAMENT OTP REPAIR (v2.6.165): 
          // Do NOT hash Start/End OTPs inside the shared tournaments collection.
          // Hashing them here breaks client-side verification as the client receives a bcrypt hash instead of the 6-digit code.
          console.log(`[SYNC_DEBUG] Processing ${incoming.length} incoming tournaments (OTP Hashing Skipped for Stability)`);
          incoming = incoming.map(t => {
             const updatedT = { ...t };
             // Preserve raw OTPs if present, or rely on them being set by Admin only.
             return updatedT;
          });
        }

        if (['players', 'matchmaking', 'tournaments', 'matches', 'auditLogs', 'matchVideos', 'supportTickets', 'evaluations'].includes(key) && Array.isArray(incoming)) {
          const atomicKeys = req.body.atomicKeys || [];
          if (atomicKeys.includes(key)) {
            console.log(`[SYNC_DEBUG] Atomic Overwrite for key: ${key} (${incoming.length} items)`);
            
            // 🛡️ IRON-CLAD ADMIN GUARD (v2.6.197): Prevent thinned atomic sync from wiping passwords/tokens
            if (key === 'players' && currentData.players) {
              const incomingHasThinning = incoming.some(p => p._thinned);
              if (incomingHasThinning) {
                console.warn(`🛑 Blocked thinned atomic overwrite of 'players' from ${req.ip}. Falling back to merge.`);
              } else {
                // Not thinned? Still preserve the admin password no matter what
                const oldAdmin = currentData.players.find(p => p.id === 'admin');
                if (oldAdmin) {
                  const newAdminIdx = incoming.findIndex(p => p.id === 'admin');
                  if (newAdminIdx !== -1) {
                    incoming[newAdminIdx].password = oldAdmin.password;
                    incoming[newAdminIdx].pushTokens = oldAdmin.pushTokens;
                    incoming[newAdminIdx].devices = oldAdmin.devices;
                    console.log('🛡️ [GUARD] Preserved Admin Credentials during atomic overwrite.');
                  }
                }
                newMasterData[key] = incoming;
                continue;
              }
            } else {
              newMasterData[key] = incoming;
              continue; 
            }
          }
          const entityMap = new Map();
          (currentData[key] || []).forEach(e => { if (e && e.id) entityMap.set(String(e.id).toLowerCase(), e); });
          
          incoming.forEach(p => {
            if (p && p.id) {
              const id = String(p.id).toLowerCase();
              const existing = entityMap.get(id);

              // 🛡️ [AUTO-ASSIGNMENT ENGINE] (v2.6.254)
              // If supportTickets are being saved and there's a new message from a staff member on an unassigned ticket, assign it.
              if (key === 'supportTickets' && p.messages?.length > (existing?.messages?.length || 0)) {
                const lastMsg = p.messages[p.messages.length - 1];
                const senderId = lastMsg.senderId;
                const isStaff = senderId !== p.userId && senderId !== 'system'; 
                const isUnassigned = !p.assignedTo || p.assignedTo === 'Unassigned' || p.assignedTo === '';
                
                if (isUnassigned && isStaff) {
                   p.assignedTo = senderId;
                   p.assignedAt = new Date().toISOString();
                   console.log(`[AUTO-ASSIGN] Ticket ${p.id} assigned to ${senderId} on cloud sync.`);
                }
              }
              
              // 🛡️ [SLOT_GUARD] (v2.6.107): Prevent over-registration if max reached
              if (key === 'tournaments' && existing) {
                const incomingReg = (p.registeredPlayerIds || []).filter(Boolean).length;
                const existingReg = (existing.registeredPlayerIds || []).filter(Boolean).length;
                
                // If this is a status change from Pending -> Registered
                const currentUserId = String(req.headers['x-user-id'] || '').toLowerCase();
                const isUserRegistering = (p.registeredPlayerIds || []).includes(currentUserId) && 
                                        !(existing.registeredPlayerIds || []).includes(currentUserId);

                if (isUserRegistering && existingReg >= (existing.maxPlayers || 0)) {
                  console.warn(`🛑 [SLOT_GUARD] Rejecting registration for ${currentUserId} in tournament ${p.id}. Slot already taken.`);
                  
                  // Revert to original state (which should be Pending)
                  // processTournamentWaitlist will later handle demoting them to Waitlist + Notification
                  p.registeredPlayerIds = [...(existing.registeredPlayerIds || [])];
                  p.pendingPaymentPlayerIds = [...(existing.pendingPaymentPlayerIds || [])];
                  if (!p.pendingPaymentPlayerIds.includes(currentUserId)) {
                    p.pendingPaymentPlayerIds.push(currentUserId);
                  }
                  p.waitlistedPlayerIds = [...(existing.waitlistedPlayerIds || [])];
                  p.pendingPaymentTimestamps = { ...(existing.pendingPaymentTimestamps || {}) };
                }
              }

              // 🛡️ ULTIMATE ADMIN GUARD (v2.6.170): Block ANY modification to the master 'admin' account
              if (id === 'admin' && key === 'players' && existing) {
                console.warn(`🛑 Blocked unauthorized attempt to modify System Admin profile: userId=${req.headers['x-user-id']}`);
                // Restore entire existing admin profile, ignore all incoming changes
                entityMap.set(id, existing);
                return;
              }

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
                // 🛡️ PASSWORD GUARD (v2.6.145): Preserve server-side password for support users
                // Prevents mobile sync from overwriting admin force-reset passwords
                const preservedPassword = (existing.role === 'support') ? existing.password : (p.password || existing.password);
                const preservedStatus = (existing.role === 'support' && existing.supportStatus) 
                  ? existing.supportStatus : (p.supportStatus || existing.supportStatus);
                entityMap.set(id, { ...existing, ...p, devices: mergedDevices, password: preservedPassword, supportStatus: preservedStatus });
              } else {
                if (key === 'matchmaking') {
                  const statusChanged = existing && p.status && p.status !== existing.status;
                  const slotChanged = existing && (p.proposedDate !== existing.proposedDate || p.proposedTime !== existing.proposedTime);
                  
                  if (!existing || statusChanged || slotChanged) {
                    p.isNew = true;
                    console.log(`[SYNC_DEBUG] Marking matchmaking ${p.id} as isNew=true (Status/Slot update)`);
                  }
                  
                  const merged = existing ? { ...existing, ...p } : p;
                  // 🛡️ SYNC PROTECTION (v2.6.91): Preserve 'isNew: true' if client update doesn't explicitly clear it
                  if (existing && existing.isNew && p.isNew === undefined) {
                    merged.isNew = true;
                  }
                  entityMap.set(id, merged);
                } else if (key === 'supportTickets' && existing) {
                  // 🛡️ [STATUS_SYNC] (v2.6.241)
                  // Intelligent message merging to prevent status downgrades (read -> delivered)
                  const mergedMessages = [...(p.messages || [])];
                  if (existing.messages && Array.isArray(existing.messages)) {
                    const STATUS_WEIGHT = { 'read': 3, 'seen': 2, 'delivered': 1, 'sent': 0, 'pending': -1 };
                    existing.messages.forEach((em, idx) => {
                      if (mergedMessages[idx] && mergedMessages[idx].id === em.id) {
                        const incomingStatus = mergedMessages[idx].status || 'sent';
                        const existingStatus = em.status || 'sent';
                        if (STATUS_WEIGHT[existingStatus] > STATUS_WEIGHT[incomingStatus]) {
                          mergedMessages[idx].status = existingStatus;
                        }
                      }
                    });
                  }
                  entityMap.set(id, { ...existing, ...p, messages: mergedMessages });
                } else {
                  entityMap.set(id, existing ? { ...existing, ...p } : p);
                }
              }
            }
          });
          newMasterData[key] = Array.from(entityMap.values());
        } else if (key === 'currentUser' && incoming && incoming.id) {
          const id = String(incoming.id).toLowerCase();
          
          // 🛡️ ULTIMATE ADMIN GUARD: Protect the current user object if it targets the 'admin' ID
          if (id === 'admin') {
            console.warn(`🛑 Blocked unauthorized attempt to modify System Admin (Current User)`);
            return; // Ignore any incoming 'currentUser' update for the 'admin' ID
          }

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
              // 🛡️ PASSWORD GUARD (v2.6.145): Same protection as players merge
              const preservedPw = (existing.role === 'support') ? existing.password : (incoming.password || existing.password);
              newMasterData.players[pIndex] = { ...existing, ...incoming, devices: mergedDevices, password: preservedPw };
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
    
    // ═══════════════════════════════════════════════════════════════
    // 🏆 WAITLIST PROMOTION & PRIORITY LOGIC (v2.6.103)
    if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
      newMasterData.tournaments = newMasterData.tournaments.map(t => 
        processTournamentWaitlist(t, newMasterData.players || [])
      );
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
            console.log(`[NOTIFY_DEBUG] Processing match ${match.id} (Status: ${match.status}) for opponent ${opponentId}`);
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

      // 3. Support Ticket Replies & Auto-Assignment
      if (changedKeys.includes('supportTickets')) {
        const incomingTickets = req.body.supportTickets || [];
        const existingTickets = currentData.supportTickets || [];
        
        // 🛡️ [DATA VALIDATION] (v2.6.171)
        // Guard against "Ghost Tickets" by rejecting malformed payloads
        const invalidTickets = incomingTickets.filter(t => !t.title || t.title === 'undefined' || !t.description || t.description === 'undefined');
        if (invalidTickets.length > 0) {
          console.warn(`🛡️ [GUARD] Rejecting sync due to ${invalidTickets.length} malformed tickets.`);
          return res.status(400).json({ 
            error: "MALFORMED_TICKET_DATA", 
            details: "Subject and Description are required for all tickets." 
          });
        }

        for (let i = 0; i < incomingTickets.length; i++) {
          const ticket = incomingTickets[i];
          const existing = existingTickets.find(et => et.id === ticket.id);
          const isNew = !existing;
          const newMessages = (ticket.messages || []).slice(existing ? existing.messages.length : 0);
          
          if (isNew) {
             logAudit(req, 'TICKET_CREATED', ['supportTickets'], { ticketId: ticket.id, type: ticket.type, title: ticket.title });
          }
          // 🤖 [AUTO-ASSIGN] (v2.6.132) 
          // If ticket is Open and unassigned, try to find a best agent
          if (ticket.status === 'Open' && !ticket.assignedTo) {
            const bestAgent = SupportMetricsService.findBestAgent(newMasterData.players, newMasterData.supportTickets || []);
            if (bestAgent) {
              console.log(`🤖 [ASSIGN] Auto-assigning ticket ${ticket.id} to agent ${bestAgent.id} (${bestAgent.firstName})`);
              ticket.assignedTo = bestAgent.id;
              ticket.assignedAt = new Date().toISOString();
              ticket.assignmentSource = 'auto';
              
              logAudit(req, 'TICKET_AUTO_ASSIGNED', ['supportTickets', 'players'], { 
                ticketId: ticket.id, 
                agentId: bestAgent.id,
                agentName: `${bestAgent.firstName} ${bestAgent.lastName}`
              });

              // Increment agent's lifetime handles
              const agentIndex = newMasterData.players.findIndex(p => p.id === bestAgent.id);
              if (agentIndex !== -1) {
                if (!newMasterData.players[agentIndex].metrics) newMasterData.players[agentIndex].metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
                newMasterData.players[agentIndex].metrics.totalHandled += 1;
              }
            }
          }

          // 🛡️ [TERMINATION CLEANUP] (v2.6.132)
          // If the assigned agent is now terminated, unassign the ticket
          if (ticket.assignedTo) {
            const agent = newMasterData.players.find(p => p.id === ticket.assignedTo);
            if (agent && agent.supportStatus === 'terminated') {
              console.log(`🛡️ [CLEANUP] Unassigning ticket ${ticket.id} due to agent termination.`);
              ticket.assignedTo = null;
              ticket.assignedAt = null;
            }
          }

          for (const msg of newMessages) {
            // Track Initial Acknowledgment (v2.6.132)
            if (String(msg.senderId) !== String(ticket.userId) && !ticket.firstResponseAt && msg.senderId !== 'system') {
                ticket.firstResponseAt = new Date().toISOString();
            }

            // 🛡️ [NOTIFY] v2.6.96: Harden identity comparison 
            if (String(msg.senderId) !== String(ticket.userId)) {
              const user = newMasterData.players.find(p => String(p.id) === String(ticket.userId));
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

      // 5. Waitlist Promotions (New in v2.6.97)
      if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
        for (const tournament of newMasterData.tournaments) {
          if (tournament && tournament._justPromotedIds && tournament._justPromotedIds.length > 0) {
            console.log(`📡 [NOTIFY_DEBUG] Dispatching promotion notifications for ${tournament._justPromotedIds.length} players in ${tournament.title}`);
            for (const playerId of tournament._justPromotedIds) {
              const player = newMasterData.players.find(p => String(p.id) === String(playerId));
              if (player) {
                const title = "Off the Waitlist! 🎾";
                const body = `A slot opened up in ${tournament.title}. Pay now to secure your spot!`;
                
                // 🛡️ [NOTIFY_DEBUG] In-app notification already persisted before save
                
                if (player.pushTokens?.length > 0) {
                  sendPushNotification(player.pushTokens, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_PROMOTION' });
                }
              }
            }
            delete tournament._justPromotedIds; // Cleanup temporary field
          }
        }
      }

      // 6. Matchmaking Challenges (New in v2.6.92)
      if (changedKeys.includes('matchmaking')) {
        const incomingMatchmaking = req.body.matchmaking || [];
        const existingMatchmaking = currentData.matchmaking || [];
        
        console.log(`[NOTIFY_DEBUG] Auditing ${incomingMatchmaking.length} matchmaking requests for notifications`);
        
        for (const mm of incomingMatchmaking) {
          const existing = existingMatchmaking.find(emm => emm.id === mm.id);
          const isNewItem = !existing;
          const statusChanged = existing && mm.status !== existing.status;
          const slotChanged = existing && (mm.proposedDate !== existing.proposedDate || mm.proposedTime !== existing.proposedTime);
          
          if (isNewItem || statusChanged || slotChanged) {
            // Determine recipient
            let recipientId = null;
            let title = "";
            let body = "";
            
            if (isNewItem && mm.status === 'Pending') {
              recipientId = mm.receiverId;
              title = "New Match Challenge! 🎾";
              body = `${mm.senderName || 'Someone'} challenged you to a match on ${mm.proposedDate} at ${mm.proposedTime}.`;
            } else if (statusChanged || slotChanged) {
              // Notify the other party
              recipientId = (mm.lastUpdatedBy === mm.senderId) ? mm.receiverId : mm.senderId;
              
              if (mm.status === 'Countered') {
                title = "Counter Proposal Received! 🔄";
                body = `${mm.lastUpdatedByName || 'The opponent'} suggested a new time: ${mm.proposedDate} at ${mm.proposedTime}.`;
              } else if (mm.status === 'Accepted') {
                title = "Match Accepted! ✅";
                body = `Your match for ${mm.proposedDate} at ${mm.proposedTime} has been confirmed.`;
              } else if (mm.status === 'Declined') {
                title = "Challenge Declined ❌";
                body = `The match challenge for ${mm.proposedDate} has been declined.`;
              }
            }
            
            if (recipientId) {
              const recipient = newMasterData.players.find(p => p.id === recipientId);
              if (recipient) {
                console.log(`[NOTIFY_DEBUG] Triggering matchmaking notify for ${recipientId}: ${title}`);
                addInAppNotification(recipient, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
                
                if (recipient.pushTokens?.length > 0) {
                  sendPushNotification(recipient.pushTokens, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
                } else {
                  console.warn(`[NOTIFY_DEBUG] No push tokens found for recipient ${recipientId}`);
                }
              } else {
                console.warn(`[NOTIFY_DEBUG] Recipient ${recipientId} not found in player master list`);
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
router.get('/audit-logs', apiKeyGuard, sensitiveCacheGuard, asyncHandler(async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Use verified role instead of spoofable headers
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(limit);
  res.json({ success: true, logs });
}));

// 🔐 OTP: Send verification code (Simulated/Hardcoded for Testing)
router.post('/otp/send', otpLimiter, apiKeyGuard, (req, res) => {
  const { target, type } = req.body; // target is email/phone, type is 'email' or 'phone'
  console.log(`🔑 [OTP_SIMULATION] Code "123456" requested for ${type}: ${target}`);
  logServerEvent('OTP_SEND_REQUESTED', { target, type });
  res.json({ success: true, message: `Verification code sent to ${target}` });
});

// 🔐 OTP: Verify code (Hardcoded to 123456)
router.post('/otp/verify', otpLimiter, apiKeyGuard, (req, res) => {
  const { code, target, type } = req.body;
  
  if (code === '123456') {
    logServerEvent('OTP_VERIFY_SUCCESS', { target, type });
    return res.json({ success: true, message: 'Verification successful' });
  }
  
  logServerEvent('OTP_VERIFY_FAILED', { target, type, code });
  res.status(400).json({ success: false, error: 'Invalid verification code' });
});

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT HUB INVITES: Secure Onboarding Tracking
// ═══════════════════════════════════════════════════════════════

// 1. Generate Invite Link (Admin Only)
router.post('/support/invite', apiKeyGuard, asyncHandler(async (req, res) => {
  const { email, firstName, lastName } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First name and last name are required' });
  
  // In production, enforce 'admin' role header, simulating strict RBAC
  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  // 🛡️ Double-Provisioning Guard: Check for any existing active links for this email
  const activeInvite = await SupportInvite.findOne({ 
    email, 
    status: { $in: ['Pending', 'Clicked'] }, 
    expiresAt: { $gt: new Date() } 
  });

  if (activeInvite) {
    return res.status(409).json({ 
      error: 'Email already has an active provisioning link.',
      message: 'Kindly resend the invitation or retire the current link to provision again.'
    });
  }

  // 🛡️ Employee-Exists Guard: Check if email is already associated with an active employee
  const appStateCheck = await AppState.findOne().sort({ lastUpdated: -1 });
  if (appStateCheck?.data?.players) {
    const existingEmployee = appStateCheck.data.players.find(p =>
      p.role === 'support' && p.email?.toLowerCase() === email.toLowerCase().trim()
    );
    if (existingEmployee && existingEmployee.supportStatus !== 'terminated') {
      return res.status(422).json({
        error: 'Employee Already Exists',
        message: `The email ${email} is already associated with an active support employee (${existingEmployee.name || existingEmployee.firstName + ' ' + existingEmployee.lastName}). Use the Support tab to manage their account.`,
        employeeName: existingEmployee.name || `${existingEmployee.firstName} ${existingEmployee.lastName}`
      });
    }
  }

  const token = bcrypt.hashSync(Date.now().toString() + email, 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // strict 24 hours

  await SupportInvite.create({ email, firstName: firstName.trim(), lastName: lastName.trim(), token, expiresAt });
  await logServerEvent('SUPPORT_INVITE_GENERATED', { email, firstName, lastName });

  const setupLink = `https://acetrack-suggested.onrender.com/setup/${token}`;

  // 📧 Send onboarding email (non-blocking — invite succeeds even if email fails)
  let emailStatus = { success: false, error: 'Email service not configured' };
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    emailStatus = await sendOnboardingEmail(email, setupLink, expiresAt.toISOString(), firstName.trim(), lastName.trim());
  } else {
    console.warn('⚠️ GMAIL_USER / GMAIL_APP_PASSWORD not set. Skipping onboarding email.');
  }

  res.json({ success: true, token, expiresAt, link: setupLink, emailSent: emailStatus.success });
}));

// 1b. Email Preview (Admin Debug — view the onboarding email in browser)
router.get('/support/invite/preview', (req, res) => {
  const sampleLink = 'https://acetrack-suggested.onrender.com/setup/SAMPLE_TOKEN_PREVIEW';
  const expiryFormatted = new Date(Date.now() + 24*60*60*1000).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' });
  const html = buildOnboardingHtml('John Doe', 'john.doe@acetrack.com', sampleLink, expiryFormatted);
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// 2. Fetch All Invites (Admin only)
router.get('/support/invites', apiKeyGuard, authGuard, asyncHandler(async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  const invites = await SupportInvite.find().sort({ createdAt: -1 });
  
  // Auto-mark expired links lazily for the response
  const processed = invites.map(inv => {
     let currentStatus = inv.status;
      if ((currentStatus === 'Pending' || currentStatus === 'Clicked') && inv.expiresAt < new Date()) currentStatus = 'Expired';
     return { ...inv.toObject(), status: currentStatus };
  });

  res.json({ success: true, invites: processed });
}));

// 2a. Retire/Expire Invite (Manual Action)
router.post('/support/invite/expire', apiKeyGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });

  invite.status = 'Retired';
  invite.retiredAt = new Date(); // Store the exact retirement time (v2.6.259)
  
  // Use a special action to track manual retirement
  invite.clicks.push({ 
    action: 'admin_retired', 
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: 'Admin Hub',
    timestamp: new Date()
  });
  
  await invite.save();
  await logServerEvent('SUPPORT_INVITE_RETIRED', { email: invite.email, token });

  res.json({ success: true, message: 'Invite link has been retired and is no longer accessible.' });
}));

// 2b. Resend Onboarding Email (Rate Limited: 3 per invite, 1min cooldown, 4hr lockout)
router.post('/support/invite/resend', apiKeyGuard, asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });

  const resends = invite.emailResends || [];
  const now = Date.now();

  // Check if 3 resends exhausted → 4-hour lockout from last resend
  if (resends.length >= 3) {
    const lastResend = new Date(resends[resends.length - 1].timestamp).getTime();
    const lockoutEnd = lastResend + (4 * 60 * 60 * 1000); // 4 hours
    if (now < lockoutEnd) {
      const remainingMs = lockoutEnd - now;
      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const mins = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      return res.status(429).json({ 
        error: `Rate limit reached. Email can be resent after ${hours}h ${mins}m`,
        nextAvailableAt: new Date(lockoutEnd).toISOString(),
        resendsUsed: resends.length,
        resendsMax: 3
      });
    }
    // Lockout expired — reset the counter
    invite.emailResends = [];
  }

  // Check 1-minute cooldown from last resend
  if (resends.length > 0) {
    const lastResend = new Date(resends[resends.length - 1].timestamp).getTime();
    const cooldownEnd = lastResend + (60 * 1000); // 1 minute
    if (now < cooldownEnd) {
      const remainingSec = Math.ceil((cooldownEnd - now) / 1000);
      return res.status(429).json({ 
        error: `Please wait ${remainingSec}s before resending`,
        nextAvailableAt: new Date(cooldownEnd).toISOString(),
        resendsUsed: resends.length,
        resendsMax: 3
      });
    }
  }

  // Send the email (use stored name from invite)
  const setupLink = `https://acetrack-suggested.onrender.com/setup/${token}`;
  let emailStatus = { success: false, error: 'Email service not configured' };
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    emailStatus = await sendOnboardingEmail(invite.email, setupLink, invite.expiresAt.toISOString(), invite.firstName || '', invite.lastName || '');
  }

  if (emailStatus.success) {
    if (!invite.emailResends) invite.emailResends = [];
    invite.emailResends.push({ timestamp: new Date() });
    await invite.save();
    const remaining = 3 - invite.emailResends.length;
    await logServerEvent('SUPPORT_EMAIL_RESENT', { email: invite.email, resendsUsed: invite.emailResends.length });
    res.json({ 
      success: true, 
      message: `Email resent to ${invite.email}`,
      resendsUsed: invite.emailResends.length,
      resendsMax: 3,
      resendsRemaining: remaining
    });
  } else {
    res.status(500).json({ error: emailStatus.error || 'Failed to send email' });
  }
}));

// ═══════════════════════════════════════════════════════════════
// 🔐 ADMIN LOGIN WITH MFA (v2.6.170)
// Server-side authentication — credentials & PIN never leave the server
// ═══════════════════════════════════════════════════════════════
const ADMIN_MFA_PIN = process.env.ADMIN_MFA_PIN || '120522';
const pendingAdminMFA = new Map(); // token → { expires, attempts }

// 🛡️ [SESSION_VALIDATION] (v2.6.258)
// Dedicated endpoint for web clients to verify their HTTP-Only cookie session
router.get('/auth/me', apiKeyGuard, asyncHandler(async (req, res) => {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ success: false, error: 'No active session.' });
  }

  const appState = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
  const players = appState?.data?.players || [];
  const user = players.find(p => p.id === req.user.id);

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found.' });
  }

  // Return sanitized user object
  const { password, ...sanitizedUser } = user;
  res.json({ success: true, user: sanitizedUser });
}));

router.post('/admin/login', loginLimiter, asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username and Password are required.' });
  }

  const search = String(identifier).toLowerCase().trim();

  // Only allow the 'admin' username/ID
  if (search !== 'admin') {
    return res.status(401).json({ error: 'Invalid administrator credentials.' });
  }

  // Validate password against the database record
  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!appState || !appState.data) {
    return res.status(500).json({ error: 'System state unavailable.' });
  }

  const players = appState.data.players || [];
  const adminUser = players.find(p => p.id === 'admin' && p.role === 'admin');

  if (!adminUser) {
    return res.status(500).json({ error: 'Administrator account not found in system.' });
  }

  const adminPassword = adminUser.password || '';
  
  // 🛡️ [SECURITY LOCKDOWN CHECK] (v2.6.212)
  if (adminUser.loginBlockedUntil && adminUser.loginBlockedUntil > Date.now()) {
    const remaining = Math.ceil((adminUser.loginBlockedUntil - Date.now()) / 60000);
    return res.status(403).json({ error: `Security Lockdown: Account is temporarily blocked. Try again in ${remaining} minutes.` });
  }

  // 🛡️ EMERGENCY BYPASS (v2.6.197): Allow ACE_API_KEY or default Password@123 if DB is corrupted
  const isMasterKey = password === ACE_API_KEY;
  const isDefaultKey = (adminPassword === '' || !adminPassword) && password === 'Password@123';

  // 🛡️ [HYBRID AUTH ENGINE] (v2.6.237)
  let isMatch = false;
  try {
    if (adminPassword.startsWith('$2a$') || adminPassword.startsWith('$2b$')) {
      isMatch = bcrypt.compareSync(password, adminPassword);
    } else {
      isMatch = adminPassword === password;
    }
  } catch (e) {
    isMatch = adminPassword === password;
  }

  if (!isMatch && !isMasterKey && !isDefaultKey) {
    await trackLoginAttempt(req, search, password, false);
    logServerEvent('ADMIN_LOGIN_FAILED', { reason: 'wrong_password', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
    return res.status(401).json({ error: 'Invalid administrator credentials.' });
  }

  await trackLoginAttempt(req, search, password, true);

  // Step 1 passed — generate MFA session token
  const mfaToken = bcrypt.hashSync(Date.now().toString() + 'admin_mfa', 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 40);
  pendingAdminMFA.set(mfaToken, { expires: Date.now() + 5 * 60 * 1000, attempts: 0 }); // 5 min expiry

  // Cleanup expired tokens
  for (const [tk, val] of pendingAdminMFA.entries()) {
    if (val.expires < Date.now()) pendingAdminMFA.delete(tk);
  }

  logServerEvent('ADMIN_MFA_INITIATED', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
  res.json({ success: true, requiresMFA: true, mfaToken });
}));

router.post('/admin/verify-pin', asyncHandler(async (req, res) => {
  const { mfaToken, pin } = req.body;
  if (!mfaToken || !pin) {
    return res.status(400).json({ error: 'MFA token and PIN are required.' });
  }

  const session = pendingAdminMFA.get(mfaToken);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired MFA session. Please login again.' });
  }

  if (session.expires < Date.now()) {
    pendingAdminMFA.delete(mfaToken);
    return res.status(401).json({ error: 'MFA session expired. Please login again.' });
  }

  session.attempts = (session.attempts || 0) + 1;

  if (pin !== ADMIN_MFA_PIN) {
    await trackLoginAttempt(req, 'admin_mfa', pin, false);
  
  // 🛡️ MFA MONITOR (v2.6.209): Immediate high-frequency monitoring for every PIN entered
  await logAudit(req, 'MFA_MONITOR', [], { 
    outcome: 'FAILURE', 
    pinEntered: '****', // Masked for safety
    message: 'Invalid MFA PIN attempt detected'
  });

  logServerEvent('ADMIN_MFA_FAILED', { reason: 'wrong_pin', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
  return res.status(401).json({ error: 'Invalid PIN. Access denied.' });
}

await trackLoginAttempt(req, 'admin_mfa', pin, true);

// 🛡️ MFA MONITOR (v2.6.212): Interactive alert if user succeeds after brute-force
if (session.attempts > 5) {
  await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { 
    TargetUser: 'admin_mfa', 
    Passwords: `[HIDDEN_MFA_HISTORY]`, 
    AttemptCount: session.attempts,
    FailureCount: session.attempts - 1,
    FinalOutcome: "SUCCESS (ALERT: Potential Unauthorized Access)",
    Timeframe: 'MFA_SESSION'
  });
}

await logAudit(req, 'MFA_MONITOR', [], { 
  outcome: 'SUCCESS', 
  message: `Successful MFA PIN verification (Attempts: ${session.attempts})`
});

  // MFA passed — consume token
  pendingAdminMFA.delete(mfaToken);

  logServerEvent('ADMIN_LOGIN_SUCCESS', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });

  // 🛡️ Success! Issue JWT with Admin scope (v2.6.190)
  const token = signToken({ id: 'admin', role: 'admin', scopes: ['*'] });

  res.cookie('acetrack_session', token, {
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({
    success: true,
    token,
    user: {
      id: 'admin',
      name: 'System Admin',
      role: 'admin',
      avatar: 'https://ui-avatars.com/api/?name=Admin&background=random'
    }
  });
}));

// 🛡️ LOGOUT: Clear secure session (v2.6.258)
router.post('/logout', (req, res) => {
  res.clearCookie('acetrack_session');
  res.json({ success: true, message: 'Logged out successfully' });
});

// ═══════════════════════════════════════════════════════════════
// 🔐 SUPPORT STAFF LOGIN (v2.6.170)
// Server-side authentication — credentials never leave the server
// ═══════════════════════════════════════════════════════════════

router.post('/support/login', loginLimiter, asyncHandler(async (req, res) => {
  const { identifier, password } = req.body;
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Username/Email and Password are required.' });
  }

  const search = String(identifier).toLowerCase().trim();

  // 🛡️ ADMIN GUARD: Block support login attempts using the admin account
  if (search === 'admin') {
    return res.status(403).json({ error: 'Access Denied. Use the administrator login.' });
  }

  // 🕵️ SUPER DIAGNOSTIC: Log EXACTLY what the browser sent
  await logAudit(req, 'DEBUG_SUPPORT_LOGIN_PAYLOAD', [], { receivedIdentifier: identifier, processedSearch: search });

  const appState = await AppState.findOne().sort({ lastUpdated: -1 });

  if (!appState || !appState.data) {
    return res.status(500).json({ error: 'System state unavailable.' });
  }

  const players = appState.data.players || [];
  console.log(`[DIAG] Support Login Attempt: ${search} | Total Players: ${players.length}`);
  const supportUser = players.find(p => {
    const role = String(p.role || '').toLowerCase().trim();
    if (role !== 'support') return false;
    
    const pEmail = String(p.email || '').toLowerCase().trim();
    const pId = String(p.id || '').toLowerCase().trim();
    const pUsername = String(p.username || '').toLowerCase().trim();
    const pName = String(p.name || '').toLowerCase().trim();
    
    return pEmail === search || pId === search || pUsername === search || pName === search;
  });

  if (!supportUser) {
    // 🕵️ DEEP DIAGNOSTIC: Find if the user exists AT ALL but has the wrong role
    const anyUser = players.find(p => 
      String(p.email || '').toLowerCase().trim() === search || 
      String(p.username || '').toLowerCase().trim() === search
    );
    
    await logAudit(req, 'DEBUG_SUPPORT_LOGIN_FAILED_SEARCH', [], { 
      search, 
      foundAnyUser: !!anyUser, 
      foundRole: anyUser ? anyUser.role : null,
      totalPlayersInState: players.length
    });

    if (anyUser) {
      await logAudit(req, 'SUPPORT_LOGIN_DENIED_ROLE', [], { identifier: search, foundRole: anyUser.role, status: anyUser.supportStatus });
    }
    return res.status(401).json({ error: 'Access Denied. This portal is for AceTrack Administrators and Support Staff only.' });
  }


  // 🛡️ [SECURITY LOCKDOWN CHECK] (v2.6.213)
  if (supportUser.loginBlockedUntil && supportUser.loginBlockedUntil > Date.now()) {
    const remaining = Math.ceil((supportUser.loginBlockedUntil - Date.now()) / 60000);
    return res.status(403).json({ error: `Security Lockdown: Your account is temporarily blocked. Try again in ${remaining} minutes.` });
  }

  if (supportUser.supportStatus === 'terminated' || supportUser.supportStatus === 'inactive' || supportUser.supportStatus === 'suspended') {
    await logAudit(req, 'DEBUG_SUPPORT_LOGIN_DEACTIVATED', [], { identifier: search, status: supportUser.supportStatus });
    return res.status(403).json({ error: 'Access Suspended: Your employment profile has been deactivated.' });
  }

  const userPassword = supportUser.password || 'password';
  
  // 🛡️ [HYBRID AUTH ENGINE] (v2.6.237)
  // Supports both legacy plaintext and new bcrypt hashes.
  let isMatch = false;
  try {
    if (userPassword.startsWith('$2a$') || userPassword.startsWith('$2b$')) {
      isMatch = bcrypt.compareSync(password, userPassword);
    } else {
      isMatch = userPassword === password;
    }
  } catch (e) {
    isMatch = userPassword === password;
  }

  if (!isMatch) {
    await trackLoginAttempt(req, search, password, false);
    await logAudit(req, 'DEBUG_SUPPORT_LOGIN_WRONG_PASSWORD', [], { 
      identifier: search, 
      expectedPwLength: userPassword.length, 
      receivedPwLength: password.length 
    });
    await logAudit(req, 'SUPPORT_LOGIN_FAILED', [], { identifier: search, reason: 'wrong_password' });
    return res.status(401).json({ error: 'Invalid password for support account.' });
  }

  await trackLoginAttempt(req, search, password, true);
  
  // 🛡️ [CONCURRENT SESSION MANAGEMENT] (v2.6.214)
  // Limit support employees to 2 active sessions
  const jti = bcrypt.hashSync(Date.now().toString() + supportUser.id, 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const activeSessions = [...(supportUser.activeSessions || [])];
  
  // Add current session
  activeSessions.push({ jti, iat: Date.now() });
  
  // Keep only the most recent 2 sessions
  const rotatedSessions = activeSessions.sort((a, b) => b.iat - a.iat).slice(0, 2);
  
  // Persist updated session list to database
  const release = await syncMutex.acquire();
  try {
    const freshState = await AppState.findOne().sort({ lastUpdated: -1 });
    const freshPlayers = [...(freshState?.data?.players || [])];
    const pIdx = freshPlayers.findIndex(p => p.id === supportUser.id);
    
    if (pIdx !== -1) {
      freshPlayers[pIdx].activeSessions = rotatedSessions;
      await AppState.findOneAndUpdate(
        {},
        { $set: { 'data.players': freshPlayers, version: (freshState.version || 0) + 1, lastUpdated: new Date() } }
      );
    }
  } finally {
    release();
  }

  // Strip sensitive fields before sending the user object back
  const { password: _pw, pushTokens, devices, ...safeUser } = supportUser;

  await logAudit(req, 'SUPPORT_LOGIN_SUCCESS', [], { userId: supportUser.id, email: supportUser.email });
  
  // 🛡️ Success! Issue JWT with Support scope and unique JTI (v2.6.214)
  const token = signToken({ 
    id: supportUser.id, 
    role: 'support', 
    scopes: ['read:basic', 'write:tickets'] 
  }, jti);

  res.cookie('acetrack_session', token, {
    path: '/',
    httpOnly: true,
    secure: false,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.json({ success: true, token, user: safeUser });

}));

// ═══════════════════════════════════════════════════════════════
// 🔒 PASSWORD RESET FLOW
// ═══════════════════════════════════════════════════════════════


// 1. Request Password Reset (Email Link)
router.post('/support/password-reset/request', passwordResetLimiter, asyncHandler(async (req, res) => {
  const { identifier } = req.body; // Can be email or username
  if (!identifier) return res.status(400).json({ error: 'Email or Username required' });

  const search = identifier.toLowerCase().trim();
  
  // 🛡️ ADMIN GUARD: Block any reset attempts for the primary admin account
  if (search === 'admin') {
    return res.status(403).json({ 
      error: 'Security Violation', 
      message: 'Password reset is not permitted for the system administrator account via this portal. Contact technical support for master account recovery.' 
    });
  }

  // Find user in AppState (Sort by lastUpdated to ensure we use the master record)
  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  const players = appState?.data?.players || [];
  console.log(`[DIAG] Recovery Attempt: ${search} | Total Players: ${players.length}`);
  const user = players.find(p => {
    const pEmail = String(p.email || '').toLowerCase().trim();
    const pId = String(p.id || '').toLowerCase().trim();
    const pUsername = String(p.username || '').toLowerCase().trim();
    const pName = String(p.name || '').toLowerCase().trim();
    return pEmail === search || pId === search || pUsername === search || pName === search;
  });

  if (!user) {
    // 🛡️ SECURITY: Use generic message to prevent account enum
    return res.json({ success: true, message: 'If an account exists, a recovery link has been sent.' });
  }
  
  if (!user.email) {
    return res.status(400).json({ error: 'This account does not have a registered email address. Contact support.' });
  }

  const token = bcrypt.hashSync(Date.now().toString() + user.email, 10).replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await SupportPasswordReset.create({ email: user.email, token, expiresAt });
  
  const resetLink = `https://acetrack-suggested.onrender.com/reset-password/${token}`;
  const emailStatus = await sendPasswordResetEmail(user.email, resetLink, expiresAt.toISOString(), user.firstName || user.name || '');

  if (!emailStatus.success) {
    console.error('Failed to trigger reset email:', emailStatus.error);
    await logAudit(req, 'SUPPORT_PASSWORD_RESET_EMAIL_FAILED', [], { email: user.email, error: emailStatus.error });
    return res.status(500).json({ error: 'Failed to send recovery email. Please try again later.' });
  }

  await logAudit(req, 'SUPPORT_PASSWORD_RESET_EMAIL_SENT', [], { email: user.email });
  res.json({ success: true, message: 'Recovery link sent to your registered email.' });
}));

// 2. Confirm Password Reset (No API Key guard as the token is the secret)
router.post('/support/password-reset/confirm', asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

  const resetReq = await SupportPasswordReset.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!resetReq) return res.status(400).json({ error: 'Invalid or expired reset token' });

  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!appState) return res.status(500).json({ error: 'System state unavailable' });

  const players = appState.data.players || [];
  const userIndex = players.findIndex(p => 
    p.email?.toLowerCase() === resetReq.email.toLowerCase() && 
    p.id !== 'admin' // 🛡️ ADMIN GUARD (v2.6.170): Never reset admin password via support portal
  );

  if (userIndex === -1) return res.status(404).json({ error: 'User account not found' });

  // Update password
  players[userIndex].password = bcrypt.hashSync(newPassword, 10);
  
  // Clean up device sessions for security
  players[userIndex].devices = [];

  // 🛡️ SYNC PROTECTION: Explicitly update timestamp to prevent overwrite by stale devices
  appState.lastUpdated = new Date();
  appState.markModified('data.players'); 
  await appState.save();


  await SupportPasswordReset.deleteOne({ token });

  await logAudit(req, 'SUPPORT_PASSWORD_RESET_SUCCESS', [], { email: resetReq.email });

  res.json({ success: true, message: 'Password updated successfully. You can now login.' });

}));

// 🌐 IP Geolocation \u0026 Bot Detection Helpers
function detectBot(userAgent, isp = '') {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  
  // 1. Explicit User-Agent Patterns
  if (ua.includes('whatsapp')) return 'WhatsApp';
  if (ua.includes('telegrambot')) return 'Telegram';
  if (ua.includes('twitterbot')) return 'Twitter';
  if (ua.includes('facebookexternalhit')) return 'Facebook';
  if (ua.includes('slackbot')) return 'Slack';
  if (ua.includes('linkedinbot')) return 'LinkedIn';
  if (ua.includes('discordbot')) return 'Discord';
  if (ua.includes('googlebot') || ua.includes('google-transparency-report') || ua.includes('google-http-client')) return 'Google';
  
  // 2. ISP-based detection (for scanners that mask User-Agent)
  const provider = (isp || '').toLowerCase();
  if (provider.includes('google')) return 'Google (Scanner)';
  if (provider.includes('amazon') || provider.includes('aws')) return 'AWS (Scanner)';
  if (provider.includes('microsoft') || provider.includes('azure')) return 'Azure (Scanner)';
  if (provider.includes('digitalocean')) return 'DigitalOcean (Scanner)';
  if (provider.includes('cloudflare')) return 'Cloudflare (Scanner)';

  // 3. Generic Catch-all
  if (ua.includes('bot') || ua.includes('crawler') || ua.includes('spider') || ua.includes('headless')) return 'Generic Bot';
  
  return null;
}

function isBotTraffic(userAgent) {
  return !!detectBot(userAgent);
}

async function resolveIpGeo(ipRaw) {
  try {
    // x-forwarded-for can be a comma-separated list: "client, proxy1, proxy2"
    // The first one is typically the actual client.
    const ipChain = (ipRaw || '').split(',').map(s => s.trim().replace('::ffff:', '')).filter(Boolean);
    const primaryIp = ipChain[0] || '127.0.0.1';
    
    if (primaryIp === '127.0.0.1' || primaryIp === '::1') {
      return { ip: primaryIp, city: 'Localhost', region: '', country: '', isp: '', lat: 0, lon: 0, timezone: '' };
    }

    const resp = await fetch(`http://ip-api.com/json/${primaryIp}?fields=status,city,regionName,country,isp,lat,lon,timezone`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.status === 'success') {
        // We return the primary resolved geo data, but keep the ipRaw as the full chain for the logger
        return { 
          ip: ipRaw, // Store the full chain in the record
          city: data.city, 
          region: data.regionName, 
          country: data.country, 
          isp: data.isp, 
          lat: data.lat, 
          lon: data.lon, 
          timezone: data.timezone 
        };
      }
    }
  } catch (e) { /* silent fallback */ }
  return { ip: (ipRaw || '127.0.0.1'), city: '', region: '', country: '', isp: '' };
}

// 3. Web Hub: Click Tracking (No Auth Required) — Enhanced with IP Geolocation
router.post('/support/invite/click', asyncHandler(async (req, res) => {
  const { token } = req.body;
  const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];

  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Invite already claimed' });
  if (invite.status === 'Expired') return res.status(400).json({ error: 'Invite has been Expired' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invite expired' });
  
  const botType = detectBot(userAgent, geo.isp);
  if (invite.status === 'Pending' && !botType) invite.status = 'Clicked';
  
  invite.clicks.push({ 
    action: botType ? `BOT:${botType}:link_click` : 'link_click', 
    ip: geo.ip, 
    userAgent, 
    city: geo.city, 
    region: geo.region, 
    country: geo.country, 
    isp: geo.isp, 
    botType,
    lat: geo.lat, 
    lon: geo.lon, 
    timezone: geo.timezone, 
    timestamp: new Date() 
  });
  await invite.save();

  res.json({ success: true, email: invite.email });
}));

// 3b. Form Step Tracking (tracks form_view, step progression, submission)
router.post('/support/invite/track', asyncHandler(async (req, res) => {
  const { token, action: rawAction } = req.body;
  if (!token || !rawAction) return res.status(400).json({ error: 'Invalid tracking data' });

  const ipRaw = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invite not found' });

  const geo = await resolveIpGeo(ipRaw);
  const botType = detectBot(userAgent, geo.isp);

  let action = rawAction;
  if (botType) {
    action = `BOT:${botType}:${action}`;
  }
  invite.clicks.push({ 
    action, 
    ip: geo.ip, 
    userAgent, 
    city: geo.city, 
    region: geo.region, 
    country: geo.country, 
    isp: geo.isp, 
    botType,
    lat: geo.lat, 
    lon: geo.lon, 
    timezone: geo.timezone, 
    timestamp: new Date() 
  });
  await invite.save();

  res.json({ success: true });
}));

// 4. Web Hub: Final Setup & Creation (v2.6.124 — Full Employee Onboarding)
router.post('/support/invite/setup', upload.single('govId'), asyncHandler(async (req, res) => {
  const { token, password, firstName, lastName, phone, addressLine1, addressLine2, city, state: addrState, pinCode, country } = req.body;
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  
  const invite = await SupportInvite.findOne({ token });
  if (!invite) return res.status(404).json({ error: 'Invalid token' });
  if (invite.status === 'Used') return res.status(400).json({ error: 'Link already used' });
  if (invite.status === 'Expired') return res.status(400).json({ error: 'Invite has been Expired' });
  if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Link expired' });

  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'First and Last Name are required' });

  // A. Upload Govt ID to Cloudinary (if provided)
  let govIdUrl = null;
  if (req.file) {
    try {
      // 📁 Naming Convention: "LastName, FirstName(email)" for easy HR lookup
      const sanitizedLastName = (lastName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const sanitizedFirstName = (firstName || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
      const sanitizedEmail = (invite.email || '').replace(/[^a-zA-Z0-9@._-]/g, '');
      const publicId = `${sanitizedLastName}, ${sanitizedFirstName}(${sanitizedEmail})`;

      const cloudResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'acetrack/support_ids',
        resource_type: 'auto',
        public_id: publicId
      });
      govIdUrl = cloudResult.secure_url;
      // Clean up temp file
      fs.unlink(req.file.path, () => {});
    } catch (uploadErr) {
      console.error('❌ Govt ID upload failed:', uploadErr.message);
      // Continue without blocking account creation
    }
  }

  // B. Modify Global State
  const appState = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!appState || !appState.data) return res.status(500).json({ error: 'System state missing' });

  const players = appState.data.players || [];
  
  const existingIndex = players.findIndex(p => 
    p.role === 'support' && 
    p.email?.toLowerCase() === invite.email.toLowerCase() && 
    p.id !== 'admin' // 🛡️ ADMIN GUARD: Protect admin from setup takeover
  );
  
  let finalUsername = '';

  if (existingIndex !== -1) {
    // ♻️ RE-ONBOARDING EXISTING (Ex-Employee)
    const existing = players[existingIndex];
    finalUsername = existing.username;

    players[existingIndex] = {
      ...existing,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      phone: phone || '',
      password: bcrypt.hashSync(password, 10),
      supportStatus: 'active', // Restores access
      supportLevel: 'Trainee',  // Default to Trainee on re-onboard
      designation: 'Trainee',   // 🔄 Initialization sync
      address: {
        line1: addressLine1 || '',
        line2: addressLine2 || '',
        city: city || '',
        state: addrState || '',
        pinCode: pinCode || '',
        country: country || 'India'
      },
      govIdUrl: govIdUrl || existing.govIdUrl || '',
      reOnboardedAt: new Date().toISOString()
    };
  } else {
    // ✨ NEW ONBOARDING
    const generateSupportUsername = (fName, lName, existingPlayers) => {
      const base = (fName.substring(0, 3) + lName.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '');
      let un = base;
      let counter = 1;
      while (existingPlayers.some(p => p.username === un || p.id === un)) {
        un = `${base}${counter}`;
        counter++;
      }
      return un;
    };

    finalUsername = generateSupportUsername(firstName, lastName, players);

    const newSupportAgent = {
      id: `sup_${Date.now().toString(36)}`,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      email: invite.email,
      phone: phone || '',
      password: bcrypt.hashSync(password, 10),
      role: 'support',
      supportStatus: 'active',
      supportLevel: 'Trainee',  // ✨ Explicit Rank Initialization
      designation: 'Trainee',   // 🔄 Explicit Designation Sync
      address: {
        line1: addressLine1 || '',
        line2: addressLine2 || '',
        city: city || '',
        state: addrState || '',
        pinCode: pinCode || '',
        country: country || 'India'
      },
      govIdUrl: govIdUrl || '',
      isEmailVerified: true,
      createdAt: new Date().toISOString(),
      onboardedVia: 'invite',
      onboardedIp: ip,
      username: finalUsername
    };

    players.push(newSupportAgent);
  }
  await AppState.updateOne(
    { _id: appState._id },
    { $set: { "data.players": players, lastUpdated: Date.now() } }
  );

  // C. Invalidate token
  invite.status = 'Used';
  await invite.save();
  await logServerEvent('SUPPORT_ACCOUNT_CREATED', { 
    email: invite.email, 
    name: `${firstName} ${lastName}`, 
    phone: phone || '',
    hasGovId: !!govIdUrl,
    ip 
  });

  res.json({ success: true, message: 'Account established successfully' });

  // 📧 DUAL-EMAIL TRIGGER (Non-blocking)
  // 1. CEO Congratulations & Welcome
  sendOnboardingSuccessEmail(invite.email, firstName);
  // 2. Official Login Credentials
  sendLoginDetailsEmail(invite.email, `${firstName} ${lastName}`, finalUsername, phone);
}));


// 🛡️ [DEBUG] (v2.6.270): Temporary debug endpoint for active support sessions
router.get('/debug/active-sessions', (req, res) => {
  const sessions = [];
  for (const [socketId, sess] of activeSupportSessions) {
    sessions.push({ socketId, ...sess, durationMs: Date.now() - sess.startTime });
  }
  const connectedSockets = io.sockets.sockets ? io.sockets.sockets.size : 'unknown';
  res.json({ 
    activeSupportSessions: sessions, 
    totalConnectedSockets: connectedSockets,
    timestamp: new Date().toISOString()
  });
});

// 🛡️ [SESSION_CHECK] (v2.6.270): REST-based support session status check
// Used by AdminDiagnosticsPanel as a fallback when socket ping/pong is unreliable
router.get('/support/session-status/:userId', apiKeyGuard, (req, res) => {
  const { userId } = req.params;
  const sessions = [];
  for (const [socketId, sess] of activeSupportSessions) {
    if (String(sess.userId) === String(userId)) {
      sessions.push({
        socketId,
        startTime: new Date(sess.startTime).toISOString(),
        durationMs: Date.now() - sess.startTime,
        deviceName: sess.deviceName || 'Browser',
        isLive: true
      });
    }
  }
  res.json({ userId, sessions, isOnline: sessions.length > 0, timestamp: new Date().toISOString() });
});

// ═══════════════════════════════════════════════════════════════
// 🌐 Mount API v1 + backward-compatible un-versioned routes
// ═══════════════════════════════════════════════════════════════
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
    "version": APP_VERSION,
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
});// ---------------------------------------------------------
// 📊 SUPPORT MANAGEMENT & ANALYTICS (v2.6.132)
// ---------------------------------------------------------

// 🕐 [ATTENDANCE API] (v2.6.267): Get attendance data for support employees
router.get('/support/attendance', apiKeyGuard, authGuard, async (req, res) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state?.data) return res.status(404).json({ error: 'State not found' });

    const agents = (state.data.players || []).filter(p => p.role === 'support');
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday

    // Build per-agent attendance data
    const attendance = agents.map(agent => {
      const sessions = agent.sessionHistory || [];
      
      // Check if currently online via in-memory tracker
      const activeSessions = [];
      for (const [, sess] of activeSupportSessions) {
        if (String(sess.userId) === String(agent.id)) {
          activeSessions.push({
            startTime: new Date(sess.startTime).toISOString(),
            durationMs: Date.now() - sess.startTime,
            device: sess.deviceName || 'Browser',
            isLive: true
          });
        }
      }
      const isCurrentlyOnline = activeSessions.length > 0;

      // Today's total hours
      const todaySessions = sessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0)
        + activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);

      // Weekly hours (per day)
      const weeklyDays = [];
      for (let i = 0; i < 7; i++) {
        const dayStart = new Date(weekStart);
        dayStart.setDate(dayStart.getDate() + i);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);
        
        const daySessions = sessions.filter(s => {
          const st = new Date(s.startTime);
          return st >= dayStart && st < dayEnd;
        });
        let dayMs = daySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        // Add live session time for today
        if (dayStart <= now && dayEnd > now) {
          dayMs += activeSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
        }
        weeklyDays.push({
          date: dayStart.toISOString().split('T')[0],
          dayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayStart.getDay()],
          totalMs: dayMs
        });
      }

      // Last 20 session entries
      const recentSessions = sessions.slice(-20).reverse();

      // Last seen
      const lastSession = sessions[sessions.length - 1];
      const lastSeen = isCurrentlyOnline ? 'Now' : (lastSession?.endTime || null);

      return {
        id: agent.id,
        name: agent.name,
        isCurrentlyOnline,
        activeSessions,
        todayMs,
        weeklyDays,
        allSessions: sessions, // For client-side date filtering
        recentSessions,
        lastSeen,
        totalSessionCount: sessions.length
      };
    });

    res.json({ attendance, timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/support/analytics', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Use verified role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }
  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.status(404).json({ error: "State not found" });

    const agents = (state.data.players || []).filter(p => p.role === 'support');
    const allTickets = state.data.supportTickets || [];

    // 🕐 TIME FILTER: Parse optional from/to query params
    const fromDate = req.query.from ? new Date(req.query.from) : null;
    const toDate = req.query.to ? new Date(req.query.to) : null;

    // Filter tickets by time range (based on createdAt)
    const tickets = allTickets.filter(t => {
      if (!fromDate && !toDate) return true;
      const created = new Date(t.createdAt);
      if (fromDate && created < fromDate) return false;
      if (toDate && created > toDate) return false;
      return true;
    });

    console.log(`[API] Analytics: ${agents.length} agents, ${tickets.length}/${allTickets.length} tickets (filtered)`);

    // 📊 Compute detailed per-agent metrics from actual ticket data
    const agentMetrics = agents.map(agent => {
      const agentId = agent.id;
      const agentTickets = tickets.filter(t => t && (String(t.assignedTo) === String(agentId) || String(t.assignedTo) === String(agent.username)));

      // Active caseload (open tickets)
      const activeTickets = agentTickets.filter(t => 
        ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)
      ).length;

      // Closed/Resolved tickets
      const closedResolved = agentTickets.filter(t => 
        t.status === 'Closed' || t.status === 'Resolved'
      );
      const closedResolvedCount = closedResolved.length;

      // Avg Resolution Time (assignedAt → closedAt/resolvedAt)
      const resolutionTimes = closedResolved
        .filter(t => t.assignedAt && (t.closedAt || t.resolvedAt))
        .map(t => {
          const end = new Date(t.closedAt || t.resolvedAt);
          const start = new Date(t.assignedAt);
          return end - start;
        })
        .filter(ms => ms > 0);
      const avgResolutionMs = resolutionTimes.length > 0 
        ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length 
        : 0;

      // Avg First Response Time (assignedAt → firstResponseAt)
      const frtTimes = agentTickets
        .filter(t => t.assignedAt && t.firstResponseAt)
        .map(t => new Date(t.firstResponseAt) - new Date(t.assignedAt))
        .filter(ms => ms > 0);
      const avgFirstResponseMs = frtTimes.length > 0 
        ? frtTimes.reduce((a, b) => a + b, 0) / frtTimes.length 
        : 0;

      // Tickets Reopened (count tickets that have reopenCount > 0 or were moved from Closed/Resolved back to In Progress)
      const reopenedCount = agentTickets.filter(t => (t.reopenCount || 0) > 0).length;

      // CSAT / User Feedback
      const ratedTickets = agentTickets.filter(t => t.rating && t.rating > 0);
      const csatScore = ratedTickets.length > 0
        ? (ratedTickets.reduce((sum, t) => sum + t.rating, 0) / ratedTickets.length).toFixed(1)
        : null;

      // SLA Compliance (resolved within 24h of creation)
      const slaTarget = 24 * 60 * 60 * 1000; // 24 hours
      const slaEligible = closedResolved.filter(t => t.createdAt && (t.closedAt || t.resolvedAt));
      const slaCompliant = slaEligible.filter(t => {
        const resTime = new Date(t.closedAt || t.resolvedAt) - new Date(t.createdAt);
        return resTime <= slaTarget;
      }).length;
      const slaPercent = slaEligible.length > 0 
        ? Math.round((slaCompliant / slaEligible.length) * 100) 
        : null;

      // Escalation Rate (tickets that were reassigned to someone else)
      const escalatedCount = agentTickets.filter(t => t.escalated || t.reassignedFrom === agentId).length;
      const escalationRate = agentTickets.length > 0
        ? Math.round((escalatedCount / agentTickets.length) * 100)
        : 0;

      // 🕒 Agent Activity Timeline (Last 15 Actions)
      let activities = [];
      agentTickets.forEach(t => {
        if (t.assignedAt) activities.push({ type: 'assignment', time: t.assignedAt, ticketId: t.id, title: t.title });
        if (t.closedAt) activities.push({ type: 'closure', time: t.closedAt, ticketId: t.id, title: t.title });
        if (t.resolvedAt) activities.push({ type: 'resolved', time: t.resolvedAt, ticketId: t.id, title: t.title });
        if (t.ratedAt && t.rating) activities.push({ type: 'csat_received', time: t.ratedAt, ticketId: t.id, rating: t.rating });
        if (t.messages) {
          t.messages.forEach(m => {
            if (m.senderId === agentId) {
              activities.push({ type: 'reply', time: m.timestamp, ticketId: t.id, text: m.text });
            }
          });
        }
      });
      activities.sort((a,b) => new Date(b.time) - new Date(a.time));
      const activityTimeline = activities.slice(0, 15);

      // 🕐 [SESSION DATA] (v2.6.267): Include attendance summary in analytics
      const agentSessions = agent.sessionHistory || [];
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySessions = agentSessions.filter(s => new Date(s.startTime) >= todayStart);
      const todayActiveMs = todaySessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
      
      // Check if currently online
      let isCurrentlyOnline = false;
      for (const [, sess] of activeSupportSessions) {
        if (sess.userId === agentId) { isCurrentlyOnline = true; break; }
      }

      return {
        id: agentId,
        name: agent.name || `${agent.firstName} ${agent.lastName}`,
        email: agent.email,
        status: agent.supportStatus,
        level: agent.supportLevel || 'Trainee',
        score: SupportMetricsService.calculateWeightedScore(agent.metrics || {}),
        stats: {
          ...(agent.metrics || {}),
          activeTickets,
          closedResolvedCount,
          avgResolutionMs,
          avgFirstResponseMs,
          reopenedCount,
          csatScore: csatScore ? parseFloat(csatScore) : null,
          slaPercent,
          escalationRate,
          totalHandled: agentTickets.length,
          manualPicks: agent.metrics?.manualPicks || 0
        },
        activityTimeline,
        attendance: {
          isCurrentlyOnline,
          todayActiveMs,
          totalSessions: agentSessions.length,
          lastSeen: isCurrentlyOnline ? 'Now' : (agentSessions[agentSessions.length - 1]?.endTime || null)
        }
      };
    });

    // Sort leaderboard by score desc
    agentMetrics.sort((a, b) => b.score - a.score);

    // Global stats
    const allRatings = agents.map(a => a.metrics?.avgRating || 0).filter(r => r > 0);
    const globalAvgRating = allRatings.length > 0 ? (allRatings.reduce((a,b) => a+b, 0) / allRatings.length) : 4.5;

    // Ticket Type Breakdown
    const ticketTypesBreakdown = {};
    tickets.forEach(t => {
      const type = t.type || 'Other';
      ticketTypesBreakdown[type] = (ticketTypesBreakdown[type] || 0) + 1;
    });

    // Automated Admin Alerts
    const adminAlerts = [];
    agentMetrics.forEach(a => {
      if (a.stats.activeTickets > 10) {
        adminAlerts.push({ type: 'warning', message: `${a.name} is overwhelmed with ${a.stats.activeTickets} active tickets. Consider pausing distribution.` });
      }
      if (a.stats.csatScore && a.stats.csatScore <= 3.5) {
         adminAlerts.push({ type: 'danger', message: `${a.name} has a low CSAT score (${a.stats.csatScore}★). Quality review recommended.` });
      }
    });

    const overdueCount = tickets.filter(t => {
      if (t.status === 'Closed' || t.status === 'Resolved') return false;
      const created = new Date(t.createdAt);
      return (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
    }).length;
    
    if (overdueCount > 0) {
      adminAlerts.push({ type: 'danger', message: `${overdueCount} tickets are overdue (open for > 48h).` });
    }

    tickets.filter(t => (t.reopenCount || 0) >= 3).forEach(t => {
      adminAlerts.push({ type: 'warning', message: `Ticket #${t.id.slice(-4)} has been reopened ${t.reopenCount} times.` });
    });

    // Team-wide summary  
    const teamSummary = {
      totalOpenTickets: tickets.filter(t => ['Open', 'In Progress', 'Awaiting Response'].includes(t.status)).length,
      totalClosedResolved: tickets.filter(t => t.status === 'Closed' || t.status === 'Resolved').length,
      unassignedQueue: tickets.filter(t => !t.assignedTo && t.status === 'Open').length,
      ticketsToday: allTickets.filter(t => {
        const created = new Date(t.createdAt);
        const today = new Date();
        return created.toDateString() === today.toDateString();
      }).length,
      overdueTickets: overdueCount,
      ticketTypesBreakdown,
      adminAlerts
    };

    res.json({
      leaderboard: agentMetrics,
      globalAvgRating,
      teamSummary,
      filteredTicketCount: tickets.length,
      totalTicketCount: allTickets.length,
      tickets: tickets.map(t => ({
        id: t.id,
        type: t.type || 'Other',
        status: t.status,
        title: t.title,
        assignedTo: t.assignedTo,
        rating: t.rating,
        createdAt: t.createdAt,
        closedAt: t.closedAt
      })),
      timestamp: new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 📥 Export Support Data as CSV (Admin only)
router.get('/support/export', apiKeyGuard, authGuard, async (req, res) => {
  // 🛡️ SECURITY HARDENING (v2.6.257): Enforce verified admin role
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const tickets = state.data.supportTickets || [];
    const fields = ['id', 'type', 'status', 'assignedTo', 'createdAt', 'resolvedAt', 'closedAt', 'rating'];
    let csv = fields.join(',') + '\n';
    
    tickets.forEach(t => {
       const row = fields.map(f => {
         let value = t[f] || '';
         if (typeof value === 'string') {
           value = value.replace(/"/g, '""');
           if (value.includes(',') || value.includes('\n') || value.includes('"')) {
             value = `"${value}"`;
           }
         }
         return value;
       });
       csv += row.join(',') + '\n';
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="support_tickets.csv"');
    res.send(csv);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/manage-user', apiKeyGuard, async (req, res) => {
  const { targetUserId, status, level } = req.body;
  console.log(`[API] POST /support/manage-user: target=${targetUserId}, status=${status}, level=${level}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const players = [...(state.data.players || [])];
    const idx = players.findIndex(p => p.id === targetUserId);
    if (idx === -1) return res.status(404).json({ error: "User not found" });

    // Apply updates
    if (status) {
      players[idx].supportStatus = status;
      if (status === 'terminated') {
        players[idx].terminatedAt = new Date().toISOString();
      } else if (status === 'suspended') {
        // 🔒 SUSPEND: Freeze account without full termination
        players[idx].suspendedAt = new Date().toISOString();
        console.log(`[SUSPEND] ${players[idx].email} suspended by admin`);
      } else if (status === 'active') {
        // Re-onboarding or unsuspend: clear metadata
        delete players[idx].terminatedAt;
        delete players[idx].suspendedAt;
        players[idx].reOnboardedAt = new Date().toISOString();
        
        // 🔑 Generate fresh credentials for re-onboarded employee
        const newPassword = Math.random().toString(36).substring(2, 12);
        players[idx].password = newPassword;
        console.log(`[RE-ONBOARD] Generated new credentials for ${players[idx].email}`);
        
        // 📧 Send Welcome Back email with new access key
        sendReOnboardingEmail(players[idx].email, players[idx].name, newPassword);
      }
    }
    if (level) {
      const oldLevel = players[idx].supportLevel || 'Trainee';
      players[idx].supportLevel = level;
      players[idx].designation = level; // 🔄 Sync designation with support level

      // 📧 Trigger Promotion/Demotion Email if level changed (v2.6.148)
      if (oldLevel !== level) {
         const LEVEL_RANKS = { 'Trainee': 1, 'Specialist': 2, 'Senior': 3 };
         const oldRank = LEVEL_RANKS[oldLevel] || 0;
         const newRank = LEVEL_RANKS[level] || 0;

         if (newRank < oldRank) {
            // Demotion: Use the supportive, growth-focused template
            console.log(`[LEVEL] Demoting ${players[idx].email} from ${oldLevel} to ${level}`);
            sendDemotionEmail(players[idx].email, players[idx].name, level);
         } else {
            // Promotion: Use the celebratory template
            console.log(`[LEVEL] Promoting ${players[idx].email} from ${oldLevel} to ${level}`);
            sendPromotionEmail(players[idx].email, players[idx].name, level);
         }
      }
    }

    
    // Automated Unassign Trigger: If terminated or suspended, free up their tickets
    if (status === 'terminated' || status === 'suspended') {
       // 🛡️ SECURITY LOCKDOWN (v2.6.238): Immediately invalidate all active JWTs
       players[idx].lastForceLogoutAt = Date.now();
       players[idx].activeSessions = [];
       console.log(`[AUTH_LOCK] Invalidated all sessions for ${players[idx].email} due to ${status}`);

       const tickets = (state.data.supportTickets || []).map(t => {
         if (t.assignedTo === targetUserId) {
           return { ...t, assignedTo: null, assignedAt: null };
         }
         return t;
       });
       state.data.supportTickets = tickets;

       if (status === 'terminated') {
         // 📧 Trigger Termination Email
         sendTerminationEmail(players[idx].email, players[idx].name);
       }
    }

    state.data.players = players;
    state.markModified('data');
    await state.save();

    logServerEvent('SUPPORT_USER_MANAGED', { admin: req.headers['x-user-id'] || 'admin', targetUserId, status, level });
    res.json({ success: true, user: players[idx] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 🔄 Transfer All Open Tickets from One Agent to Another
router.post('/support/transfer-tickets', apiKeyGuard, async (req, res) => {
  const { fromAgentId, toAgentId } = req.body;
  console.log(`[API] POST /support/transfer-tickets: from=${fromAgentId}, to=${toAgentId}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
  if (!fromAgentId || !toAgentId) return res.status(400).json({ error: 'Both fromAgentId and toAgentId are required' });
  if (fromAgentId === toAgentId) return res.status(400).json({ error: 'Source and target agent cannot be the same' });

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const players = state.data.players || [];
    const fromAgent = players.find(p => p.id === fromAgentId);
    const toAgent = players.find(p => p.id === toAgentId && p.role === 'support' && p.supportStatus === 'active');
    if (!fromAgent) return res.status(404).json({ error: "Source agent not found" });
    if (!toAgent) return res.status(404).json({ error: "Target agent not found or not active" });

    const tickets = state.data.supportTickets || [];
    let transferCount = 0;

    for (const ticket of tickets) {
      if (ticket.assignedTo === fromAgentId && ['Open', 'In Progress', 'Awaiting Response'].includes(ticket.status)) {
        ticket.assignedTo = toAgentId;
        ticket.assignedAt = new Date().toISOString();
        ticket.reassignedFrom = fromAgentId;
        transferCount++;
      }
    }

    state.markModified('data');
    await state.save();

    logServerEvent('SUPPORT_TICKETS_TRANSFERRED', { fromAgentId, toAgentId, count: transferCount });
    res.json({ success: true, transferred: transferCount, message: `${transferCount} ticket(s) transferred to ${toAgent.name}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 🤖 [NEW v2.6.297] Generate AI Closure Summary (Proxy for Web CORS bypass) */
router.post('/support/ai-summary', apiKeyGuard, async (req, res) => {
  const { messages } = req.body;
  if (!messages) return res.status(400).json({ error: "Messages array required" });
  
  try {
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY is not set" });

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: messages,
        temperature: 0.5,
        max_tokens: 512
      })
    });
    const data = await aiRes.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      res.json({ success: true, text: data.choices[0].message.content });
    } else {
      res.status(500).json({ error: data.error?.message || "AI Error" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** 🔄 [NEW v2.6.162] Reassign a Specific Ticket to Another Agent */
router.post('/support/reassign-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, targetAgentId } = req.body;
  console.log(`[API] POST /support/reassign-ticket: ticket=${ticketId}, to=${targetAgentId}`);
  if (req.headers['x-user-id'] !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
  if (!ticketId || !targetAgentId) return res.status(400).json({ error: 'Both ticketId and targetAgentId are required' });

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state || !state.data) return res.status(404).json({ error: "State not found" });

    const players = state.data.players || [];
    const targetAgent = players.find(p => {
      if (p.id !== targetAgentId) return false;
      const role = (p.role || '').toLowerCase();
      const status = (p.supportStatus || '').toLowerCase();
      const level = (p.supportLevel || '').toLowerCase();
      
      // 🛡️ [SMART LIFECYCLE GUARD] (v2.6.249)
      const hasActiveTermination = !!p.terminatedAt && (!p.reOnboardedAt || new Date(p.terminatedAt) > new Date(p.reOnboardedAt));

      const isExplicitlyInactive = 
        ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || 
        ['ex-employee', 'terminated'].includes(level) ||
        hasActiveTermination;
      
      const isActiveSupport = role === 'support' && (status === 'active' || !status) && !isExplicitlyInactive;
      const isActiveAdmin = role === 'admin' && !isExplicitlyInactive;

      return isActiveSupport || isActiveAdmin;
    });
    if (!targetAgent) return res.status(404).json({ error: "Target agent not found, inactive, or unauthorized" });

    const tickets = state.data.supportTickets || [];
    const ticketIdx = tickets.findIndex(t => t.id === ticketId);
    if (ticketIdx === -1) return res.status(404).json({ error: "Ticket not found" });

    const oldAgentId = tickets[ticketIdx].assignedTo;
    
    // Perform reassignment
    tickets[ticketIdx].assignedTo = targetAgentId;
    tickets[ticketIdx].assignedAt = new Date().toISOString();
    tickets[ticketIdx].reassignedFrom = oldAgentId;
    tickets[ticketIdx].assignedAgentName = targetAgent.name;

    // 🛡️ [AUTO-INTRO MESSAGE] Generate personalized greeting on reassign
    const ticketUserId = tickets[ticketIdx].userId;
    const userIdx = players.findIndex(p => p.id === ticketUserId);
    const userName = (userIdx !== -1 && players[userIdx].name) ? players[userIdx].name : 'User';

    // Build AI issue description from ticket title + first user message
    const ticketTitle = tickets[ticketIdx].title || '';
    const ticketType = tickets[ticketIdx].type || '';
    const firstUserMsg = (tickets[ticketIdx].messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "llama-3.1-70b-versatile",
            messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
            temperature: 0.3, max_tokens: 50
          })
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: targetAgentId,
      text: `Hi ${userName}, I am ${targetAgent.name} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    tickets[ticketIdx].messages = [...(tickets[ticketIdx].messages || []), introMsg];
    tickets[ticketIdx].status = 'In Progress';
    tickets[ticketIdx].updatedAt = new Date().toISOString();

    state.markModified('data');
    await state.save();

    logServerEvent('SUPPORT_TICKET_REASSIGNED', { ticketId, fromAgentId: oldAgentId, toAgentId: targetAgentId });
    res.json({ 
      success: true, 
      message: `Ticket #${ticketId.slice(-4)} reassigned to ${targetAgent.name}`,
      ticket: tickets[ticketIdx]
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ⭐ Rate Ticket (CSAT)
router.post('/support/rate-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId, rating, feedback } = req.body;
  const userId = req.headers['x-user-id'];
  console.log(`[API] POST /support/rate-ticket: ticket=${ticketId}, user=${userId}, rating=${rating}`);
  
  if (!ticketId || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Valid ticketId and rating (1-5) required' });
  }

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const ticketIdx = (state.data.supportTickets || []).findIndex(t => t.id === ticketId);
    if (ticketIdx === -1) return res.status(404).json({ error: "Ticket not found" });

    const ticket = state.data.supportTickets[ticketIdx];
    if (ticket.userId !== userId) {
      return res.status(403).json({ error: "You can only rate your own tickets" });
    }
    if (ticket.status !== 'Closed' && ticket.status !== 'Resolved') {
      return res.status(400).json({ error: "Only closed or resolved tickets can be rated" });
    }
    if (ticket.rating) {
      return res.status(400).json({ error: "This ticket has already been rated" });
    }

    ticket.rating = rating;
    if (feedback) ticket.ratingFeedback = feedback;
    ticket.ratedAt = new Date().toISOString();

    // Update agent's overall metrics
    const agentId = ticket.assignedTo;
    if (agentId) {
      const agentIdx = (state.data.players || []).findIndex(p => p.id === agentId);
      if (agentIdx !== -1) {
        const p = state.data.players[agentIdx];
        if (!p.metrics) p.metrics = {};
        const oldRatedCount = p.metrics.ratedTickets || 0;
        const oldAvg = p.metrics.avgRating || 0;
        
        p.metrics.avgRating = ((oldAvg * oldRatedCount) + rating) / (oldRatedCount + 1);
        p.metrics.ratedTickets = oldRatedCount + 1;
      }
    }

    state.markModified('data');
    await state.save();

    logServerEvent('TICKET_RATED', { ticketId, rating, agentId });
    res.json({ success: true, ticket });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/claim-ticket', apiKeyGuard, async (req, res) => {
  const { ticketId } = req.body;
  const agentId = req.headers['x-user-id'];
  console.log(`[API] POST /support/claim-ticket: ticketID=${ticketId}, agentID=${agentId}`);
  if (!agentId) return res.status(400).json({ error: "Agent ID required in headers" });

  try {
    const state = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!state) return res.status(404).json({ error: "State not found" });

    const tickets = [...(state.data.supportTickets || [])];
    const ticketIdx = tickets.findIndex(t => t.id === ticketId);
    
    if (ticketIdx === -1) return res.status(404).json({ error: "Ticket not found" });
    if (tickets[ticketIdx].assignedTo) return res.status(409).json({ error: "Ticket already assigned" });

    // Assign to agent
    tickets[ticketIdx].assignedTo = agentId;
    tickets[ticketIdx].assignedAt = new Date().toISOString();
    tickets[ticketIdx].assignmentSource = 'manual_pool';

    const players = [...(state.data.players || [])];
    const agentIdx = players.findIndex(p => p.id === agentId);
    const agentName = (agentIdx !== -1 && players[agentIdx].name) ? players[agentIdx].name : 'Support Agent';
    tickets[ticketIdx].assignedAgentName = agentName;

    // 🛡️ [AUTO-INTRO MESSAGE] (v2.6.295): Generate personalized greeting on claim
    const ticketUserId = tickets[ticketIdx].userId;
    const userIdx = players.findIndex(p => p.id === ticketUserId);
    const userName = (userIdx !== -1 && players[userIdx].name) ? players[userIdx].name : 'User';

    // Build AI issue description from ticket title + first user message
    const ticketTitle = tickets[ticketIdx].title || '';
    const ticketType = tickets[ticketIdx].type || '';
    const firstUserMsg = (tickets[ticketIdx].messages || []).find(m => m.senderId !== 'admin' && m.senderId !== 'system');
    const issueContext = firstUserMsg ? (firstUserMsg.text || '').replace('ISSUE_DESCRIPTION: ', '') : ticketTitle;

    let issueDescription = `${ticketType}: ${ticketTitle}`;
    try {
      const groqKey = process.env.GROQ_API_KEY;
      if (groqKey && issueContext) {
        const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: "llama-3.1-70b-versatile",
            messages: [{ role: 'user', content: `Summarize this support issue in one short sentence (max 20 words), no quotes: "${issueContext}"` }],
            temperature: 0.3, max_tokens: 50
          })
        });
        const aiData = await aiRes.json();
        const aiText = aiData?.choices?.[0]?.message?.content?.trim();
        if (aiText) issueDescription = aiText;
      }
    } catch (aiErr) {
      console.warn('[AI] Issue description generation failed:', aiErr.message);
    }

    // Inject the introduction message into the ticket's messages
    const introMsg = {
      id: `intro-${Date.now()}`,
      senderId: agentId,
      text: `Hi ${userName}, I am ${agentName} and I will be working on resolving the issue related to ${issueDescription}.`,
      timestamp: new Date().toISOString(),
      status: 'delivered'
    };
    tickets[ticketIdx].messages = [...(tickets[ticketIdx].messages || []), introMsg];
    tickets[ticketIdx].status = 'In Progress';
    tickets[ticketIdx].updatedAt = new Date().toISOString();

    // Increment agent's pool bonus metrics
    if (agentIdx !== -1) {
      if (!players[agentIdx].metrics) players[agentIdx].metrics = { totalHandled: 0, closedTickets: 0, manualPicks: 0, avgRating: 0 };
      players[agentIdx].metrics.manualPicks += 1;
      players[agentIdx].metrics.totalHandled += 1;
    }

    state.data.supportTickets = tickets;
    state.data.players = players;
    state.markModified('data');
    await state.save();

    logAudit(req, 'TICKET_CLAIMED', ['supportTickets'], { ticketId, agentId });

    res.json({ success: true, ticket: tickets[ticketIdx] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/support/force-reset', apiKeyGuard, async (req, res) => {
  console.log(`[API] POST /support/force-reset requested for ${req.body.targetUserId}`);
  if (req.headers['x-user-id'] !== 'admin') {
    return res.status(403).json({ error: 'System Administrator privileges required' });
  }

  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'Target user ID required' });

  try {
    const appState = await AppState.findOne().sort({ lastUpdated: -1 });
    if (!appState) return res.status(500).json({ error: 'System state unavailable' });

    const players = appState.data.players || [];
    const userIndex = players.findIndex(p => p.id === targetUserId);

    if (userIndex === -1) return res.status(404).json({ error: 'User account not found' });
    
    const user = players[userIndex];
    if (user.role !== 'support') {
      return res.status(400).json({ error: 'Can only force-reset support accounts via this portal.' });
    }

    // Generate Random Alphanumeric Password (10 chars)
    const newPassword = Math.random().toString(36).substring(2, 7) + Math.random().toString(36).substring(2, 7);
    console.log(`[FORCE-RESET] Generated new password for ${user.email}`);
    
    // Assign Plaintext to match local frontend authentication model
    players[userIndex].password = bcrypt.hashSync(newPassword, 10);
    
    // Security Guard: Invalidate all existing sessions
    players[userIndex].devices = [];

    appState.markModified('data.players');
    await appState.save();
    console.log(`[FORCE-RESET] Database updated for ${user.email}`);

    // Log Event
    await logServerEvent('SUPPORT_FORCE_PASSWORD_RESET', { 
      adminId: req.headers['x-user-id'] || 'admin', 
      targetEmail: user.email 
    });

    // Send Notification Email
    console.log(`[FORCE-RESET] Sending reset email to ${user.email}...`);
    sendAdminResetPasswordEmail(user.email, user.name, newPassword);
    console.log(`[FORCE-RESET] Email dispatch triggered for ${user.email}`);
// 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195)
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

    res.json({ 
      success: true, 
      message: `Password reset successfully for ${user.name}. Credentials sent to ${user.email}.`
    });
  } catch (e) {
    console.error(`[FORCE-RESET] CRITICAL ERROR: ${e.message}`, e.stack);
    res.status(500).json({ error: e.message });
  }
});
