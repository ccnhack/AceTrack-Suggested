/**
 * ═══════════════════════════════════════════════════════════════
 * 🔐 AuthService.mjs (v2.6.772)
 * Extracted from routes/auth.mjs — Monolith Decomposition Phase 1C
 *
 * Pure auth business logic: password verification, session management,
 * user lookup, and subscription handling.
 * ═══════════════════════════════════════════════════════════════
 */
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { AppState, SupportPasswordReset, Player, AdminMFA } from '../models/index.mjs';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ─────────────────────────────────────────────────────────────
// IP Geolocation (best-effort, with 3s timeout)
// ─────────────────────────────────────────────────────────────

export async function resolveIpGeo(ipRaw) {
  try {
    const ipChain = (ipRaw || '').split(',').map(s => s.trim().replace('::ffff:', '')).filter(Boolean);
    const primaryIp = ipChain[0] || '127.0.0.1';
    if (primaryIp === '127.0.0.1' || primaryIp === '::1') return 'Localhost';
    const resp = await fetch(`http://ip-api.com/json/${primaryIp}?fields=city,country`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json();
      if (data.city) return `${data.city}, ${data.country}`;
    }
  } catch (e) {}
  return 'Unknown Location';
}

// ─────────────────────────────────────────────────────────────
// Password Verification (shared by admin, support, user login)
// ─────────────────────────────────────────────────────────────

export async function verifyPassword(inputPassword, storedHash) {
  if (!storedHash) return { match: false, reason: 'no_password' };

  if (storedHash.startsWith('$2a$') || storedHash.startsWith('$2b$')) {
    try {
      const isMatch = await bcrypt.compare(inputPassword, storedHash);
      return { match: isMatch, reason: isMatch ? 'ok' : 'wrong_password' };
    } catch (e) {
      console.error('[AUTH] Password comparison error:', e.message);
      return { match: false, reason: 'comparison_error' };
    }
  }

  // Unhashed password — force reset
  return { match: false, reason: 'unhashed_password' };
}

export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, 10);
}

// ─────────────────────────────────────────────────────────────
// User Lookup Helpers
// ─────────────────────────────────────────────────────────────

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function findUserByIdentifier(identifier, roleFilter = null) {
  const search = String(identifier).toLowerCase().trim();
  const searchReg = new RegExp(`^${escapeRegex(search)}$`, 'i');

  const query = {
    $or: [
      { "data.email": searchReg },
      { id: searchReg },
      { "data.username": searchReg }
    ]
  };

  if (roleFilter) {
    query["data.role"] = roleFilter;
  }

  return Player.findOne(query).select('+data.password').lean();
}

export async function findSupportUser(identifier) {
  const search = String(identifier).toLowerCase().trim();
  const searchReg = new RegExp(`^${escapeRegex(search)}$`, 'i');

  return Player.findOne({
    "data.role": "support",
    $or: [
      { "data.email": searchReg },
      { id: searchReg },
      { "data.username": searchReg },
      { "data.name": searchReg }
    ]
  }).select('+data.password').lean();
}

// ─────────────────────────────────────────────────────────────
// Session Validation
// ─────────────────────────────────────────────────────────────

export async function getAuthenticatedUser(userId) {
  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc?.data) return null;
  const { password, ...sanitizedUser } = playerDoc.data;
  return sanitizedUser;
}

// ─────────────────────────────────────────────────────────────
// Admin MFA
// ─────────────────────────────────────────────────────────────

export async function createMfaSession() {
  const mfaToken = crypto.randomBytes(20).toString('hex');
  await AdminMFA.create({
    token: mfaToken,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 min expiry
  });
  return mfaToken;
}

export async function verifyMfaSession(mfaToken) {
  const session = await AdminMFA.findOne({ token: mfaToken });
  if (!session) return { valid: false, reason: 'not_found' };
  if (session.expiresAt < new Date()) {
    await AdminMFA.deleteOne({ _id: session._id });
    return { valid: false, reason: 'expired' };
  }
  session.attempts = (session.attempts || 0) + 1;
  await session.save();
  return { valid: true, session };
}

export async function consumeMfaSession(sessionId) {
  await AdminMFA.deleteOne({ _id: sessionId });
}

// ─────────────────────────────────────────────────────────────
// Support Session Management
// ─────────────────────────────────────────────────────────────

export async function createSupportSession(userId) {
  const jti = crypto.randomBytes(16).toString('hex');
  const now = Date.now();

  const userDoc = await Player.findOne({ id: userId }).lean();
  const activeSessions = [...(userDoc?.data?.activeSessions || [])];
  activeSessions.push({ jti, iat: now });
  const rotatedSessions = activeSessions.sort((a, b) => b.iat - a.iat).slice(0, 2);

  await Player.updateOne(
    { id: userId },
    { $set: {
      "data.activeSessions": rotatedSessions,
      "data.isLive": true,
      "data.liveSessionStart": now,
      "data.lastActive": now,
      lastUpdated: new Date()
    }}
  );

  return jti;
}

// ─────────────────────────────────────────────────────────────
// Password Reset
// ─────────────────────────────────────────────────────────────

export async function createPasswordResetToken(email) {
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await SupportPasswordReset.create({ email, token, expiresAt });
  return { token, expiresAt };
}

export async function consumePasswordResetToken(token, newPassword) {
  const resetReq = await SupportPasswordReset.findOne({ token, expiresAt: { $gt: new Date() } });
  if (!resetReq) return { success: false, reason: 'invalid_or_expired' };

  const escapedEmail = resetReq.email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const agentDoc = await Player.findOne({
    "data.email": { $regex: new RegExp(`^${escapedEmail}$`, 'i') },
    "data.role": "support"
  }).lean();

  if (!agentDoc || agentDoc.id === 'admin') return { success: false, reason: 'user_not_found' };

  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  await Player.updateOne(
    { id: agentDoc.id },
    { $set: { "data.password": hashedPassword, "data.devices": [], lastUpdated: new Date() } }
  );

  await SupportPasswordReset.deleteOne({ token });
  return { success: true, email: resetReq.email };
}

// ─────────────────────────────────────────────────────────────
// Change Password
// ─────────────────────────────────────────────────────────────

export async function changePassword(userId, oldPassword, newPassword) {
  if (!oldPassword || !newPassword) return { status: 400, success: false, error: 'Current password and new password are required.' };
  if (newPassword.length < 8) return { status: 400, success: false, error: 'New password must be at least 8 characters long.' };

  const playerDoc = await Player.findOne({ id: userId }).select('+data.password').lean();
  if (!playerDoc?.data) return { status: 404, success: false, error: 'User not found.' };

  const currentHash = playerDoc.data.password;
  if (!currentHash) return { status: 400, success: false, error: 'Account not fully set up. Cannot change password.' };

  const result = await verifyPassword(oldPassword, currentHash);
  if (!result.match) return { status: 401, success: false, error: 'Current password is incorrect.' };

  const hashedNewPassword = await bcrypt.hash(newPassword, 10);
  await Player.updateOne(
    { id: userId },
    { $set: { "data.password": hashedNewPassword, lastUpdated: new Date() } }
  );

  return { status: 200, success: true, message: 'Password updated successfully.' };
}

// ─────────────────────────────────────────────────────────────
// Username Availability
// ─────────────────────────────────────────────────────────────

export async function checkUsernameAvailability(username) {
  const search = String(username).toLowerCase().trim();
  if (search === 'admin') return false;

  const searchReg = new RegExp(`^${escapeRegex(search)}$`, 'i');
  const existing = await Player.findOne({
    $or: [{ id: searchReg }, { "data.username": searchReg }]
  }).lean();

  return !existing;
}

// ─────────────────────────────────────────────────────────────
// Phone Lookup (Doubles Partner)
// ─────────────────────────────────────────────────────────────

export async function lookupByPhone(phone) {
  const searchPhone = String(phone).trim();
  const searchReg = new RegExp(`^${escapeRegex(searchPhone)}$`, 'i');

  const userDoc = await Player.findOne({ "data.phone": searchReg, "data.role": { $ne: "admin" } }).lean();
  if (!userDoc?.data) return null;

  return {
    id: userDoc.data.id,
    name: userDoc.data.name || userDoc.data.username,
    gender: userDoc.data.gender
  };
}

// ─────────────────────────────────────────────────────────────
// Pro Subscription
// ─────────────────────────────────────────────────────────────

export async function subscribePro(userId, tier) {
  const playerDoc = await Player.findOne({ id: userId }).lean();
  if (!playerDoc?.data) return { status: 404, success: false, error: 'User not found' };

  const durationDays = tier === 'annual' ? 365 : 30;
  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  await Player.updateOne(
    { id: userId },
    { $set: { "data.isPro": true, "data.proTier": tier || 'monthly', "data.proExpiresAt": expiresAt, lastUpdated: new Date() } }
  );

  const updatedDoc = await Player.findOne({ id: userId }).lean();
  const { password: _pw, pushTokens, devices, ...safeUser } = updatedDoc.data;
  return { status: 200, success: true, user: safeUser };
}

// ─────────────────────────────────────────────────────────────
// State Recovery
// ─────────────────────────────────────────────────────────────

export async function restoreLastState() {
  const states = await AppState.find().sort({ lastUpdated: -1 }).limit(2);
  if (states.length < 2) return { status: 404, error: 'No previous state found for recovery.' };

  const current = states[0];
  const previous = states[1];

  console.log(`🛡️ [RECOVERY] Attempting restoration. Current: ${current._id} (v${current.version}), Previous: ${previous._id} (v${previous.version})`);

  const recovered = new AppState({
    data: previous.data,
    version: (current.version || 1) + 1,
    lastUpdated: new Date(),
    lastSocketId: 'SYSTEM_RECOVERY'
  });

  await recovered.save();
  console.log(`✅ [RECOVERY] Successfully promoted previous state to latest. New Version: ${recovered.version}`);

  return {
    status: 200, success: true,
    message: `State recovered successfully. Restored data from ${previous.lastUpdated.toISOString()}.`,
    newVersion: recovered.version,
    fromVersion: current.version, toVersion: recovered.version,
    restoredFrom: previous.lastUpdated
  };
}
