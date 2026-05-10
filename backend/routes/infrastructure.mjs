import express from 'express';
import { AppState, Player } from '../models/index.mjs';

export default function createInfrastructureRoutes({ APP_VERSION, syncMutex }) {
  const router = express.Router();

  // Root catch-all for legacy health monitors (JSON fallback)
  router.get('/', (req, res, next) => {
    if (req.headers.accept?.includes('application/json')) {
      return res.json({ status: 'ok', version: APP_VERSION });
    }
    next();
  });

  // Public Health Check (Requires Health Token for Production Monitoring)
  router.get('/health', (req, res) => {
    const healthToken = req.headers['x-health-token'];
    if (process.env.NODE_ENV === 'production' && (!healthToken || healthToken !== process.env.HEALTH_TOKEN)) {
      return res.status(403).json({ error: 'Access Denied' });
    }
    res.json({ status: 'ok', uptime: process.uptime(), version: APP_VERSION });
  });

  // 🛡️ [SMTP DIAGNOSTICS] — Temporary endpoint to debug Render email issues
  router.get('/smtp-diag', async (req, res) => {
    const nodemailer = await import('nodemailer');
    const gmailUser = process.env.GMAIL_USER;
    const gmailPass = process.env.GMAIL_APP_PASSWORD;
    
    const result = {
      envVars: {
        GMAIL_USER: gmailUser ? gmailUser.substring(0, 5) + '...' + gmailUser.slice(-10) : 'NOT_SET',
        GMAIL_APP_PASSWORD: gmailPass ? `***SET (${gmailPass.length} chars)` : 'NOT_SET',
      },
      smtpVerify: null,
      smtpError: null,
      testEmailSent: null,
    };
    
    if (!gmailUser || !gmailPass) {
      result.smtpError = 'Missing credentials';
      return res.json(result);
    }
    
    const transport = nodemailer.default.createTransport({
      service: 'gmail',
      pool: false,
      auth: { user: gmailUser, pass: gmailPass },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });
    
    try {
      await transport.verify();
      result.smtpVerify = 'SUCCESS';
    } catch (err) {
      result.smtpVerify = 'FAILED';
      result.smtpError = `${err.message} (code: ${err.code || 'none'})`;
      transport.close();
      return res.json(result);
    }
    
    // If verify passed, try sending a test email
    try {
      const info = await transport.sendMail({
        from: `"AceTrack SMTP Test" <${gmailUser}>`,
        to: gmailUser,
        subject: `SMTP Diag Test — ${new Date().toISOString()}`,
        text: 'This email was sent from the Render SMTP diagnostic endpoint.'
      });
      result.testEmailSent = `SUCCESS: ${info.messageId}`;
    } catch (err) {
      result.testEmailSent = `FAILED: ${err.message}`;
    }
    
    transport.close();
    res.json(result);
  });

  // 🛡️ [SLACK INTERACTION ENDPOINT] (v2.6.212)
  // Handles "Approve" and "Block" buttons from Slack security alerts
  router.post('/slack/interact', async (req, res) => {
    try {
      // Slack sends payload as a string-encoded JSON in 'payload' field
      if (!req.body.payload) {
        return res.status(400).send("Missing payload");
      }

      const payload = JSON.parse(req.body.payload);
      const actionData = JSON.parse(payload.actions[0].value);
      const { action, target, ip } = actionData;

      console.log(`📡 [SLACK_ACTION] Received ${action} for ${target} from IP ${ip}`);

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
              players[userIdx].loginBlockedUntil = now + (5 * 60 * 1000); // 5 min cooldown
              players[userIdx].lastForceLogoutAt = now; // Invalidate current JWTs
              
              await AppState.findOneAndUpdate(
                {},
                { $set: { 'data.players': players, version: appState.version + 1, lastUpdated: now } }
              );
              await Player.updateOne(
                { id: lockedUser.id },
                { $set: { "data.loginBlockedUntil": lockedUser.loginBlockedUntil, "data.lastForceLogoutAt": lockedUser.lastForceLogoutAt, lastUpdated: new Date() } }
              );
              
              console.warn(`🛡️ [LOCKDOWN] Account ${lockedUser.id} (${lockedUser.role}) LOCKED for 5 mins via Slack Action [Triggered by ${payload.user.name}]`);
              
              return res.json({
                replace_original: false,
                text: `🛑 *LOCKDOWN SUCCESSFUL*: Account *${lockedUser.id}* blocked for 5 minutes. All active sessions invalidated. (Action by: ${payload.user.name})`
              });
            }
          }
        } finally {
          release();
        }
      } else if (action === 'approve') {
         console.log(`✅ [SLACK_ACTION] Admin login approved by ${payload.user.name}`);
         return res.json({
            replace_original: false,
            text: `✅ *APPROVED*: Login session authorized by ${payload.user.name}.`
         });
      }

      res.status(200).send();
    } catch (err) {
      console.error("❌ Slack interaction failed:", err.message);
      res.status(500).send("Internal Server Error");
    }
  });

  return router;
}
