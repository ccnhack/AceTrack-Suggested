/**
 * 🛡️ SECURITY ALERT SERVICE
 * Extracted from server.mjs (Monolithic Refactoring Phase 1)
 * 
 * Handles:
 * - Slack webhook security alerts
 * - Email fallback alerts
 * - IP reputation lookups (AbuseIPDB)
 * - Internal reputation checks
 * - AI-powered security summaries
 */
import { AuditLog, SecuritySummary } from '../models/index.mjs';
import { fetchWithAIFallback } from '../utils/aiRouter.mjs';
import { sendSecurityAlertEmail } from '../emailService.mjs';

// ═══════════════════════════════════════════════════════════════
// 🛡️ SECURITY: Reputation & OSINT Helpers (v2.6.192)
// ═══════════════════════════════════════════════════════════════

/**
 * Checks if an IP has a record of successful authentication in the last 24 hours.
 */
export const checkInternalReputation = async (ip) => {
  try {
    const recentSuccess = await AuditLog.findOne({
      ipAddress: ip,
      action: { $in: ['SUPPORT_LOGIN_SUCCESS', 'ADMIN_LOGIN_SUCCESS', 'LOGIN_SUCCESS'] },
      timestamp: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).lean();
    return !!recentSuccess;
  } catch (e) {
    return false;
  }
};

/**
 * Queries AbuseIPDB for real-time reputation scoring.
 */
export const getIPReputation = async (ip) => {
  const apiKey = process.env.ABUSEIPDB_API_KEY;
  if (!apiKey) return { score: 'N/A', provider: 'AbuseIPDB (Missing Key)' };
  
  try {
    const response = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${ip}&maxAgeInDays=90`, {
      headers: { 'Key': apiKey, 'Accept': 'application/json' }
    });
    const result = await response.json();
    return {
      score: result?.data?.abuseConfidenceScore ?? 0,
      country: result?.data?.countryCode || '??',
      usage: result?.data?.usageType || 'unknown',
      provider: 'AbuseIPDB'
    };
  } catch (e) {
    return { score: 'ERR', provider: 'AbuseIPDB' };
  }
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ SECURITY: AI Summary Helper (v2.6.194)
// ═══════════════════════════════════════════════════════════════

export const generateSecuritySummary = async (events) => {
  const apiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
  if (!apiKey) return "AI Summary unavailable: GROQ_API_KEY is not set.";

  try {
    const eventSummary = events.map(e => `${e.timestamp.toISOString()}: ${e.action} on ${e.url} (${e.method})`).join('\n');
    const prompt = `You are a cybersecurity expert. Summarize the following security events detected on the AceTrack platform in the last 30 minutes. 
Identify patterns (brute force, enumeration, lateral movement), assess risk level, and suggest 2 technical actions.
Keep it professional and concise.
Events:\n${eventSummary.substring(0, 3000)}`;

    const response = await fetchWithAIFallback({
      messages: [{ role: 'user', content: prompt }],
      apiKey,
      temperature: 0.5,
      max_tokens: 800
    });
    
    const result = await response.json();
    return result?.choices?.[0]?.message?.content || "AI failed to generate a summary.";
  } catch (err) {
    return `AI Summary Error: ${err.message}`;
  }
};

// ═══════════════════════════════════════════════════════════════
// 🛡️ SECURITY: Real-time Alerting (v2.6.191)
// ═══════════════════════════════════════════════════════════════

/**
 * Creates the security alert sender function.
 * Requires SECURITY_WEBHOOK_URL from environment.
 */
export function createSecurityAlertSender() {
  const SECURITY_WEBHOOK_URL = process.env.SECURITY_WEBHOOK_URL;

  return async (event, data) => {
    let webhookSuccess = false;

    // 1. Slack Webhook Alert (Primary Channel)
    if (SECURITY_WEBHOOK_URL) {
      try {
        const osint = data.OSINT || {};
        const score = typeof osint.score === 'number' ? osint.score : 0;
        const color = score > 75 ? "#EF4444" : (score > 25 ? "#F59E0B" : "#10B981");

        const payload = {
          text: `🚨 *SECURITY ALERT: ${event}*`,
          attachments: [{
            color: color,
            fallback: `Security Alert: ${event} from ${data.IP}`,
            fields: [
              { title: "Event", value: event, short: false },
              { title: "Source IP", value: `\`${data.IP}\` (${osint.country || '??'})`, short: false },
              { title: "Actor", value: data.Actor, short: false },
              { title: "Abuse Confidence", value: `${score}%`, short: false },
              { title: "Method", value: data.Method, short: false },
              { title: "URL", value: `\`${data.URL}\``, short: false },
              { title: "User-Agent", value: data['User-Agent'], short: false },
              { title: "Payload Snippet", value: `\`\`\`${String(data.Payload).substring(0, 500)}\`\`\``, short: false }
            ],
            footer: "Zero-Trust Guard v2.6.208",
            ts: Math.floor(Date.now() / 1000)
          }]
        };

        // 🤖 [AI EVENT INSIGHT] (v2.6.309)
        const activeApiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
        if (activeApiKey) {
          try {
            let contextualHint = "";
            if (event === 'UNAUTHORIZED_ACCESS_BLOCKED') {
              contextualHint = " Note: This specific event indicates the requester did not provide a valid, active JWT session token or cryptographic proof of identity.";
            }
            const prompt = `As a cybersecurity expert, provide a concise 1-2 sentence explanation of why this security event was triggered and its potential implications.${contextualHint} Event: ${event}, IP: ${data.IP}, URL: ${data.URL}, Method: ${data.Method}, Actor: ${data.Actor}.`;
            const aiResponse = await fetchWithAIFallback({
              messages: [{ role: 'user', content: prompt }],
              apiKey: activeApiKey,
              temperature: 0.3,
              max_tokens: 150
            });
            const result = await aiResponse.json();
            if (result?.choices?.[0]?.message?.content) {
              payload.attachments[0].fields.push({ title: "🤖 AI Event Summary", value: result.choices[0].message.content, short: false });
            }
          } catch (e) {
            // Fail silently, don't block alert
          }
        }

        // 🛡️ [BRUTE FORCE ENRICHMENT] (v2.6.202)
        if (data.TargetUser) {
          payload.attachments[0].fields.push({ title: "Target User", value: data.TargetUser, short: true });
        }
        if (data.Passwords) {
          payload.attachments[0].fields.push({ title: "History", value: `\`${data.Passwords}\``, short: false });
        }
        if (data.FinalOutcome) {
          let outcomeValue = `*${data.FinalOutcome}*`;
          // 🛡️ [VISUAL HARDENING] (v2.6.212)
          if (data.FinalOutcome.includes('SUCCESS') && data.FinalOutcome.includes('ALERT')) {
            outcomeValue = `🟢 *SUCCESS* 🔴 *(ALERT: Potential Unauthorized Access)*`;
            payload.attachments[0].color = "#EF4444";
            
            // 🛡️ [INTERACTIVE LOCKDOWN] (v2.6.212)
            payload.attachments[0].actions = [
              {
                name: "security_action",
                text: "Approve Login",
                type: "button",
                style: "primary",
                value: JSON.stringify({ action: "approve", target: data.TargetUser, ip: data.IP })
              },
              {
                name: "security_action",
                text: "BLOCK ACCOUNT",
                type: "button",
                style: "danger",
                confirm: {
                  title: "Confirm Admin Lockdown?",
                  text: "This will force-logout all sessions and block Admin login for 5 minutes.",
                  ok_text: "Yes, Block Account",
                  dismiss_text: "Cancel"
                },
                value: JSON.stringify({ action: "block", target: data.TargetUser, ip: data.IP })
              }
            ];
          }
          payload.attachments[0].fields.push({ title: "Final Outcome", value: outcomeValue, short: true });
        }

        // 🌩️ [CUMULATIVE SUMMARY ENRICHMENT] (v2.6.208)
        if (event === 'BRUTE_FORCE_CUMULATIVE_SUMMARY') {
          payload.text = `🌩️ *SECURITY SUMMARY: SUSTAINED ATTACK DETECTED*`;
          payload.attachments[0].color = "#FF9800";
          payload.attachments[0].fields = [
            { title: "Target Account", value: data.TargetUser, short: true },
            { title: "Source IP", value: `\`${data.IP}\``, short: true },
            { title: "Total Attempts", value: String(data.TotalAttempts), short: true },
            { title: "Failures (5m)", value: String(data.FailureCount), short: true },
            // 🛡️ [CREDENTIAL_PURGE] (v2.6.620): Show count instead of actual passwords
            { title: "Unique Passwords Tried", value: String(data.UniquePasswordsTried || 'N/A'), short: true },
            { title: "Status", value: "⚠️ Throttling Active", short: true }
          ];
        }

        const res = await fetch(SECURITY_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          webhookSuccess = true;
          console.log(`📡 [ALERT] Security event broadcast to Slack: ${event}`);
        }
      } catch (err) {
        console.error("❌ Slack Alert Failed:", err.message);
      }
    }

    // 2. Email Alert (Fallback Channel)
    if (!webhookSuccess) {
      try {
        await sendSecurityAlertEmail(event, data);
      } catch (err) {
        // Silent fail to ensure main thread stability
      }
    }
  };
}
