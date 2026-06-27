/**
 * ═══════════════════════════════════════════════════════════════
 * 🔐 Auth Routes (v2.6.772)
 * Thin HTTP handlers — business logic in services/AuthService.mjs
 * and services/CoachInviteService.mjs
 * ═══════════════════════════════════════════════════════════════
 */
import express from 'express';
import { asyncHandler } from '../helpers/utils.mjs';
import { apiKeyGuard, attachCsrfCookie } from '../middleware/security.mjs';
import * as AuthService from '../services/AuthService.mjs';
import * as CoachInviteService from '../services/CoachInviteService.mjs';

// 🛡️ [VAPT-F04] (v2.6.556): ADMIN_MFA_PIN via env var only
const ADMIN_MFA_PIN = process.env.ADMIN_MFA_PIN || (() => {
  if (process.env.NODE_ENV === 'production') {
    console.error('🛑 FATAL: ADMIN_MFA_PIN must be set in production environment!');
    process.exit(1);
  }
  console.error('🛑 FATAL: ADMIN_MFA_PIN environment variable is not set. Admin MFA will not function.');
  return null;
})();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export default function createAuthRoutes({
  ACE_API_KEY, loginLimiter, passwordResetLimiter, phoneLookupLimiter,
  trackLoginAttempt, logServerEvent, logAudit, syncMutex, signToken, sendPasswordResetEmail
}) {
  const router = express.Router();

  const respond = (res, result) => {
    const { status, ...body } = result;
    return res.status(status).json(body);
  };

  const getClientIp = (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const setSessionCookie = (res, token) => {
    res.cookie('acetrack_session', token, {
      path: '/', httpOnly: true, secure: IS_PRODUCTION,
      sameSite: IS_PRODUCTION ? 'strict' : 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });
    attachCsrfCookie(res);
  };

  // ─── Session Validation ────────────────────────────────────
  router.get('/auth/me', apiKeyGuard, asyncHandler(async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ success: false, error: 'No active session.' });
    const user = await AuthService.getAuthenticatedUser(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });
    res.json({ success: true, user });
  }));

  // ─── Coach Invite: Validate ────────────────────────────────
  router.get('/auth/coach-invite/validate', apiKeyGuard, asyncHandler(async (req, res) => {
    const result = await CoachInviteService.validateInvite(req.query.token);
    respond(res, result);
  }));

  // ─── Coach Invite: Track ───────────────────────────────────
  router.post('/auth/coach-invite/track', apiKeyGuard, asyncHandler(async (req, res) => {
    const result = await CoachInviteService.trackInvite(req.body.token, req.body.action, getClientIp(req), req.headers['user-agent'] || '');
    respond(res, result);
  }));

  // ─── Coach Invite: Consume ─────────────────────────────────
  router.post('/auth/coach-invite/consume', apiKeyGuard, asyncHandler(async (req, res) => {
    const result = await CoachInviteService.consumeInvite(req.body.token, req.body.username, getClientIp(req), req.headers['user-agent'] || '');
    if (result.success && result.meta) {
      await logAudit(req, 'COACH_INVITE_CONSUMED', ['players', 'tournaments'], result.meta);
    }
    respond(res, result);
  }));

  // ─── Coach Invites: List (Admin) ───────────────────────────
  router.get('/admin/coach-invites', apiKeyGuard, asyncHandler(async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'System Administrator privileges required' });
    const result = await CoachInviteService.listInvites();
    respond(res, result);
  }));

  // ─── Change Password ──────────────────────────────────────
  router.post('/auth/change-password', apiKeyGuard, asyncHandler(async (req, res) => {
    if (!req.user?.id) return res.status(401).json({ success: false, error: 'No active session.' });
    const result = await AuthService.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword);
    if (result.success) await logAudit(req, 'PASSWORD_CHANGED', ['players'], { userId: req.user.id, ip: getClientIp(req) });
    respond(res, result);
  }));

  // ─── Emergency State Recovery ──────────────────────────────
  router.post('/admin/restore-last-state', apiKeyGuard, asyncHandler(async (req, res) => {
    if (req.body.confirm !== 'RESTORE_PREVIOUS_STATE') {
      return res.status(400).json({ error: 'Confirmation string required.' });
    }
    const result = await AuthService.restoreLastState();
    if (result.success) {
      await logAudit(req, 'STATE_RECOVERY_EXECUTED', [], { fromVersion: result.fromVersion, toVersion: result.toVersion, restoredFrom: result.restoredFrom });
    }
    respond(res, result);
  }));

  // ─── Admin Login (Step 1: Password → MFA) ─────────────────
  router.post('/admin/login', loginLimiter, asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Username and Password are required.' });

    const search = String(identifier).toLowerCase().trim();
    if (search !== 'admin') {
      await logAudit(req, 'ADMIN_LOGIN_FAILED', [], { identifier: search, reason: 'invalid_admin_username', ip: getClientIp(req) });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    const adminDoc = await AuthService.findUserByIdentifier('admin');
    if (!adminDoc?.data || adminDoc.data.role !== 'admin') {
      return res.status(500).json({ error: 'Administrator account not found in system.' });
    }

    const adminUser = adminDoc.data;
    if (adminUser.loginBlockedUntil && adminUser.loginBlockedUntil > Date.now()) {
      const remaining = Math.ceil((adminUser.loginBlockedUntil - Date.now()) / 60000);
      return res.status(403).json({ error: `Security Lockdown: Account is temporarily blocked. Try again in ${remaining} minutes.` });
    }

    const verification = await AuthService.verifyPassword(password, adminUser.password || '');
    if (verification.reason === 'unhashed_password') {
      console.warn('🛑 [SECURITY] Admin account has unhashed password. Forcing reset.');
      return res.status(401).json({ error: 'Your password needs to be reset for security. Use the Forgot Password flow.' });
    }

    if (!verification.match) {
      await trackLoginAttempt(req, search, password, false);
      const geoLoc = await AuthService.resolveIpGeo(getClientIp(req));
      await logAudit(req, 'ADMIN_LOGIN_FAILED', [], { reason: 'wrong_password', ip: getClientIp(req), location: geoLoc });
      return res.status(401).json({ error: 'Invalid administrator credentials.' });
    }

    await trackLoginAttempt(req, search, password, true);
    const mfaToken = await AuthService.createMfaSession();
    await logAudit(req, 'ADMIN_MFA_INITIATED', [], { userId: 'admin', ip: getClientIp(req) });
    res.json({ success: true, requiresMFA: true, mfaToken });
  }));

  // ─── Admin MFA (Step 2: PIN Verification) ─────────────────
  router.post('/admin/verify-pin', asyncHandler(async (req, res) => {
    const { mfaToken, pin } = req.body;
    if (!mfaToken || !pin) return res.status(400).json({ error: 'MFA token and PIN are required.' });

    const mfaResult = await AuthService.verifyMfaSession(mfaToken);
    if (!mfaResult.valid) {
      return res.status(401).json({ error: mfaResult.reason === 'expired' ? 'MFA session expired. Please login again.' : 'Invalid or expired MFA session. Please login again.' });
    }

    if (pin !== ADMIN_MFA_PIN) {
      await trackLoginAttempt(req, 'admin_mfa', pin, false);
      await logAudit(req, 'MFA_MONITOR', [], { outcome: 'FAILURE', pinEntered: '****', message: 'Invalid MFA PIN attempt detected' });
      await logAudit(req, 'ADMIN_MFA_FAILED', [], { reason: 'wrong_pin', ip: getClientIp(req) });
      return res.status(401).json({ error: 'Invalid PIN. Access denied.' });
    }

    await trackLoginAttempt(req, 'admin_mfa', pin, true);

    if (mfaResult.session.attempts > 5) {
      await logAudit(req, 'BRUTE_FORCE_DETECTED', [], { TargetUser: 'admin_mfa', Passwords: '[HIDDEN_MFA_HISTORY]', AttemptCount: mfaResult.session.attempts, FailureCount: mfaResult.session.attempts - 1, FinalOutcome: "SUCCESS (ALERT: Potential Unauthorized Access)", Timeframe: 'MFA_SESSION' });
    }

    await logAudit(req, 'MFA_MONITOR', [], { outcome: 'SUCCESS', message: `Successful MFA PIN verification (Attempts: ${mfaResult.session.attempts})` });
    await AuthService.consumeMfaSession(mfaResult.session._id);
    await logAudit(req, 'ADMIN_LOGIN_SUCCESS', [], { userId: 'admin', ip: getClientIp(req) });

    const token = signToken({ id: 'admin', role: 'admin', scopes: ['*'] });
    setSessionCookie(res, token);

    const isWeb = req.headers['sec-fetch-mode'] || req.headers['origin'];
    res.json({
      success: true, ...(isWeb ? {} : { token }),
      user: { id: 'admin', name: 'System Admin', role: 'admin', avatar: 'https://ui-avatars.com/api/?name=Admin&background=random' }
    });
  }));

  // ─── Logout ────────────────────────────────────────────────
  router.post('/logout', (req, res) => {
    res.clearCookie('acetrack_session');
    res.clearCookie('acetrack_csrf');
    res.json({ success: true, message: 'Logged out successfully' });
  });

  // ─── Regular User Login ────────────────────────────────────
  router.post('/user/login', loginLimiter, asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Username/Email and Password are required.' });

    const search = String(identifier).toLowerCase().trim();
    if (search === 'admin') return res.status(403).json({ error: 'Access Denied. Use the administrator login.' });

    const userDoc = await AuthService.findUserByIdentifier(search);
    const user = userDoc?.data;

    if (!user) return res.status(401).json({ error: 'Invalid User' });
    if (user.role === 'admin' || user.role === 'support') return res.status(401).json({ error: 'Invalid User' });

    if (!user.password) return res.status(401).json({ error: 'Account not fully set up. Please reset your password.' });

    const verification = await AuthService.verifyPassword(password, user.password);
    if (verification.reason === 'unhashed_password') {
      console.warn(`🛑 [SECURITY] Account ${user.id} has unhashed password. Forcing reset.`);
      return res.status(401).json({ error: 'Your password needs to be reset for security. Use the Forgot Password flow.' });
    }

    if (!verification.match) {
      await trackLoginAttempt(req, search, password, false);
      return res.status(401).json({ error: 'Invalid password.' });
    }

    await trackLoginAttempt(req, search, password, true);
    const { password: _pw, pushTokens, devices, ...safeUser } = user;
    const token = signToken({ id: user.id, role: user.role || 'user', scopes: ['read:basic'] });
    setSessionCookie(res, token);

    const isWeb = req.headers['sec-fetch-mode'] || req.headers['origin'];
    res.json({ success: true, ...(isWeb ? {} : { token }), user: safeUser });
  }));

  // ─── Support Staff Login ───────────────────────────────────
  router.post('/support/login', loginLimiter, asyncHandler(async (req, res) => {
    const { identifier, password } = req.body;
    if (!identifier || !password) return res.status(400).json({ error: 'Username/Email and Password are required.' });

    const search = String(identifier).toLowerCase().trim();
    if (search === 'admin') return res.status(403).json({ error: 'Access Denied. Use the administrator login.' });

    await logAudit(req, 'DEBUG_SUPPORT_LOGIN_PAYLOAD', [], { receivedIdentifier: identifier, processedSearch: search });

    const supportDoc = await AuthService.findSupportUser(search);
    const supportUser = supportDoc?.data;
    console.log(`[DIAG] Support Login Attempt: ${search} | Found: ${!!supportUser}`);

    if (!supportUser) {
      const anyDoc = await AuthService.findUserByIdentifier(search);
      const anyUser = anyDoc?.data;
      await logAudit(req, 'DEBUG_SUPPORT_LOGIN_FAILED_SEARCH', [], { search, foundAnyUser: !!anyUser, foundRole: anyUser?.role || null });
      if (anyUser) await logAudit(req, 'SUPPORT_LOGIN_DENIED_ROLE', [], { identifier: search, foundRole: anyUser.role, status: anyUser.supportStatus });
      return res.status(401).json({ error: 'Access Denied. This portal is for AceTrack Administrators and Support Staff only.' });
    }

    if (supportUser.loginBlockedUntil && supportUser.loginBlockedUntil > Date.now()) {
      const remaining = Math.ceil((supportUser.loginBlockedUntil - Date.now()) / 60000);
      return res.status(403).json({ error: `Security Lockdown: Your account is temporarily blocked. Try again in ${remaining} minutes.` });
    }

    if (['terminated', 'inactive', 'suspended'].includes(supportUser.supportStatus)) {
      await logAudit(req, 'DEBUG_SUPPORT_LOGIN_DEACTIVATED', [], { identifier: search, status: supportUser.supportStatus });
      return res.status(403).json({ error: 'Access Suspended: Your employment profile has been deactivated.' });
    }

    if (!supportUser.password) return res.status(401).json({ error: 'Account not fully set up. Please use the password reset flow.' });

    const verification = await AuthService.verifyPassword(password, supportUser.password);
    if (verification.reason === 'unhashed_password') {
      console.warn(`🛑 [SECURITY] Account ${supportUser.id} has unhashed password. Forcing reset.`);
      return res.status(401).json({ error: 'Your password needs to be reset for security. Use the Forgot Password flow.' });
    }

    if (!verification.match) {
      await trackLoginAttempt(req, search, password, false);
      await logAudit(req, 'DEBUG_SUPPORT_LOGIN_WRONG_PASSWORD', [], { identifier: search, expectedPwLength: supportUser.password.length, receivedPwLength: password.length });
      const geoLoc = await AuthService.resolveIpGeo(getClientIp(req));
      await logAudit(req, 'SUPPORT_LOGIN_FAILED', [], { identifier: search, reason: 'wrong_password', ip: getClientIp(req), location: geoLoc });
      return res.status(401).json({ error: 'Invalid password for support account.' });
    }

    await trackLoginAttempt(req, search, password, true);

    const jti = await AuthService.createSupportSession(supportUser.id);
    const { password: _pw, pushTokens, devices, ...safeUser } = supportUser;

    await logAudit(req, 'SUPPORT_LOGIN_SUCCESS', [], { userId: supportUser.id, email: supportUser.email, identifier: search });

    const token = signToken({ id: supportUser.id, role: 'support', scopes: ['read:basic', 'write:tickets'] }, jti);
    setSessionCookie(res, token);

    const isWeb = req.headers['sec-fetch-mode'] || req.headers['origin'];
    res.json({ success: true, ...(isWeb ? {} : { token }), user: safeUser });
  }));

  // ─── Password Reset: Request ───────────────────────────────
  router.post('/support/password-reset/request', passwordResetLimiter, asyncHandler(async (req, res) => {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: 'Email or Username required' });

    const search = identifier.toLowerCase().trim();
    if (search === 'admin') {
      return res.status(403).json({ error: 'Security Violation', message: 'Password reset is not permitted for the system administrator account via this portal. Contact technical support for master account recovery.' });
    }

    const userDoc = await AuthService.findUserByIdentifier(search);
    const user = userDoc?.data;
    if (!user) return res.json({ success: true, message: 'If an account exists, a recovery link has been sent.' });
    if (!user.email) return res.status(400).json({ error: 'This account does not have a registered email address. Contact support.' });

    const { token, expiresAt } = await AuthService.createPasswordResetToken(user.email);
    const resetLink = `https://acetrack-suggested.onrender.com/reset-password/${token}`;

    console.log(`📧 [RESET] Dispatching reset email to ${user.email} (link: .../${token.substring(0,8)}...)`);
    const emailStatus = await sendPasswordResetEmail(user.email, resetLink, expiresAt.toISOString(), user.firstName || user.name || '');

    if (!emailStatus.success) {
      console.error(`❌ [RESET] Email FAILED to ${user.email}: ${emailStatus.error}`);
      await logAudit(req, 'SUPPORT_PASSWORD_RESET_EMAIL_FAILED', [], { email: user.email, error: emailStatus.error });
      return res.status(500).json({ error: 'Failed to send recovery email. Please try again later.' });
    }

    console.log(`✅ [RESET] Email sent to ${user.email}: ${emailStatus.messageId || 'Success'}`);
    await logAudit(req, 'SUPPORT_PASSWORD_RESET_EMAIL_SENT', [], { email: user.email });
    res.json({ success: true, message: 'Recovery link sent to your registered email.' });
  }));

  // ─── Password Reset: Confirm ───────────────────────────────
  router.post('/support/password-reset/confirm', asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and new password required' });

    const result = await AuthService.consumePasswordResetToken(token, newPassword);
    if (!result.success) {
      return res.status(result.reason === 'user_not_found' ? 404 : 400).json({
        error: result.reason === 'user_not_found' ? 'User account not found' : 'Invalid or expired reset token'
      });
    }

    await logAudit(req, 'SUPPORT_PASSWORD_RESET_SUCCESS', [], { email: result.email });
    res.json({ success: true, message: 'Password updated successfully. You can now login.' });
  }));

  // ─── Username Availability ─────────────────────────────────
  router.post('/check-username', apiKeyGuard, asyncHandler(async (req, res) => {
    if (!req.body.username) return res.status(400).json({ error: 'Username required' });
    const available = await AuthService.checkUsernameAvailability(req.body.username);
    res.json({ available });
  }));

  // ─── Partner Lookup by Phone ───────────────────────────────
  router.get('/user/lookupByPhone', apiKeyGuard, phoneLookupLimiter, asyncHandler(async (req, res) => {
    if (!req.query.phone) return res.status(400).json({ error: 'Phone number required' });
    const user = await AuthService.lookupByPhone(req.query.phone);
    if (!user) return res.status(404).json({ error: 'No user found with this phone number' });
    res.json({ success: true, user });
  }));

  // ─── Pro Subscription ─────────────────────────────────────
  router.post('/user/subscribe', apiKeyGuard, asyncHandler(async (req, res) => {
    const userId = req.headers['x-user-id'] || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'User ID required' });
    const result = await AuthService.subscribePro(userId, req.body.tier);
    respond(res, result);
  }));

  return router;
}
