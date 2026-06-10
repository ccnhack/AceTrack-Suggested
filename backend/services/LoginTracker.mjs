/**
 * 🛡️ LOGIN TRACKER SERVICE
 * Handles:
 * - Tracking failed/successful login attempts via MongoDB
 * - Advanced brute-force detection
 */
import { logAudit, getClientIp } from './AuditService.mjs';

// Legacy export (to prevent breaking imports that check loginAttempts directly)
// The actual cron job in scheduler.mjs will be updated to query MongoDB instead.
export const loginAttempts = new Map();

export const trackLoginAttempt = async (req, identifier, password, success) => {
  const ip = getClientIp(req);
  const search = String(identifier).toLowerCase().trim();
  const key = `${search}_${ip}`;
  
  try {
    const { Player, LoginAttemptHistory } = await import('../models/index.mjs');

    // 1. Log the attempt
    await LoginAttemptHistory.create({
      key,
      identifier: search,
      ip,
      success
    });

    // 2. Fetch recent attempts for this IP+Identifier pair within the last minute
    const oneMinuteAgo = new Date(Date.now() - 60000);
    const recentAttempts = await LoginAttemptHistory.find({
      key,
      timestamp: { $gt: oneMinuteAgo }
    }).lean();

    const recentFailures = recentAttempts.filter(a => !a.success);

    // 3. Role-based Threshold
    let role = (search === 'admin_mfa' ? 'admin' : 'user');
    try {
      const playerDoc = await Player.findOne({ $or: [{ id: search }, { 'data.email': search }, { 'data.username': search }] }).lean();
      if (playerDoc?.data?.role) role = playerDoc.data.role;
    } catch (e) { /* fallback */ }
    const threshold = role === 'admin' ? 5 : 10;

    // 4. IMMEDIATE ALERT: Success after significant failure (Critical Breach Potential)
    if (success && recentFailures.length >= threshold) {
      await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { 
        TargetUser: search, 
        AttemptCount: recentAttempts.length,
        FailureCount: recentFailures.length,
        FinalOutcome: "SUCCESS (ALERT: Potential Unauthorized Access)",
        Timeframe: '1 minute'
      });
      // Clear recent attempts to prevent double alerts
      await LoginAttemptHistory.deleteMany({ key });
      return;
    }

    // 5. BURST ALERT: Notify every 5 failures within 1 minute
    if (!success && recentFailures.length >= 5 && (recentFailures.length % 5 === 0)) {
      await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { 
        TargetUser: search, 
        AttemptCount: recentAttempts.length,
        FailureCount: recentFailures.length,
        FinalOutcome: "FAILED (Persistent Attack in Progress)",
        Timeframe: '1 minute'
      });
    }

  } catch (err) {
    console.error('[LoginTracker] Error tracking login attempt:', err.message);
  }
};

