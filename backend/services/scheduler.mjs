import { SecuritySummary } from '../models/index.mjs';

// 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)
// Runs to report ongoing high-volume attacks
export async function runBruteForceSummary(loginAttempts, sendSecurityAlert) {
  const now = Date.now();
  for (const [key, state] of loginAttempts.entries()) {
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Prune attempts older than 10 minutes to fix memory leak
    state.attempts = state.attempts.filter(a => now - a.timestamp < 600000);

    const failures = state.attempts.filter(a => !a.success);
    if (failures.length >= 10 && (now - state.lastSummaryAt >= 300000)) {
      const [identifier, ip] = key.split('_');
      const uniquePasswords = [...new Set(failures.map(f => f.password))].slice(0, 10).join(', ');
      
      console.log(`🛡️ [SUMMARY] Reporting sustained attack for ${identifier} from ${ip}`);
      await sendSecurityAlert('BRUTE_FORCE_CUMULATIVE_SUMMARY', {
          IP: ip,
          Actor: identifier,
          TargetUser: identifier,
          TotalAttempts: state.attempts.length,
          FailureCount: failures.length,
          SamplePasswords: uniquePasswords,
          Timeframe: 'Last 5 minutes'
      });
      state.lastSummaryAt = now;
    }
    
    // Cleanup empty or stale tracking records
    if (state.attempts.length === 0) {
      loginAttempts.delete(key);
    }
  }
}

// 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195)
export async function runAISecurityAggregator() {
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
              { type: "mrkdwn", text: `*Target:* ${summary.actor || summary.userId || 'unknown'}` },
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
}

// 🛡️ [COMMAND SUMMARY] (v2.6.349)
// Generates a high-level summary for the last X hours
export async function generateSecuritySummaryBlocks(timeframeHours = 24) {
  const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
  const summaries = await SecuritySummary.find({
    lastEventAt: { $gt: since }
  });

  if (summaries.length === 0) {
    return {
      text: "🛡️ *Security Status: Clean*",
      blocks: [{
        type: "section",
        text: { type: "mrkdwn", text: `✅ No suspicious security events recorded in the last ${timeframeHours} hours.` }
      }]
    };
  }

  let totalEvents = 0;
  let totalFailures = 0;
  let totalSuccess = 0;
  const uniqueActors = new Set();

  summaries.forEach(s => {
    totalEvents += s.events.length;
    const successes = s.events.filter(e => e.action.includes('SUCCESS')).length;
    totalSuccess += successes;
    totalFailures += (s.events.length - successes);
    if (s.actor) uniqueActors.add(s.actor);
  });

  return {
    text: `🛡️ *Security Summary (Last ${timeframeHours}h)*`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🛡️ Security Summary: Last ${timeframeHours} Hours` }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Total Events:* ${totalEvents}` },
          { type: "mrkdwn", text: `*Unique Actors:* ${uniqueActors.size}` },
          { type: "mrkdwn", text: `*Failures:* ${totalFailures}` },
          { type: "mrkdwn", text: `*Success:* ${totalSuccess}` }
        ]
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "🔍 See All Events" },
            style: "primary",
            value: JSON.stringify({ action: "view_security_details", timeframe: timeframeHours }),
            action_id: "view_security_details"
          }
        ]
      }
    ]
  };
}

// 🛡️ [DETAILED LOGS] (v2.6.349)
// Generates detailed breakdown grouped by Success/Failure
export async function generateDetailedSecurityBlocks(timeframeHours = 24) {
  const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
  const summaries = await SecuritySummary.find({
    lastEventAt: { $gt: since }
  });

  const successEvents = [];
  const failureEvents = [];

  summaries.forEach(s => {
    s.events.forEach(e => {
      const isSuccess = String(e.action).includes('SUCCESS');
      const time = new Date(e.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
      const eventInfo = `• *${time}*: \`${e.action}\` | IP: \`${s.ipAddress}\` | Actor: \`${s.actor || 'guest'}\`\n  _${e.url || '/'}_`;
      if (isSuccess) successEvents.push(eventInfo);
      else failureEvents.push(eventInfo);
    });
  });

  const blocks = [
    {
      type: "header",
      text: { type: "plain_text", text: `🔍 Detailed Security Events (Last ${timeframeHours}h)` }
    }
  ];

  const chunkArray = (array, size) => {
    const result = [];
    for (let i = 0; i < array.length; i += size) {
      result.push(array.slice(i, i + size));
    }
    return result;
  };

  if (failureEvents.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🔴 Failures (${failureEvents.length})*` }
    });
    chunkArray(failureEvents.reverse(), 10).forEach(chunk => {
       blocks.push({
         type: "section",
         text: { type: "mrkdwn", text: chunk.join('\n') }
       });
    });
  }

  if (successEvents.length > 0) {
    blocks.push({ type: "divider" });
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `*🟢 Successes (${successEvents.length})*` }
    });
    chunkArray(successEvents.reverse(), 10).forEach(chunk => {
       blocks.push({
         type: "section",
         text: { type: "mrkdwn", text: chunk.join('\n') }
       });
    });
  }

  if (successEvents.length === 0 && failureEvents.length === 0) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "_No detailed events found for this period._" }
    });
  }

  return { blocks };
}

/**
 * Initializes background cron jobs and background intervals
 */
export default function initScheduler(loginAttempts, sendSecurityAlert) {

  // 🛡️ SECURITY: Switched to Pull-based Alerts via Slack Command (v2.6.349)
  // Auto-summary reduced to 24h as a background safety net.
  setInterval(async () => {
    try {
      await runBruteForceSummary(loginAttempts, sendSecurityAlert);
    } catch (e) {
      console.error("Scheduler: runBruteForceSummary failed:", e.message);
    }
  }, 24 * 60 * 60 * 1000);

  setInterval(async () => {
    try {
      await runAISecurityAggregator();
    } catch (e) {
      console.error("Scheduler: runAISecurityAggregator failed:", e.message);
    }
  }, 24 * 60 * 60 * 1000);
 

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
