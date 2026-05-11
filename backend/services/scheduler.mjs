import { SecuritySummary } from '../models/index.mjs';

// 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)
export async function runBruteForceSummary(loginAttempts, sendSecurityAlert) {
  const now = Date.now();
  for (const [key, state] of loginAttempts.entries()) {
    state.attempts = state.attempts.filter(a => now - a.timestamp < 600000);
    const failures = state.attempts.filter(a => !a.success);
    if (failures.length >= 10 && (now - state.lastSummaryAt >= 300000)) {
      const [identifier, ip] = key.split('_');
      const uniquePasswords = [...new Set(failures.map(f => f.password))].slice(0, 10).join(', ');
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
    if (state.attempts.length === 0) loginAttempts.delete(key);
  }
}

// 🛡️ SECURITY: AI Aggregator Background Task (v2.6.195)
export async function runAISecurityAggregator() {
  try {
    const pendingSummaries = await SecuritySummary.find({
      isSummarized: false,
      lastEventAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) }
    });
    for (const summary of pendingSummaries) {
      const hasEnoughEvents = summary.events.length >= 5;
      const isIdle = (Date.now() - summary.lastEventAt.getTime() > 30 * 60 * 1000);
      if (!hasEnoughEvents && !isIdle) continue;
      
      const successCount = summary.events.filter(e => e.action.includes('SUCCESS')).length;
      const failureCount = summary.events.length - successCount;
      const payload = {
        text: `🤖 *AI Security Aggregator*`,
        blocks: [
          { type: "header", text: { type: "plain_text", text: `🛡️ Security Summary Update` } },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Target:* ${summary.actor || 'unknown'}` },
              { type: "mrkdwn", text: `*Events:* ${summary.events.length}` },
              { type: "mrkdwn", text: `*Failures:* ${failureCount}` },
              { type: "mrkdwn", text: `*Success:* ${successCount}` }
            ]
          }
        ]
      };
      const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;
      if (SECURITY_WEBHOOK_URL) {
        await fetch(SECURITY_WEBHOOK_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      summary.lastAlertedAt = new Date();
      if (isIdle) summary.isSummarized = true;
      await summary.save();
    }
  } catch (err) { console.error("AI Aggregator Error:", err.message); }
}

// 🛡️ [COMMAND SUMMARY] (v2.6.349)
export async function generateSecuritySummaryBlocks(timeframeHours = 24) {
  const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
  const summaries = await SecuritySummary.find({ lastEventAt: { $gt: since } });

  if (summaries.length === 0) {
    return {
      text: "🛡️ *Security Status: Clean*",
      blocks: [{ type: "section", text: { type: "mrkdwn", text: `✅ No suspicious security events recorded in the last ${timeframeHours} hours.` } }]
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
      { type: "header", text: { type: "plain_text", text: `🛡️ Security Summary: Last ${timeframeHours} Hours` } },
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
            text: { type: "plain_text", text: "🔍 See All Events (JSON)" },
            style: "primary",
            value: JSON.stringify({ action: "view_security_details", timeframe: timeframeHours }),
            action_id: "view_security_details"
          }
        ]
      }
    ]
  };
}

// 🛡️ [DETAILED LOGS - JSON FORMAT] (v2.6.354)
export async function generateDetailedSecurityBlocks(timeframeHours = 24) {
  const since = new Date(Date.now() - timeframeHours * 60 * 60 * 1000);
  const summaries = await SecuritySummary.find({ lastEventAt: { $gt: since } }).lean();

  const rawData = {
    generatedAt: new Date().toISOString(),
    timeframe: `${timeframeHours}h`,
    summary: {
      totalActors: summaries.length,
      totalEvents: summaries.reduce((acc, s) => acc + s.events.length, 0)
    },
    events: summaries.map(s => ({
      ip: s.ipAddress,
      actor: s.actor || s.userId,
      eventCount: s.events.length,
      history: s.events.map(e => ({
        timestamp: e.timestamp,
        action: e.action,
        url: e.url,
        method: e.method,
        outcome: String(e.action).includes('SUCCESS') ? 'SUCCESS' : 'FAILED'
      }))
    }))
  };

  const jsonString = JSON.stringify(rawData, null, 2);
  const truncatedJson = jsonString.length > 2900 
    ? jsonString.substring(0, 2900) + "\n\n... (Truncated for Slack limits. Full logs in Admin Hub)" 
    : jsonString;

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `🔍 Raw Security Audit (Last ${timeframeHours}h)` }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: "Here is the raw event log grouped by actor and IP address:" }
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `\`\`\`${truncatedJson}\`\`\`` }
      },
      {
        type: "context",
        elements: [
          { type: "mrkdwn", text: "💡 _Full raw logs are preserved in the `AuditLog` collection for forensics._" }
        ]
      }
    ]
  };
}

export default function initScheduler(loginAttempts, sendSecurityAlert) {
  setInterval(async () => {
    try { await runBruteForceSummary(loginAttempts, sendSecurityAlert); } catch (e) {}
  }, 24 * 60 * 60 * 1000);

  setInterval(async () => {
    try { await runAISecurityAggregator(); } catch (e) {}
  }, 24 * 60 * 60 * 1000);

  setInterval(async () => {
    try {
      const { Matchmaking, ChatbotThread } = await import('../models/index.mjs');
      const matchmakingPruneDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await Matchmaking.deleteMany({ lastUpdated: { $lt: matchmakingPruneDate } });
      const chatbotPruneDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await ChatbotThread.deleteMany({ lastUpdated: { $lt: chatbotPruneDate } });
    } catch (err) {}
  }, 24 * 60 * 60 * 1000);

  console.log('🕒 Scheduler initialized (v2.6.354)');
}
