/**
 * ═══════════════════════════════════════════════════════════════
 * 🏆 Tournament Routes (v2.6.772)
 * Thin HTTP handlers — all business logic in services/TournamentService.mjs
 * ═══════════════════════════════════════════════════════════════
 */
import express from 'express';
import { authGuard } from '../middleware/security.mjs';
import * as TournamentService from '../services/TournamentService.mjs';
import * as PartnerChatService from '../services/PartnerChatService.mjs';

import { validateSchema, createTournamentSchema, updateTournamentSchema, registerPlayerSchema } from '../middleware/validators/tournamentValidators.mjs';

export default function({ io }) {
  const router = express.Router();

  // Helper: send service result as HTTP response
  const respond = (res, result) => {
    const { status, ...body } = result;
    return res.status(status).json(body);
  };

  // Helper: admin-only guard
  const adminOnly = (req, res) => {
    if (req.user.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return false;
    }
    return true;
  };

  // ─── Player Registration ─────────────────────────────────
  router.post('/:id/register', authGuard, validateSchema(registerPlayerSchema), async (req, res) => {
    try {
      const result = await TournamentService.registerPlayer(req.params.id, req.user.id, req.body, io);
      respond(res, result);
    } catch (err) {
      console.error('[Registration API] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ─── Player Opt-Out ──────────────────────────────────────
  router.post('/:id/optout', authGuard, async (req, res) => {
    try {
      const result = await TournamentService.optOutPlayer(req.params.id, req.user.id, req.body, io);
      respond(res, result);
    } catch (err) {
      console.error('[OptOut API] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ─── Start Tournament (Admin) ────────────────────────────
  router.post('/:id/start', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.startTournament(req.params.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── End Tournament (Admin) ──────────────────────────────
  router.post('/:id/end', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.endTournament(req.params.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Remove Coach (Admin) ────────────────────────────────
  router.post('/:id/remove-coach', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.removeCoach(req.params.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Manage Interested Players (Admin) ───────────────────
  router.post('/:id/manage-interested', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.manageInterested(req.params.id, req.body.pid, req.body.action, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Remove Pending Player (Admin) ───────────────────────
  router.post('/:id/remove-pending', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.removePending(req.params.id, req.body.pid, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Delete Tournament (Admin) ───────────────────────────
  router.delete('/:id', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.deleteTournament(req.params.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Decline Coach Assignment ────────────────────────────
  router.post('/:id/decline-coach', authGuard, async (req, res) => {
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach only' });
    try {
      const result = await TournamentService.declineCoach(req.params.id, req.user.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ─── Confirm Coach Assignment ────────────────────────────
  router.post('/:id/confirm-coach', authGuard, async (req, res) => {
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach only' });
    try {
      const result = await TournamentService.confirmCoach(req.params.id, req.user.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Join Waitlist ───────────────────────────────────────
  router.post('/:id/waitlist', authGuard, async (req, res) => {
    try {
      const result = await TournamentService.joinWaitlist(req.params.id, req.user.id, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Create Tournament (Admin) ───────────────────────────
  router.post('/', authGuard, validateSchema(createTournamentSchema), async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.createTournament(req.body.tournament, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Update Tournament (Admin) ───────────────────────────
  router.put('/:id', authGuard, validateSchema(updateTournamentSchema), async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.updateTournament(req.params.id, req.body.tournament, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Assign Coach (Admin) ────────────────────────────────
  router.post('/:id/assign-coach', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.assignCoach(req.params.id, req.body.coachId, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Coach Comment ───────────────────────────────────────
  router.post('/:id/coach-comment', authGuard, async (req, res) => {
    try {
      const result = await TournamentService.addCoachComment(req.params.id, req.user.id, req.body.comment, req.user.role, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Add Player (Admin) ──────────────────────────────────
  router.post('/:id/add-player', authGuard, async (req, res) => {
    if (!adminOnly(req, res)) return;
    try {
      const result = await TournamentService.addPlayer(req.params.id, req.body.playerId, io);
      respond(res, result);
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ─── Join Team (Doubles) ─────────────────────────────────
  router.post('/:id/join-team', authGuard, async (req, res) => {
    try {
      const result = await TournamentService.joinTeam(req.params.id, req.user.id, req.body.teamCode, io);
      respond(res, result);
    } catch (err) {
      console.error('[Join-Team API] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ─── Partner Chat: GET ───────────────────────────────────
  router.get('/:id/partner-chat', authGuard, async (req, res) => {
    try {
      const result = await PartnerChatService.getPartnerChat(req.params.id, req.user.id);
      respond(res, result);
    } catch (err) {
      console.error('[Partner-Chat GET] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ─── Partner Chat: POST ──────────────────────────────────
  router.post('/:id/partner-chat', authGuard, async (req, res) => {
    try {
      const result = await PartnerChatService.sendPartnerMessage(req.params.id, req.user.id, req.body.content, io);
      respond(res, result);
    } catch (err) {
      console.error('[Partner-Chat POST] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ─── Check-In ────────────────────────────────────────────
  router.post('/:id/check-in', authGuard, async (req, res) => {
    try {
      const result = await TournamentService.checkInPlayer(req.params.id, req.user.id, req.user.role, req.body, io);
      respond(res, result);
    } catch (err) {
      console.error('[CheckIn API] Error:', err);
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  return router;
}
