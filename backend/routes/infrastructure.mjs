import express from 'express';
import { AppState, Player, AuditLog } from '../models/index.mjs';
import { asyncHandler } from '../helpers/utils.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';
import nodemailer from 'nodemailer';

export default function createInfrastructureRoutes({ 
  syncMutex, 
  logAudit,
  APP_VERSION
}) {
  const router = express.Router();

  // GET /api/infrastructure/status
  router.get('/status', (req, res) => {
    res.json({
      success: true,
      service: 'infrastructure',
      status: 'healthy',
      version: APP_VERSION,
      timestamp: new Date().toISOString()
    });
  });

  // POST /api/infrastructure/mail/test
  router.post('/mail/test', apiKeyGuard, authGuard, async (req, res) => {
    if (req.userRole !== 'admin') return res.status(403).json({ error: 'Admin only' });
    
    const { to } = req.body;
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const result = await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: 'AceTrack Infrastructure Test',
      text: 'Test email from AceTrack infrastructure service.'
    });
    
    transport.close();
    res.json(result);
  });

  // 🛡️ [SECURITY EXPORT ENDPOINT] (v2.6.352)
  // Generates and downloads a raw JSON file of security events
  router.get('/security/export', async (req, res) => {
    try {
      const timeframeHours = parseInt(req.query.hours) || 24;
      const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
      const { SecuritySummary } = await import('../models/index.mjs');
      const summaries = await SecuritySummary.find({ lastEventAt: { $gt: since } }).lean();

      const rawData = {
        generatedAt: new Date().toISOString(),
        timeframe: `${timeframeHours}h`,
        events: summaries
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=security_audit_${timeframeHours}h.json`);
      return res.send(JSON.stringify(rawData, null, 2));
    } catch (err) {
      res.status(500).send("Export failed: " + err.message);
    }
  });

  // 🛡️ [SLACK INTERACTION ENDPOINT] (v2.6.212)
  router.post('/slack/interact', async (req, res) => {
    try {
      if (!req.body.payload) return res.status(400).send("Missing payload");
      const payload = JSON.parse(req.body.payload);
      const actionData = JSON.parse(payload.actions[0].value);
      const { action, target, ip, timeframe } = actionData;

      console.log(`📡 [SLACK_ACTION] Received ${action} for ${target || 'system'} from IP ${ip || 'internal'}`);

      if (action === 'block') {
        const release = await syncMutex.acquire();
        try {
          const appState = await AppState.findOne().sort({ lastUpdated: -1 });
          if (appState?.data?.players) {
            const players = [...appState.data.players];
            const userIdx = players.findIndex(p => 
              String(p.id).toLowerCase() === String(target).toLowerCase() || 
              String(p.email).toLowerCase() === String(target).toLowerCase() ||
              String(p.username).toLowerCase() === String(target).toLowerCase()
            );

            if (userIdx !== -1) {
              const now = Date.now();
              const lockedUser = players[userIdx];
              players[userIdx].loginBlockedUntil = now + (5 * 60 * 1000);
              players[userIdx].lastForceLogoutAt = now;
              
              await AppState.findOneAndUpdate({}, { $set: { 'data.players': players, version: appState.version + 1, lastUpdated: now } });
              await Player.updateOne({ id: lockedUser.id }, { $set: { "data.loginBlockedUntil": lockedUser.loginBlockedUntil, "data.lastForceLogoutAt": lockedUser.lastForceLogoutAt, lastUpdated: new Date() } });
              
              return res.json({
                replace_original: false,
                text: `🛑 *LOCKDOWN SUCCESSFUL*: Account *${lockedUser.id}* blocked for 5 minutes. (Action by: ${payload.user.name})`
              });
            }
          }
        } finally { release(); }
      } else if (action === 'approve') {
         return res.json({ replace_original: false, text: `✅ *APPROVED*: Login session authorized by ${payload.user.name}.` });
      } else if (action === 'view_security_details') {
         const downloadUrl = `https://acetrack-suggested.onrender.com/api/infrastructure/security/export?hours=${timeframe || 24}`;
         return res.json({
            replace_original: false,
            response_type: "ephemeral",
            text: `📂 *Security Audit Ready for Download*\nClick the link below to download the full raw JSON report for the last ${timeframe || 24} hours:\n\n🔗 <${downloadUrl}|Download security_audit.json>`
         });
      }

      res.status(200).send();
    } catch (err) {
      console.error("❌ Slack interaction failed:", err.message);
      res.status(500).send("Internal Server Error");
    }
  });

  // 🛡️ [SLACK COMMAND ENDPOINT] (v2.6.349)
  router.post('/slack/command', async (req, res) => {
    try {
      const { command, text, user_name } = req.body;
      if (command === '/acetrack' && String(text).trim().toLowerCase() === 'security') {
        const { generateSecuritySummaryBlocks } = await import('../services/scheduler.mjs');
        const summary = await generateSecuritySummaryBlocks(24);
        return res.json({ response_type: "ephemeral", ...summary });
      }
      res.status(200).send();
    } catch (err) {
      res.status(500).send("Command failed");
    }
  });

  return router;
}
