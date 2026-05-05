import { SecuritySummary } from '../models/index.mjs';

/**
 * Initializes background cron jobs and background intervals
 */
export default function initScheduler(loginAttempts, sendSecurityAlert) {
  // 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)
  // Runs every 5 minutes to report ongoing high-volume attacks
  setInterval(async () => {
    const now = Date.now();
    for (const [key, state] of loginAttempts.entries()) {
      // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Prune attempts older than 10 minutes to fix memory leak
      state.attempts = state.attempts.filter(a => now - a.timestamp < 600000);

      const failures = state.attempts.filter(a => !a.success);
      if (failures.length >= 10 && (now - state.lastSummaryAt >= 300000)) {
        const [identifier, ip] = key.split('_');
        const uniquePasswords = [...new Set(failures.map(f => f.password))].slice(0, 10).join(', ');
        
        console.log(`🛡️ [SUMMARY] Reporting sustained attack for ${identifier} from ${ip}`);
        await sendSecurityAlert({
            action: 'BRUTE_FORCE_CUMULATIVE_SUMMARY',
            ipAddress: ip,
            actor: identifier,
            details: {
              TargetUser: identifier,
              TotalAttempts: state.attempts.length,
              FailureCount: failures.length,
              SamplePasswords: uniquePasswords,
              Timeframe: 'Last 5 minutes'
            }
        });
        state.lastSummaryAt = now;
      }
      
      // Cleanup empty or stale tracking records
      if (state.attempts.length === 0) {
        loginAttempts.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  // 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195)
  setInterval(async () => {
    try {
      const pendingSummaries = await SecuritySummary.find({
        isSummarized: false,
        lastEventAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) } // Active in the last hour
      });

      const formatIST = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true }).format(date);
      const formatDateIST = (date) => new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }).format(date);

      for (const summary of pendingSummaries) {
        // 🛡️ Rolling Alert Logic (v2.6.209)
        const hasEnoughEvents = summary.events.length >= 5;
        const isNew = !summary.lastAlertedAt;
        const cooldownPassed = summary.lastAlertedAt && (Date.now() - summary.lastAlertedAt.getTime() > 5 * 60 * 1000);
        const isIdle = (Date.now() - summary.lastEventAt.getTime() > 30 * 60 * 1000);

        if (!hasEnoughEvents && !isIdle) continue; // Not enough noise yet
        if (!isNew && !cooldownPassed && !isIdle) continue; // In cooldown

        if (summary.events.length <= 1 && isIdle) {
          summary.isSummarized = true;
          await summary.save();
          continue;
        }

        const successCount = summary.events.filter(e => e.action.includes('SUCCESS')).length;
        const failureCount = summary.events.length - successCount;
        
        const payload = {
          text: `🤖 *AI Security Aggregator*`,
          blocks: [
            {
              type: "header",
              text: { type: "plain_text", text: `🛡️ Security Summary Update` }
            },
            {
              type: "section",
              fields: [
                { type: "mrkdwn", text: `*Target:* ${summary.targetUser}` },
                { type: "mrkdwn", text: `*Date:* ${formatDateIST(summary.lastEventAt)}` },
                { type: "mrkdwn", text: `*Events:* ${summary.events.length}` },
                { type: "mrkdwn", text: `*Failures:* ${failureCount} | *Success:* ${successCount}` }
              ]
            },
            {
              type: "context",
              elements: [
                { type: "mrkdwn", text: `_Last event at ${formatIST(summary.lastEventAt)}_` }
              ]
            }
          ]
        };

        const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;
        if (SECURITY_WEBHOOK_URL) {
          await fetch(SECURITY_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        summary.lastAlertedAt = new Date();
        if (isIdle) {
          summary.isSummarized = true;
        }
        await summary.save();
      }
    } catch (err) {
      console.error("AI Aggregator Error:", err.message);
    }
  }, 5 * 60 * 1000); 

  // 🛡️ SCALABILITY: Background Data Pruning (v2.6.316)
  // Prunes stale Matchmaking and ChatbotThread documents to prevent DB bloat.
  setInterval(async () => {
    try {
      const { Matchmaking, ChatbotThread } = await import('../models/index.mjs');
      
      const matchmakingPruneDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const mRes = await Matchmaking.deleteMany({ lastUpdated: { $lt: matchmakingPruneDate } });
      if (mRes.deletedCount > 0) console.log(`🕒 [CLEANUP] Pruned ${mRes.deletedCount} stale matchmaking records.`);

      const chatbotPruneDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const cRes = await ChatbotThread.deleteMany({ lastUpdated: { $lt: chatbotPruneDate } });
      if (cRes.deletedCount > 0) console.log(`🕒 [CLEANUP] Pruned ${cRes.deletedCount} stale chatbot threads.`);
    } catch (err) {
      console.error("Cleanup Job Error:", err.message);
    }
  }, 24 * 60 * 60 * 1000); // Run daily

  console.log('🕒 Scheduler initialized (Security, AI Aggregator, Pruning)');
}
