import express from 'express';
import { Evaluation } from '../models/index.mjs';
import { authGuard } from '../middleware/security.mjs';

/**
 * 🛡️ [VAPT-F15] (v2.6.556): Evaluations REST API
 * Replaces client-side syncOrchestrator.syncAndSaveData with server-validated endpoints.
 * Only admin and coach roles can create/modify evaluations.
 */
export default function({ io }) {
  const router = express.Router();

  // POST /api/v1/evaluations — Create a new evaluation
  router.post('/', authGuard, async (req, res) => {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'coach') {
      return res.status(403).json({ error: 'Only admin or coach can create evaluations' });
    }

    const { evaluation } = req.body;
    if (!evaluation) return res.status(400).json({ error: 'Evaluation data required' });

    try {
      const evalId = evaluation.id || `eval-${Date.now()}`;
      const evalData = {
        id: evalId,
        ...evaluation,
        evaluatorId: req.user.id, // Always use JWT-verified identity
        timestamp: evaluation.timestamp || new Date().toISOString()
      };

      let doc = await Evaluation.findOne({ id: evalId });
      if (!doc) {
        doc = new Evaluation({ id: evalId, data: evalData });
      } else {
        // Only the original evaluator or admin can update
        if (doc.data?.evaluatorId !== req.user.id && userRole !== 'admin') {
          return res.status(403).json({ error: 'Only the original evaluator or admin can update this evaluation' });
        }
        doc.data = evalData;
      }

      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) {
        io.emit('entity_updated', {
          entity: 'evaluations',
          data: doc.data,
          source: 'api',
          timestamp: Date.now()
        });
      }

      res.json({ success: true, evaluation: doc.data });
    } catch (e) {
      console.error('[API] POST /evaluations error:', e.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // GET /api/v1/evaluations — List evaluations (admin/coach)
  router.get('/', authGuard, async (req, res) => {
    try {
      const { playerId, limit = 50 } = req.query;
      const query = playerId ? { 'data.playerId': playerId } : {};
      
      const docs = await Evaluation.find(query)
        .sort({ lastUpdated: -1 })
        .limit(Number(limit))
        .lean();
      
      res.json({ success: true, evaluations: docs.map(d => d.data) });
    } catch (e) {
      console.error('[API] GET /evaluations error:', e.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}
