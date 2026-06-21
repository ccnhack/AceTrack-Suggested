/**
 * APP CONFIGURATION (v2.6.620 — Phase 2 Modularization)
 * 
 * Centralizes all environment-driven configuration, secret management,
 * and JWT token signing. Imported by server.mjs and route modules.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

export const APP_VERSION = '2.6.731'; // Critical for Update prompts

// 🛡️ SECURITY: API Key
export const ACE_API_KEY = process.env.ACE_API_KEY || "AceTrack_Internal_v2_Testing";

// 🛡️ [PRODUCTION HARDENING] (v2.6.319): JWT_SECRET MUST be set in production.
export const JWT_SECRET = process.env.JWT_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('🛑 FATAL: JWT_SECRET must be set in production! Sessions cannot be validated without it.');
    process.exit(1);
  }
  const fallback = crypto.randomBytes(32).toString('base64');
  console.warn('⚠️ [SECURITY] JWT_SECRET env var not set! Using ephemeral random secret. Sessions will not persist across restarts.');
  return fallback;
})();

export const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL; // OPTIONAL: Discord/Slack alerts

export const ALLOWED_ORIGINS = [
  'https://acetrack-suggested.onrender.com',
  'https://acetrack-web.onrender.com',
  'https://acetrack-suggested-web.onrender.com'
];

if (process.env.NODE_ENV !== 'production') {
  ALLOWED_ORIGINS.push(
    'http://localhost:8081',
    'http://localhost:19006',
    'http://localhost:3005',
    'http://localhost:8082',
    'http://127.0.0.1:8082',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:19006'
  );
}

export const signToken = (user, jti = null) => {
  const payload = {
    id: user.id, 
    role: user.role || 'user',
    scopes: user.scopes || (user.role === 'admin' ? ['*'] : ['read:own'])
  };
  if (jti) payload.jti = jti;
  
  // 🛡️ [VAPT-F21] (v2.6.558): Add audience & issuer claims to prevent cross-service token reuse
  return jwt.sign(payload, JWT_SECRET, { 
    expiresIn: '24h',
    issuer: 'acetrack-api',
    audience: 'acetrack-client'
  });
};
