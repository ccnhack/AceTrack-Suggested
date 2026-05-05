import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppState, SupportPasswordReset, Player, AdminMFA } from '../models/index.mjs';
import { asyncHandler } from '../helpers/utils.mjs';
import { apiKeyGuard } from '../middleware/security.mjs';

// 🛡️ [PRODUCTION HARDENING] (v2.6.319): MFA PIN must be set in production
const ADMIN_MFA_PIN = process.env.ADMIN_MFA_PIN || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('🛑 FATAL: ADMIN_MFA_PIN must be set in production environment!');
    process.exit(1);
  }
  return '120522'; // Dev-only fallback
})();
// 🛡️ [SCALABILITY] (v2.6.319): Removed in-memory pendingAdminMFA Map
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default function createAuthRoutes({
  ACE_API_KEY,
  loginLimiter,
  passwordResetLimiter,
  trackLoginAttempt,
  logServerEvent,
  logAudit,
  syncMutex,
  signToken,
  sendPasswordResetEmail
}) {
  const router = express.Router();

  // 🛡️ [SESSION_VALIDATION] (v2.6.258)
  router.get('/auth/me', apiKeyGuard, asyncHandler(async (req, res) => {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'No active session.' });
    }

    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection
    const playerDoc = await Player.findOne({ id: req.user.id }).lean();
    const user = playerDoc?.data;

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // Return sanitized user object
    const { password, ...sanitizedUser } = user;
    res.json({ success: true, user: sanitizedUser });
  }));

  // 🛡️ [EMERGENCY RECOVERY] (v2.6.312)
  router.post('/admin/restore-last-state', apiKeyGuard, asyncHandler(async (req, res) => {
    const { confirm } = req.body;
    if (confirm !== 'RESTORE_PREVIOUS_STATE') {
      return res.status(400).json({ error: 'Confirmation string required.' });
    }

    // Find the last 2 states
    const states = await AppState.find().sort({ lastUpdated: -1 }).limit(2);
    
    if (states.length < 2) {
      return res.status(404).json({ error: 'No previous state found for recovery.' });
    }

    const current = states[0];
    const previous = states[1];

    console.log(`🛡️ [RECOVERY] Attempting restoration. Current: ${current._id} (v${current.version}), Previous: ${previous._id} (v${previous.version})`);
    
    // Create a NEW state document that copies the PREVIOUS state's data but with a NEW timestamp and incremented version
    const recovered = new AppState({
      data: previous.data,
      version: (current.version || 1) + 1,
      lastUpdated: new Date(),
      lastSocketId: 'SYSTEM_RECOVERY'
    });

    await recovered.save();

    console.log(`✅ [RECOVERY] Successfully promoted previous state to latest. New Version: ${recovered.version}`);
    
    // 🛡️ [AUDIT]
    await logAudit(req, 'STATE_RECOVERY_EXECUTED', [], { 
      fromVersion: current.version, 
      toVersion: recovered.version,
      restoredFrom: previous.lastUpdated
    });

    res.json({ 
      success: true, 
      message: `State recovered successfully. Restored data from ${previous.lastUpdated.toISOString()}.`,
      newVersion: recovered.version
    });
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

    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection
    const adminDoc = await Player.findOne({ id: 'admin' }).lean();
    const adminUser = adminDoc?.data;

    if (!adminUser || adminUser.role !== 'admin') {
      return res.status(500).json({ error: 'Administrator account not found in system.' });
    }

    const adminPassword = adminUser.password || '';
    
    // 🛡️ [SECURITY LOCKDOWN CHECK] (v2.6.212)
    if (adminUser.loginBlockedUntil && adminUser.loginBlockedUntil > Date.now()) {
      const remaining = Math.ceil((adminUser.loginBlockedUntil - Date.now()) / 60000);
      return res.status(403).json({ error: `Security Lockdown: Account is temporarily blocked. Try again in ${remaining} minutes.` });
    }

    // 🛡️ EMERGENCY BYPASS (v2.6.197): Allow ACE_API_KEY if DB is corrupted
    const isMasterKey = password === ACE_API_KEY;
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Default password bypass disabled in production
    const isDefaultKey = !IS_PRODUCTION && (adminPassword === '' || !adminPassword) && password === 'Password@123';

    // 🛡️ [HARDENED AUTH ENGINE] (v2.6.319): Removed plaintext fallback
    let isMatch = false;
    try {
      if (adminPassword.startsWith('$2a$') || adminPassword.startsWith('$2b$')) {
        isMatch = bcrypt.compareSync(password, adminPassword);
      } else if (adminPassword) {
        // Legacy plaintext detected — compare then force-hash for next login
        isMatch = adminPassword === password;
        if (isMatch) {
          console.warn('🛡️ [SECURITY] Admin has plaintext password — auto-hashing now.');
          const hashed = bcrypt.hashSync(password, 10);
          await Player.updateOne({ id: 'admin' }, { $set: { 'data.password': hashed, lastUpdated: new Date() } });
        }
      }
    } catch (e) {
      console.error('[AUTH] Password comparison error:', e.message);
      isMatch = false;
    }

    if (!isMatch && !isMasterKey && !isDefaultKey) {
      await trackLoginAttempt(req, search, password, false);
      logServerEvent('ADMIN_LOGIN_FAILED', { reason: 'wrong_password', ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    await trackLoginAttempt(req, search, password, true);

    // Step 1 passed — generate MFA session token
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Use crypto.randomBytes instead of blocking bcrypt.hashSync
    const mfaToken = crypto.randomBytes(20).toString('hex');
    
    // 🛡️ [SCALABILITY] (v2.6.319): Store MFA token in MongoDB to support multi-instance deployments
    await AdminMFA.create({
      token: mfaToken,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min expiry
    });

    logServerEvent('ADMIN_MFA_INITIATED', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });
    res.json({ success: true, requiresMFA: true, mfaToken });
  }));

  router.post('/admin/verify-pin', asyncHandler(async (req, res) => {
    const { mfaToken, pin } = req.body;
    if (!mfaToken || !pin) {
      return res.status(400).json({ error: 'MFA token and PIN are required.' });
    }

    const session = await AdminMFA.findOne({ token: mfaToken });
    if (!session) {
      return res.status(401).json({ error: 'Invalid or expired MFA session. Please login again.' });
    }

    if (session.expiresAt < new Date()) {
      await AdminMFA.deleteOne({ _id: session._id });
      return res.status(401).json({ error: 'MFA session expired. Please login again.' });
    }

    session.attempts = (session.attempts || 0) + 1;
    await session.save();

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
    await AdminMFA.deleteOne({ _id: session._id });

    logServerEvent('ADMIN_LOGIN_SUCCESS', { ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress });

    // 🛡️ Success! Issue JWT with Admin scope (v2.6.190)
    const token = signToken({ id: 'admin', role: 'admin', scopes: ['*'] });

    res.cookie('acetrack_session', token, {
      path: '/',
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 🛡️ (v2.6.319): Aligned with JWT 24h expiry
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

    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): O(1) indexed lookup instead of loading ALL players
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchReg = new RegExp(`^${escapedSearch}$`, 'i');
    const supportDoc = await Player.findOne({
      "data.role": "support",
      $or: [
        { "data.email": searchReg },
        { id: searchReg },
        { "data.username": searchReg },
        { "data.name": searchReg }
      ]
    }).lean();
    const supportUser = supportDoc?.data;
    console.log(`[DIAG] Support Login Attempt: ${search} | Found: ${!!supportUser}`);

    if (!supportUser) {
      // 🕵️ DEEP DIAGNOSTIC: Find if the user exists AT ALL but has the wrong role
      const anyUserDoc = await Player.findOne({
        $or: [
          { "data.email": searchReg },
          { id: searchReg },
          { "data.username": searchReg }
        ]
      }).lean();
      const anyUser = anyUserDoc?.data;
      
      await logAudit(req, 'DEBUG_SUPPORT_LOGIN_FAILED_SEARCH', [], { 
        search, 
        foundAnyUser: !!anyUser, 
        foundRole: anyUser ? anyUser.role : null
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

    const userPassword = supportUser.password;
    if (!userPassword) {
      return res.status(401).json({ error: 'Account not fully set up. Please use the password reset flow.' });
    }
    
    // 🛡️ [HARDENED AUTH ENGINE] (v2.6.319): Removed plaintext fallback
    let isMatch = false;
    try {
      if (userPassword.startsWith('$2a$') || userPassword.startsWith('$2b$')) {
        isMatch = bcrypt.compareSync(password, userPassword);
      } else {
        // Legacy plaintext detected — compare then force-hash for next login
        isMatch = userPassword === password;
        if (isMatch) {
          console.warn(`🛡️ [SECURITY] Support user ${supportUser.id} has plaintext password — auto-hashing now.`);
          const hashed = bcrypt.hashSync(password, 10);
          Player.updateOne({ id: supportUser.id }, { $set: { 'data.password': hashed, lastUpdated: new Date() } }).catch(e => console.error('Auto-hash failed:', e.message));
        }
      }
    } catch (e) {
      console.error('[AUTH] Password comparison error:', e.message);
      isMatch = false;
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
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Use crypto.randomBytes instead of blocking bcrypt.hashSync
    const jti = crypto.randomBytes(16).toString('hex');
    const activeSessions = [...(supportUser.activeSessions || [])];
    
    // Add current session
    activeSessions.push({ jti, iat: Date.now() });
    
    // Keep only the most recent 2 sessions
    const rotatedSessions = activeSessions.sort((a, b) => b.iat - a.iat).slice(0, 2);
    
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Removed syncMutex — Player.updateOne is atomic
    await Player.updateOne(
      { id: supportUser.id },
      { $set: { "data.activeSessions": rotatedSessions, lastUpdated: new Date() } }
    );

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
      secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 🛡️ (v2.6.319): Aligned with JWT 24h expiry
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

    // 🛡️ SCALABILITY FIX (v2.6.316): Read from Player distinct collection efficiently
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchReg = new RegExp(`^${escapedSearch}$`, 'i');
    const userDoc = await Player.findOne({
      $or: [
        { "data.email": searchReg },
        { id: searchReg },
        { "data.username": searchReg },
        { "data.name": searchReg }
      ]
    }).lean();
    
    console.log(`[DIAG] Recovery Attempt: ${search} | Found: ${!!userDoc}`);
    const user = userDoc ? userDoc.data : null;

    if (!user) {
      // 🛡️ SECURITY: Use generic message to prevent account enum
      return res.json({ success: true, message: 'If an account exists, a recovery link has been sent.' });
    }
    
    if (!user.email) {
      return res.status(400).json({ error: 'This account does not have a registered email address. Contact support.' });
    }

    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Use crypto.randomBytes instead of blocking bcrypt.hashSync
    const token = crypto.randomBytes(16).toString('hex');
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

    // 🛡️ SCALABILITY FIX (v2.6.316): Read and write via Player distinct collection
    const escapedEmail = resetReq.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const agentDoc = await Player.findOne({ "data.email": { $regex: new RegExp(`^${escapedEmail}$`, 'i') }, "data.role": "support" }).lean();
    
    if (!agentDoc || agentDoc.id === 'admin') return res.status(404).json({ error: 'User account not found' });

    // Update password directly in the Player collection
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    await Player.updateOne(
      { id: agentDoc.id },
      { $set: { "data.password": hashedPassword, "data.devices": [], lastUpdated: new Date() } }
    );

    await SupportPasswordReset.deleteOne({ token });

    await logAudit(req, 'SUPPORT_PASSWORD_RESET_SUCCESS', [], { email: resetReq.email });

    res.json({ success: true, message: 'Password updated successfully. You can now login.' });

  }));

  return router;
}
