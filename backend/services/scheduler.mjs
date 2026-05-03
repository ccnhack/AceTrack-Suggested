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
        // If no activity for 5 minutes, we'll eventually cleanup
        if (state.attempts.length === 0) loginAttempts.delete(key);
      } else if (state.attempts.length === 0 || (now - state.attempts[state.attempts.length-1].timestamp > 600000)) {
        // Cleanup stale memory
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

  console.log('🕒 Scheduler initialized (Cumulative Security, AI Aggregator)');
}
