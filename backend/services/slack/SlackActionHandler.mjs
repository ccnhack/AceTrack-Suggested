import { SupportTicket, Player, AppState, SlackFeedback } from '../../models/index.mjs';
import { sendDelayedSlackResponse } from './SlackNotificationService.mjs';
import { runLogAIEphemeral } from './SlackLogService.mjs';

export async function handleAction(req, res, isDelayed = false, logAudit) {
    try {
      const payload = JSON.parse(req.body.payload);
      
      if (payload.type === 'view_submission') {
         if (payload.view.callback_id === 'mfa_pin_modal') {
            const stateValues = payload.view.state.values;
            const submittedPin = stateValues.pin_block.pin_input.value;
            
            // 🛡️ [VAPT-F04] (v2.6.556): Hardcoded PIN removed per security audit
            const ADMIN_MFA_PIN = process.env.ADMIN_MFA_PIN;
            if (!ADMIN_MFA_PIN) {
               return res.json({ response_action: 'errors', errors: { pin_block: 'MFA PIN not configured on server.' } });
            }            if (submittedPin !== ADMIN_MFA_PIN) {
               return res.json({
                  response_action: 'errors',
                  errors: {
                     pin_block: 'Invalid Admin MFA PIN.'
                  }
               });
            }

            // ✅ Dismiss the modal immediately via HTTP response body
            res.json({ response_action: 'clear' });

            // 🔓 [MFA REVEAL FIX] (v2.6.544)
            // view_submission payloads do NOT carry a response_url.
            // Use chat.postEphemeral + response_url fallback to deliver unredacted results.
            try {
               const meta = JSON.parse(payload.view.private_metadata);
               const { query, channelId, userId, responseUrl: storedUrl, intent } = meta;
               console.log('📡 [MFA_REVEAL] Parsed metadata:', { query: query?.substring(0, 30), channelId, userId, hasUrl: !!storedUrl });
               
               runLogAIEphemeral(query, channelId, userId, storedUrl, intent).catch(e => console.error('MFA Reveal Error:', e));
            } catch(e) {
               console.error("MFA View parsing error:", e);
            }
            return;
         } else if (payload.view.callback_id === 'ai_feedback_modal') {
            const stateValues = payload.view.state.values;
            const feedbackText = stateValues.feedback_block.feedback_input.value;
            try {
               const meta = JSON.parse(payload.view.private_metadata);
               await SlackFeedback.create({
                  userId: payload.user?.id,
                  channelId: payload.view.team_id,
                  query: meta.query,
                  responseContext: meta.context,
                  routingIntent: meta.intent,
                  isPositive: false,
                  feedbackText: feedbackText
               });
               console.log(`🤖 [SLACK_FEEDBACK] Negative feedback logged from ${payload.user?.name}`);
               
               if (meta.responseUrl) {
                  await sendDelayedSlackResponse(meta.responseUrl, { 
                     response_type: "ephemeral", 
                     text: "✅ Thanks for your detailed feedback! We will review this to improve the AI.", 
                     replace_original: false 
                  }).catch(e => console.error('Failed to send delayed confirmation:', e.message));
               }
            } catch (e) {
               console.error("Slack Feedback Saving Error:", e);
            }
            return res.json({ 
               response_action: 'update',
               view: {
                  type: 'modal',
                  title: { type: 'plain_text', text: 'Feedback Received' },
                  close: { type: 'plain_text', text: 'Close' },
                  blocks: [
                     {
                        type: 'section',
                        text: { type: 'mrkdwn', text: '✅ *Thanks for your detailed feedback!*\nWe will review this to improve the AI.' }
                     }
                  ]
               }
            });
         }
      }

      const responseUrl = payload.response_url;
      const actionObj = payload.actions?.[0] || {};
      const actionId = actionObj.action_id || actionObj.name;
      
      await logAudit(req, 'SLACK_INTERACT_RECEIVED', [], {
        user: payload.user?.name,
        actionId: actionId,
        triggerId: payload.trigger_id
      });

      console.log(`📡 [SLACK_ACTION] User: ${payload.user?.name} | Action: ${actionId}`);

      // Ignore intermediate datepicker changes before submit
      if (actionId === 'queue_start_date' || actionId === 'queue_end_date') {
         return; 
      }

      if (actionId === 'ai_feedback_up') {
         const btnVal = JSON.parse(actionObj.value || '{}');
         try {
            await SlackFeedback.create({
               userId: payload.user?.id,
               channelId: payload.channel?.id,
               query: btnVal.query,
               responseContext: btnVal.context,
               routingIntent: btnVal.intent,
               isPositive: true
            });
            console.log(`🤖 [SLACK_FEEDBACK] Positive feedback logged from ${payload.user?.name}`);
         } catch (e) {
            console.error("Slack Feedback Saving Error:", e);
         }
         return await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", text: "✅ Thanks for your feedback! This helps improve the AI.", replace_original: false });
      }

      if (actionId === 'ai_feedback_down') {
         const btnVal = JSON.parse(actionObj.value || '{}');
         const modalPayload = {
            trigger_id: payload.trigger_id,
            view: {
               type: "modal",
               callback_id: "ai_feedback_modal",
               private_metadata: JSON.stringify({ query: btnVal.query, context: btnVal.context, intent: btnVal.intent, responseUrl: payload.response_url }),
               title: { type: "plain_text", text: "Provide Feedback" },
               submit: { type: "plain_text", text: "Submit" },
               close: { type: "plain_text", text: "Cancel" },
               blocks: [
                  {
                     type: "input",
                     block_id: "feedback_block",
                     label: { type: "plain_text", text: "What went wrong with this response?" },
                     element: { type: "plain_text_input", action_id: "feedback_input", multiline: true }
                  }
               ]
            }
         };
         try {
            await fetch("https://slack.com/api/views.open", {
               method: "POST",
               headers: { "Authorization": `Bearer ${process.env.SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
               body: JSON.stringify(modalPayload)
            });
         } catch (e) {
            console.error("Failed to open feedback modal", e);
         }
         return res.json({ ok: true });
      }

      // 📊 Handle Queue Date Range Submit (v2.6.435)
      if (actionId === 'queue_range_submit') {
         const stateValues = payload.state?.values?.queue_date_range_block || {};
         const startDateStr = stateValues.queue_start_date?.selected_date;
         const endDateStr = stateValues.queue_end_date?.selected_date;
         
         if (!startDateStr || !endDateStr) {
             return await sendDelayedSlackResponse(responseUrl, {
                 replace_original: false,
                 response_type: "ephemeral",
                 text: "⚠️ Please select both a Start Date and an End Date before generating the report."
             });
         }
         
         const startOfDate = new Date(startDateStr);
         startOfDate.setHours(0, 0, 0, 0);
         const endOfDate = new Date(endDateStr);
         endOfDate.setHours(23, 59, 59, 999);
         
         const { SupportTicket, Player } = await import('../../models/index.mjs');
         
         const query = {
             $or: [
                 { "data.createdAt": { $gte: startOfDate.toISOString(), $lte: endOfDate.toISOString() } },
                 { "data.closedAt": { $gte: startOfDate.toISOString(), $lte: endOfDate.toISOString() } },
                 { "data.resolvedAt": { $gte: startOfDate.toISOString(), $lte: endOfDate.toISOString() } },
                 // Fallback for cases where dates might be stored as Date objects instead of strings (v2.6.462)
                 { "data.closedAt": { $gte: startOfDate, $lte: endOfDate } },
                 { "data.resolvedAt": { $gte: startOfDate, $lte: endOfDate } }
             ]
         };
         
         // 🛡️ [FILTER_FIX] (v2.6.453): Remove the automatic inclusion of all open tickets 
         // when today is selected. This ensures the report strictly respects the chosen range.
         const tickets = await SupportTicket.find(query).lean();
         
         let totalOpen = 0, totalClosed = 0, totalUnassigned = 0;
         const employeeStats = {};
         
         tickets.forEach(doc => {
            const t = doc.data || {};
            const status = String(t.status || 'open').toLowerCase();
            const isOpen = status !== 'resolved' && status !== 'closed';
            
            if (isOpen) totalOpen++;
            else totalClosed++;
            
            if (!t.assignedTo) {
               if (isOpen) totalUnassigned++;
            }
            
            // Track ALL tickets in employee breakdown (including unassigned/closed)
            const agent = t.assignedTo ? t.assignedTo : 'system_unassigned';
            if (!employeeStats[agent]) employeeStats[agent] = { assigned: 0, open: 0, closed: 0 };
            employeeStats[agent].assigned++;
            if (isOpen) employeeStats[agent].open++;
            else employeeStats[agent].closed++;
         });

         // 👤 Resolve Agent IDs to Names
         const agentIds = Object.keys(employeeStats).filter(id => id !== 'system_unassigned');
         const agentProfiles = await Player.find({ id: { $in: agentIds } }).lean();
         const agentMap = {
             'system_unassigned': '🤖 System / Auto-Resolved (Unassigned)'
         };
         
         agentProfiles.forEach(p => {
             const pd = p.data || {};
             const name = pd.firstName && pd.lastName ? `${pd.firstName} ${pd.lastName}` : '';
             agentMap[p.id] = name ? `${name} (${pd.email || p.id})` : (pd.email || p.id);
         });

         const blocks = [
            {
               "type": "header",
               "text": { "type": "plain_text", "text": "🎯 Support Queue Analytics", "emoji": true }
            },
            {
               "type": "context",
               "elements": [
                  { "type": "mrkdwn", "text": `🗓️ *Report Range:* ${startDateStr} to ${endDateStr}  |  🤖 *Generated By:* AceTrack System` }
               ]
            },
            { "type": "divider" },
            {
               "type": "section",
               "fields": [
                  { "type": "mrkdwn", "text": `*🔥 Active / Open:*\n\`${totalOpen}\` tickets` },
                  { "type": "mrkdwn", "text": `*⏳ Unassigned:*\n\`${totalUnassigned}\` tickets` },
                  { "type": "mrkdwn", "text": `*✅ Closed / Resolved:*\n\`${totalClosed}\` tickets` },
                  { "type": "mrkdwn", "text": `*📈 Total Volume:*\n\`${totalOpen + totalClosed}\` tickets` }
               ]
            },
            { "type": "divider" },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "👤 *Agent Performance Breakdown*" }
            }
         ];
         
         if (agentIds.length > 0) {
            let agentText = "";
            for (const [agentId, stats] of Object.entries(employeeStats)) {
               const resolvedName = agentMap[agentId] || agentId;
               agentText += `• *${resolvedName}*\n> \`${stats.open}\` Open  |  \`${stats.closed}\` Closed  |  *${stats.assigned}* Total\n\n`;
            }
            blocks.push({
               "type": "section",
               "text": { "type": "mrkdwn", "text": agentText }
            });
         } else {
            blocks.push({
               "type": "section",
               "text": { "type": "mrkdwn", "text": "_No agent activity recorded for this specific date range._" }
            });
         }
         
         const reply = { replace_original: true, response_type: "ephemeral", blocks };
         if (isDelayed) return await sendDelayedSlackResponse(responseUrl, reply);
         return res.json(reply);
      }

      // Handle the Security Summary Drill-down
      if (actionId === 'view_security_details') {
         let timeframe = 24;
         try {
           const actionData = JSON.parse(actionObj.value || '{}');
           timeframe = actionData.timeframe || 24;
         } catch (e) {}

         // 🔐 [SECURITY ENFORCEMENT]: Generate a short-lived forensic token (v2.6.383)
         const jwt = await import('jsonwebtoken');
         const token = jwt.default.sign(
           { hours: timeframe, user: payload.user?.name, type: 'forensic_export' },
           process.env.JWT_SECRET || 'ace_forensics_legacy',
           { expiresIn: '15m' }
         );

         const downloadUrl = `https://acetrack-suggested.onrender.com/security/export?token=${token}`;
         
         const followUpResponse = {
            replace_original: false,
            response_type: "ephemeral",
            blocks: [
              {
                type: "section",
                text: { type: "mrkdwn", text: `📂 *Forensic Report Ready (Last ${timeframe}h)*\nYour secure audit file has been generated and is ready for download.` }
              },
              {
                type: "actions",
                elements: [
                  {
                    type: "button",
                    text: { type: "plain_text", text: "⬇️ Download JSON Report" },
                    style: "primary",
                    url: downloadUrl,
                    action_id: "download_json_report"
                  }
                ]
              },
              {
                type: "context",
                elements: [
                  { type: "mrkdwn", text: "⚠️ _Security Note: This download link expires in 15 minutes._" }
                ]
              }
            ]
         };
         
         if (isDelayed) {
            // First, acknowledge the click to prevent Slack timeout
            await sendDelayedSlackResponse(responseUrl, { 
              replace_original: false, 
              response_type: "ephemeral", 
              text: "🔄 *Generating secure forensic report...* This may take a few seconds." 
            });
            
            // Then, send the actual button after a tiny delay
            return setTimeout(async () => {
              await sendDelayedSlackResponse(responseUrl, followUpResponse);
            }, 2000);
         }
         return res.json(followUpResponse);
      }

      // Handle Approve/Block
      if (actionId === 'security_action' || actionId === 'approve' || actionId === 'block') {
         let actionData = {};
         try { actionData = JSON.parse(actionObj.value || '{}'); } catch (e) {}
         const { action, target, ip } = actionData;
         const finalAction = action || actionId;

         if (finalAction === 'block') {
            try {
              // 🛡️ [PHASE 2 DECOMPOSITION] (v2.6.620): Direct Player.updateOne() — no AppState dependency
              const targetPlayer = await Player.findOne({
                $or: [
                  { id: String(target).toLowerCase() },
                  { 'data.email': String(target).toLowerCase() }
                ]
              }).lean();

              if (targetPlayer) {
                const now = Date.now();
                await Player.updateOne(
                  { id: targetPlayer.id },
                  { $set: { 
                    "data.loginBlockedUntil": now + (5 * 60 * 1000), 
                    "data.lastForceLogoutAt": now, 
                    lastUpdated: new Date() 
                  }}
                );
                
                // Increment AppState version for sync consistency (read-only backup)
                await AppState.findOneAndUpdate({}, { $inc: { version: 1 }, $set: { lastUpdated: new Date() } });
                
                const blockRes = { replace_original: false, text: `🛑 *LOCKDOWN SUCCESSFUL*: Account *${target}* blocked. (Action by: ${payload.user.name})` };
                if (isDelayed) return await sendDelayedSlackResponse(responseUrl, blockRes);
                return res.json(blockRes);
              }
            } catch (err) {
               console.error('Block operation failed:', err);
            }
         } else if (finalAction === 'approve') {
            const appRes = { replace_original: false, text: `✅ *APPROVED*: Login session authorized by ${payload.user.name}.` };
            if (isDelayed) return await sendDelayedSlackResponse(responseUrl, appRes);
            return res.json(appRes);
         }
      }

      // 🛡️ [CATCH-ALL RESPONDER] (v2.6.383)
      if (actionId === 'reveal_secure_details' || actionId === 'dump_raw_logs') {
         let query = '';
         let sourceUrl = '';
         let intent = null;
         try {
            const parsed = JSON.parse(actionObj.value || '{}');
            query = parsed.query;
            sourceUrl = parsed.url;
            intent = parsed.intent;
         } catch(e) {}

         const targetUrl = responseUrl || sourceUrl;

         if (actionId === 'dump_raw_logs') {
            if (isDelayed) {
               await sendDelayedSlackResponse(targetUrl, { replace_original: false, response_type: "ephemeral", text: "🔄 *Dumping raw logs...*" });
            } else {
               res.status(200).send();
            }
            return dumpRawLogs(query, intent, targetUrl).catch(e => console.error('Dump Raw Error:', e));
         }

         // 🔓 [MFA REVEAL FIX] (v2.6.544)
         // Store channelId + userId + responseUrl in metadata for dual delivery
         const channelId = payload.channel?.id || payload.container?.channel_id;
         const userId = payload.user?.id;
         console.log('📡 [REVEAL_BTN] Captured context:', { channelId, userId, hasTargetUrl: !!targetUrl });
         const freshMeta = JSON.stringify({ query, channelId, userId, responseUrl: targetUrl, intent });
         const slackBotToken = process.env.SLACK_BOT_TOKEN;
         
         if (!slackBotToken) {
            return await sendDelayedSlackResponse(targetUrl, {
               response_type: "ephemeral",
               text: "⚠️ *Configuration Error:* SLACK_BOT_TOKEN is not set on the server. Cannot open MFA modal."
            });
         }

         if (!isDelayed) res.status(200).send();

         try {
            const openRes = await fetch('https://slack.com/api/views.open', {
               method: 'POST',
               headers: {
                  'Authorization': `Bearer ${slackBotToken}`,
                  'Content-Type': 'application/json'
               },
               body: JSON.stringify({
                  trigger_id: payload.trigger_id,
                  view: {
                     type: "modal",
                     callback_id: "mfa_pin_modal",
                     private_metadata: freshMeta,
                     title: { type: "plain_text", text: "Security Verification" },
                     submit: { type: "plain_text", text: "Verify" },
                     close: { type: "plain_text", text: "Cancel" },
                     blocks: [
                        {
                           type: "input",
                           block_id: "pin_block",
                           element: {
                              type: "plain_text_input",
                              action_id: "pin_input",
                              placeholder: { type: "plain_text", text: "Enter Admin PIN" }
                           },
                           label: { type: "plain_text", text: "Admin MFA PIN" }
                        }
                     ]
                  }
               })
            });
            const openJson = await openRes.json();
            if (!openJson.ok) console.error('Slack views.open failed:', openJson.error);
         } catch(e) {
            console.error("Slack views.open error:", e);
         }
         return;
      }
      
      if (!isDelayed) res.status(200).send();
    } catch (err) {
      console.error("❌ Slack interaction failed:", err.message);
    }
  }
