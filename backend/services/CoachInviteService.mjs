/**
 * ═══════════════════════════════════════════════════════════════
 * 🏋️ CoachInviteService.mjs (v2.6.772)
 * Extracted from routes/auth.mjs — Monolith Decomposition Phase 1C
 *
 * Business logic for coach invitation lifecycle:
 * validate, track, consume, and list invites.
 * ═══════════════════════════════════════════════════════════════
 */
import { Player, CoachInvite } from '../models/index.mjs';

// ─────────────────────────────────────────────────────────────
// validateInvite — Check if a coach invite token is valid
// ─────────────────────────────────────────────────────────────

export async function validateInvite(token) {
  if (!token) return { status: 400, error: 'Token is required' };

  const invite = await CoachInvite.findOne({ token });
  if (!invite) return { status: 404, error: 'Invite not found or invalid' };

  if (new Date() > invite.expiresAt) {
    if (invite.status !== 'Expired') {
      invite.status = 'Expired';
      await invite.save();
    }
    return { status: 410, error: 'This invitation has expired' };
  }

  if (invite.status === 'Used') {
    return { status: 409, error: 'This invitation has already been used' };
  }

  return {
    status: 200, success: true,
    invite: {
      email: invite.email,
      name: invite.name,
      phone: invite.phone,
      academyId: invite.academyId,
      tournamentId: invite.tournamentId
    }
  };
}

// ─────────────────────────────────────────────────────────────
// trackInvite — Record click/view events on an invite
// ─────────────────────────────────────────────────────────────

export async function trackInvite(token, action, clientIp, userAgent) {
  if (!token || !action) return { status: 400, error: 'Token and action required' };

  const invite = await CoachInvite.findOne({ token });
  if (!invite) return { status: 404, error: 'Invite not found' };

  if (invite.status === 'Pending' && action === 'link_click') {
    invite.status = 'Clicked';
  }

  invite.clicks.push({ action, ip: clientIp, userAgent, timestamp: new Date() });
  await invite.save();

  return { status: 200, success: true };
}

// ─────────────────────────────────────────────────────────────
// consumeInvite — Mark invite as used and affiliate the coach
// ─────────────────────────────────────────────────────────────

export async function consumeInvite(token, username, clientIp, userAgent) {
  if (!token || !username) return { status: 400, error: 'Token and username required' };

  const invite = await CoachInvite.findOne({ token });
  if (!invite) return { status: 404, error: 'Invite not found' };
  if (invite.status === 'Used') return { status: 409, error: 'Invite already used' };

  invite.status = 'Used';
  invite.clicks.push({ action: 'form_submit', ip: clientIp, userAgent, timestamp: new Date() });
  await invite.save();

  // Auto-Affiliate: Update coach profile
  await Player.updateOne(
    { id: username },
    { $set: { "data.isApprovedCoach": true, "data.affiliatedAcademy": invite.academyId, lastUpdated: new Date() } }
  );

  // Auto-Affiliate: Update tournament
  // Dynamic import to avoid circular dependency
  const { Tournament } = await import('../models/index.mjs');
  const t = await Tournament.findOne({ id: invite.tournamentId }).lean();
  if (t?.data) {
    await Tournament.updateOne(
      { id: invite.tournamentId },
      { $set: { "data.coachStatus": "Accepted", "data.assignedCoachId": username, lastUpdated: new Date() } }
    );
  }

  return {
    status: 200, success: true,
    meta: { coachUsername: username, academyId: invite.academyId, tournamentId: invite.tournamentId }
  };
}

// ─────────────────────────────────────────────────────────────
// listInvites — Fetch all coach invites (admin view)
// ─────────────────────────────────────────────────────────────

export async function listInvites() {
  const invites = await CoachInvite.find().sort({ createdAt: -1 }).lean();
  return { status: 200, success: true, invites };
}
