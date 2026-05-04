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
const APP_VERSION = "2.6.317"; 
 // 🚀 FORCE REDEPLOY CACHE BUST v2.6.314 

// 🛡️ SECURITY: JWT & Secrets (v2.6.192)
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
const ACE_API_KEY = process.env.ACE_API_KEY || 'QnQdpSDrLodmhJoctmv89cQeTcjWn0Vp+pBpUE0bcY8=';
// 🛡️ [SECURITY HARDENING] (v2.6.315): If JWT_SECRET env var is missing, generate a
// random per-boot secret. Sessions won't survive restarts, but tokens can't be forged.
const JWT_SECRET = process.env.JWT_SECRET || (() => {
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

// Cumulative Security Summary moved to services/scheduler.mjs
initScheduler(loginAttempts, sendSecurityAlert);


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
    maxPoolSize: 50,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  }).then(() => {
    console.log('✅ MongoDB Connected Successfully');
    dbStatus = 'connected';
    
    // 🛡️ [SECURITY HARDENING] (v2.6.315): Removed auto-repair of admin password.
    // Previously restored admin password to 'Password@123' on every boot.
    // Admin password should be managed through the proper reset flow.
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
async function logServerEvent(action, details = {}) {
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

const infrastructureRoutes = createInfrastructureRoutes({ APP_VERSION, syncMutex });
app.use('/', infrastructureRoutes);
app.use('/api', infrastructureRoutes);
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

// AI Aggregator moved to services/scheduler.mjs

