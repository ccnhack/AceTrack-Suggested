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
    res.json({ success: true, service: 'infrastructure', status: 'healthy', version: APP_VERSION, timestamp: new Date().toISOString() });
  });

  // 🛡️ [SECURITY EXPORT ENDPOINT] (v2.6.356)
  router.get('/security/export', async (req, res) => {
    try {
      const timeframeHours = parseInt(req.query.hours) || 24;
      const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
      const { SecuritySummary } = await import('../models/index.mjs');
      const summaries = await SecuritySummary.find({ lastEventAt: { $gt: since } }).lean();

      const rawData = { generatedAt: new Date().toISOString(), timeframe: `${timeframeHours}h`, events: summaries };

      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istDate = new Date(now.getTime() + istOffset);
      const day = String(istDate.getUTCDate()).padStart(2, '0');
      const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
      const year = istDate.getUTCFullYear();
      const hours = String(istDate.getUTCHours()).padStart(2, '0');
      const mins = String(istDate.getUTCMinutes()).padStart(2, '0');
      const filename = `security_audit_${day}${month}${year}_${hours}-${mins}.json`;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
      return res.send(JSON.stringify(rawData, null, 2));
    } catch (err) { res.status(500).send("Export failed: " + err.message); }
  });

  // 🛡️ [SLACK INTERACTION ENDPOINT] (v2.6.356)
  // Hardened to log raw payloads to AuditLog for deep diagnostics
  router.post('/slack/interact', async (req, res) => {
    try {
      if (!req.body.payload) return res.status(400).send("Missing payload");
      const payload = JSON.parse(req.body.payload);
      
      // 🛡️ [DIAGNOSTIC LOGGING] (v2.6.356)
      const actionObj = payload.actions?.[0] || {};
      const actionId = actionObj.action_id || actionObj.name;
      
      await logAudit(req, 'SLACK_INTERACT_RECEIVED', [], {
        user: payload.user?.name,
        actionId: actionId,
        triggerId: payload.trigger_id
      });

      console.log(`📡 [SLACK_ACTION] User: ${payload.user?.name} | Action: ${actionId}`);

      // Handle the Security Summary Drill-down
      if (actionId === 'view_security_details') {
         let timeframe = 24;
         try {
           const actionData = JSON.parse(actionObj.value || '{}');
           timeframe = actionData.timeframe || 24;
         } catch (e) {}

         const downloadUrl = `https://acetrack-suggested.onrender.com/security/export?hours=${timeframe}`;
         return res.json({
            replace_original: false,
            response_type: "ephemeral",
            text: `📂 *Security Audit Ready for Download*\nClick the link below to download the full raw JSON report for the last ${timeframe} hours:\n\n🔗 <${downloadUrl}|Download security_audit.json>`
         });
      }

      // Handle Approve/Block
      if (actionId === 'security_action' || actionId === 'approve' || actionId === 'block') {
         let actionData = {};
         try { actionData = JSON.parse(actionObj.value || '{}'); } catch (e) {}
         const { action, target, ip } = actionData;
         const finalAction = action || actionId;

         if (finalAction === 'block') {
           const release = await syncMutex.acquire();
           try {
             const appState = await AppState.findOne().sort({ lastUpdated: -1 });
             const players = [...(appState?.data?.players || [])];
             const userIdx = players.findIndex(p => String(p.id).toLowerCase() === String(target).toLowerCase() || String(p.email).toLowerCase() === String(target).toLowerCase());

             if (userIdx !== -1) {
               const now = Date.now();
               players[userIdx].loginBlockedUntil = now + (5 * 60 * 1000);
               players[userIdx].lastForceLogoutAt = now;
               await AppState.findOneAndUpdate({}, { $set: { 'data.players': players, version: appState.version + 1, lastUpdated: now } });
               await Player.updateOne({ id: players[userIdx].id }, { $set: { "data.loginBlockedUntil": players[userIdx].loginBlockedUntil, "data.lastForceLogoutAt": players[userIdx].lastForceLogoutAt, lastUpdated: new Date() } });
               return res.json({ replace_original: false, text: `🛑 *LOCKDOWN SUCCESSFUL*: Account *${target}* blocked. (Action by: ${payload.user.name})` });
             }
           } finally { release(); }
         } else if (finalAction === 'approve') {
            return res.json({ replace_original: false, text: `✅ *APPROVED*: Login session authorized by ${payload.user.name}.` });
         }
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
    } catch (err) { res.status(500).send("Command failed"); }
  });

  return router;
}
