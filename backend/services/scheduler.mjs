import { SecuritySummary } from '../models/index.mjs';

// 🛡️ [CUMULATIVE SECURITY SUMMARY] (v2.6.208)
export async function runBruteForceSummary(loginAttempts, sendSecurityAlert) {
  const now = Date.now();
  for (const [key, state] of loginAttempts.entries()) {
    state.attempts = state.attempts.filter(a => now - a.timestamp < 600000);
    const failures = state.attempts.filter(a => !a.success);
    if (failures.length >= 10 && (now - state.lastSummaryAt >= 300000)) {
      const [identifier, ip] = key.split('_');
      // 🛡️ [CREDENTIAL_PURGE] (v2.6.620): Replaced plaintext SamplePasswords with count.
      // Even failed passwords could be typos of real ones — never log them.
      const uniquePasswordCount = new Set(failures.map(f => f.password)).size;
      await sendSecurityAlert('BRUTE_FORCE_CUMULATIVE_SUMMARY', {
          IP: ip,
          Actor: identifier,
          TargetUser: identifier,
          TotalAttempts: state.attempts.length,
          FailureCount: failures.length,
          UniquePasswordsTried: uniquePasswordCount,
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
        const https = await import('https');
        const url = new URL(SECURITY_WEBHOOK_URL);
        const options = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        };
        const req = https.request(options);
        req.write(JSON.stringify(payload));
        req.end();
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

// 🛡️ [DETAILED LOGS - JSON FORMAT] (v2.6.383)
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

// 📧 [CHAT REMINDER SERVICE] (v2.6.383)
export async function processUnseenMessageReminders() {
  try {
    const { OrgMessage, Player } = await import('../models/index.mjs');
    const nodemailer = await import('nodemailer');

    // 1. Find unseen messages older than 24 hours that haven't had a reminder sent
    const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const unseenMessages = await OrgMessage.find({
      status: 'sent',
      reminderSentAt: null,
      timestamp: { $lt: staleThreshold }
    }).lean();

    if (!unseenMessages || unseenMessages.length === 0) return;

    // 2. Group by Receiver
    const groups = {};
    unseenMessages.forEach(msg => {
      if (!groups[msg.receiverId]) groups[msg.receiverId] = [];
      groups[msg.receiverId].push(msg);
    });

    // 3. Process each group
    for (const [receiverId, messages] of Object.entries(groups)) {
      const playerDoc = await Player.findOne({ id: String(receiverId) }).lean();
      const recipientEmail = playerDoc?.data?.email;
      
      if (!recipientEmail) continue;

      const uniqueSenders = [...new Set(messages.map(m => m.senderName))].join(', ');
      const portalUrl = 'https://acetrack-suggested.onrender.com';

      const transporter = nodemailer.default.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.EMAIL_USER || 'notifications@acetrack.com',
          pass: process.env.EMAIL_PASS
        }
      });

      const mailOptions = {
        from: `"AceTrack Chat" <${process.env.EMAIL_USER || 'notifications@acetrack.com'}>`,
        to: recipientEmail,
        subject: `📫 You have new messages from ${uniqueSenders}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
            <h2 style="color: #2D3FE0;">AceTrack Messenger</h2>
            <p>Hi <b>${playerDoc.data.name || receiverId}</b>,</p>
            <p>You have unread messages in the AceTrack portal that have been waiting for over 24 hours.</p>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p style="margin: 0;"><b>New messages from:</b> ${uniqueSenders}</p>
            </div>
            <p>Stay connected with your team and respond to your colleagues by logging into the portal below:</p>
            <a href="${portalUrl}" style="display: inline-block; padding: 12px 25px; background-color: #2D3FE0; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin-top: 10px;">Login to AceTrack</a>
            <p style="font-size: 12px; color: #888; margin-top: 30px;">
              This is an automated reminder from the AceTrack security and communication suite.
            </p>
          </div>
        `
      };

      try {
        await transporter.sendMail(mailOptions);
        console.log(`📧 [REMINDER_SENT] to ${recipientEmail} for messages from ${uniqueSenders}`);
        
        // Mark these messages as reminded
        const msgIds = messages.map(m => m._id);
        await OrgMessage.updateMany({ _id: { $in: msgIds } }, { $set: { reminderSentAt: new Date() } });
      } catch (err) {
        console.error(`❌ [MAIL_ERROR] Failed to send reminder to ${recipientEmail}:`, err.message);
      }
    }
  } catch (err) { console.error("Chat Reminder Service Error:", err.message); }
}

export default function initScheduler(loginAttempts, sendSecurityAlert) {
  // 🛡️ [OBSERVABILITY] (v2.6.620): Track last successful run for each job
  const jobHealth = { chatWatchdog: null, securityDaily: null, aiAggregator: null, dataPurge: null, attachmentCleanup: null };

  // 🕒 [CHAT_WATCHDOG] (v2.6.383): Run hourly
  setInterval(async () => {
    try {
      await processUnseenMessageReminders();
      jobHealth.chatWatchdog = new Date().toISOString();
    } catch (e) {
      console.error('❌ [SCHEDULER] Chat Watchdog failed:', e.message);
    }
  }, 60 * 60 * 1000);

  // 🛡️ [SECURITY_DAILY]
  setInterval(async () => {
    try {
      await runBruteForceSummary(loginAttempts, sendSecurityAlert);
      jobHealth.securityDaily = new Date().toISOString();
    } catch (e) {
      console.error('❌ [SCHEDULER] Security Daily failed:', e.message);
    }
  }, 24 * 60 * 60 * 1000);

  // 🤖 [AI_AGGREGATOR]
  setInterval(async () => {
    try {
      await runAISecurityAggregator();
      jobHealth.aiAggregator = new Date().toISOString();
    } catch (e) {
      console.error('❌ [SCHEDULER] AI Aggregator failed:', e.message);
    }
  }, 24 * 60 * 60 * 1000);

  // 🧹 [DATA_PURGE]
  setInterval(async () => {
    try {
      const { Matchmaking, ChatbotThread } = await import('../models/index.mjs');
      const matchmakingPruneDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await Matchmaking.deleteMany({ lastUpdated: { $lt: matchmakingPruneDate } });
      const chatbotPruneDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      await ChatbotThread.deleteMany({ lastUpdated: { $lt: chatbotPruneDate } });
      jobHealth.dataPurge = new Date().toISOString();
    } catch (e) {
      console.error('❌ [SCHEDULER] Data Purge failed:', e.message);
    }
  }, 24 * 60 * 60 * 1000);

  // 📎 [ATTACHMENT_CLEANUP] (v2.6.395): Daily purge of expired chat attachments
  setInterval(async () => {
    try {
      const { v2: cloudinary } = await import('cloudinary');
      const { OrgMessage } = await import('../models/CommsModels.mjs');
      const now = new Date();

      // Find messages with expired attachments
      const expiredMsgs = await OrgMessage.find({
        'attachments.expiresAt': { $lt: now },
        'attachments.0': { $exists: true }
      });

      let deletedCount = 0;
      for (const msg of expiredMsgs) {
        const expired = msg.attachments.filter(a => new Date(a.expiresAt) < now);
        for (const att of expired) {
          try {
            const isImage = att.mimeType?.startsWith('image/');
            await cloudinary.uploader.destroy(att.publicId, { resource_type: isImage ? 'image' : 'raw' });
            deletedCount++;
          } catch (e) {
            console.warn(`⚠️ [CLEANUP] Failed to delete ${att.publicId}:`, e.message);
          }
        }
        // Remove expired attachments from the message
        msg.attachments = msg.attachments.filter(a => new Date(a.expiresAt) >= now);
        msg.markModified('attachments');
        await msg.save();
      }

      if (deletedCount > 0) {
        console.log(`📎 [CLEANUP] Purged ${deletedCount} expired chat attachments from ${expiredMsgs.length} messages`);
      }
    } catch (err) {
      console.error('❌ [CLEANUP] Attachment purge failed:', err.message);
    }
  }, 24 * 60 * 60 * 1000);

  console.log('🕒 Scheduler initialized (v2.6.395)');
}
