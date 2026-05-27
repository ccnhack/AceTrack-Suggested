/**
 * 🛡️ LOGIN TRACKER SERVICE
 * Extracted from server.mjs (Monolithic Refactoring Phase 1)
 * 
 * Handles:
 * - Tracking failed/successful login attempts
 * - Advanced brute-force detection
 * - In-memory state (Note: Scheduled for Redis migration in future phase)
 */
import { logAudit, getClientIp } from './AuditService.mjs';

// ⚠️ ARCHITECTURE WARNING: This Map will fragment if deployed to multiple instances.
// Scheduled for Redis migration in Phase 2/3.
export const loginAttempts = new Map(); // identifier_IP -> { attempts: [], lastAlertedAt: 0, lastSummaryAt: 0 }

export const trackLoginAttempt = async (req, identifier, password, success) => {
  const ip = getClientIp(req);
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
  
  // 🛡️ [ROLE-BASED THRESHOLD] (v2.6.213 / v2.6.434 PERF FIX)
  // Admin: 5 attempts | Support: 10 attempts | Others: 10 attempts
  // v2.6.434: Use Player.findOne instead of loading entire AppState blob
  const search = String(identifier).toLowerCase().trim();
  let role = (identifier === 'admin_mfa' ? 'admin' : 'user');
  try {
    const { Player } = await import('../models/index.mjs');
    const playerDoc = await Player.findOne({ $or: [{ id: search }, { 'data.email': search }, { 'data.username': search }] }).lean();
    if (playerDoc?.data?.role) role = playerDoc.data.role;
  } catch (e) { /* fallback to default role */ }
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

// 🛡️ [MEMORY LEAK FIX] (v2.6.434): Purge stale loginAttempts entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, state] of loginAttempts) {
    state.attempts = state.attempts.filter(a => now - a.timestamp < 300000);
    if (state.attempts.length === 0) loginAttempts.delete(key);
  }
}, 600000);
