import express from 'express';
import crypto from 'crypto';
import { SlackFeedback } from '../../models/index.mjs';
import { asyncHandler } from '../../helpers/utils.mjs';
import { apiKeyGuard } from '../../middleware/security.mjs';
import { handleCommand } from '../../services/slack/SlackCommandHandler.mjs';
import { handleAction } from '../../services/slack/SlackActionHandler.mjs';

export default function createSlackRoutes({ syncMutex, logAudit, APP_VERSION }) {
  const router = express.Router();

  // 🛡️ API Endpoints
  router.get('/infrastructure/slack-feedbacks', apiKeyGuard, asyncHandler(async (req, res) => {
    const limit = parseInt(req.query.limit) || 100;
    const skip = parseInt(req.query.skip) || 0;
    const filter = {};
    
    // Optional status filtering
    if (req.query.status === 'positive') {
      filter.isPositive = true;
    } else if (req.query.status === 'negative') {
      filter.isPositive = false;
      filter.isResolved = { $ne: true };
    } else if (req.query.status === 'resolved') {
      filter.isPositive = false;
      filter.isResolved = true;
    }

    const feedbacks = await SlackFeedback.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
      
    const total = await SlackFeedback.countDocuments(filter);
    
    res.json({ success: true, feedbacks, total });
  }));

  router.post('/infrastructure/slack-feedbacks/:id/resolve', apiKeyGuard, asyncHandler(async (req, res) => {
    const feedbackId = req.params.id;
    const updated = await SlackFeedback.findByIdAndUpdate(feedbackId, { isResolved: true }, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: 'Feedback not found' });
    res.json({ success: true, feedback: updated });
  }));

  // Handles both /slack/command and /slack/interact at all potential paths
  router.post('/slack/command', handleSlackUnified);
  router.post('/slack/interact', handleSlackUnified);
  router.post('/infrastructure/slack/command', handleSlackUnified);
  router.post('/infrastructure/slack/interact', handleSlackUnified);

  // 🛡️ [VAPT-F24] (v2.6.557): Slack Request Signature Verification
  // Prevents unauthorized SSRF/data exfiltration via spoofed Slack commands
  function verifySlackSignature(req) {
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.warn('⚠️ [SLACK] SLACK_SIGNING_SECRET not set — signature verification skipped');
      return true; // Fail-open until secret is configured
    }
    const timestamp = req.headers['x-slack-request-timestamp'];
    const slackSignature = req.headers['x-slack-signature'];
    if (!timestamp || !slackSignature) return false;
    // Reject requests older than 5 minutes (replay protection)
    if (Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp)) > 300) return false;
    const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
    const sigBaseString = `v0:${timestamp}:${rawBody}`;
    const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSignature));
    } catch (e) {
      return false;
    }
  }

  async function handleSlackUnified(req, res) {
    // 🛡️ [VAPT-F24] (v2.6.557): Reject requests with invalid Slack signatures
    if (!verifySlackSignature(req)) {
      console.warn('🛑 [SLACK] Invalid or missing Slack signature — rejecting request');
      return res.status(401).json({ error: 'Unauthorized: Invalid Slack signature' });
    }

    // 🛡️ [VIEW_SUBMISSION FIX] (v2.6.543)
    // Slack view_submission payloads MUST receive the response_action in the HTTP body.
    // We cannot pre-flush a blank 200 for these — let the handler respond directly.
    if (req.body.payload) {
      try {
        const peek = JSON.parse(req.body.payload);
        if (peek.type === 'view_submission') {
          // Route directly WITHOUT pre-flushing. The handler will res.json() the modal dismissal.
          return await handleAction(req, res, false);
        }
      } catch(e) { /* parse failed, fall through to normal flow */ }
    }

    // 🛡️ [INSTANT ACK] (v2.6.383)
    // For slash commands and block_actions, Slack requires a 200 OK within 3 seconds.
    res.status(200).send();

    try {
      if (req.body.payload) {
        return await handleAction(req, res, true, logAudit); // true = delayed mode
      }
      return await handleCommand(req, res, logAudit);
    } catch (err) {
      console.error("❌ Unified Gateway Error:", err.message);
    }
  }

  return router;
}
