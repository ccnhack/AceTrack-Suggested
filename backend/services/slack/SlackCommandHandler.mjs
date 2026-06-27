import { SupportTicket, Player, AuditLog } from '../../models/index.mjs';
import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';
import { sendDelayedSlackResponse } from './SlackNotificationService.mjs';
import { runLogAI, runQueryAI } from './SlackLogService.mjs';
import { generateSecuritySummaryBlocks } from '../../services/scheduler.mjs';

export async function handleCommand(req, res, logAudit) {
    const { command, text, response_url } = req.body;
      console.log("SLACK_DEBUG req.body:", req.body);
      await logAudit(req, 'SLACK_DEBUG_COMMAND', [], { command, text, rawBodyHasKeys: Object.keys(req.body || {}) });
      if (command === '/acetrack' && String(text).trim().toLowerCase() === 'security') {
        const { generateSecuritySummaryBlocks } = await import('../../services/scheduler.mjs');
        const summary = await generateSecuritySummaryBlocks(24);
         await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", replace_original: true, ...summary });
      } else if (command === '/acetrack' && String(text).trim().toLowerCase() === 'queue') {
         const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
         
         const blocks = [
            {
               "type": "header",
               "text": { "type": "plain_text", "text": "🎯 Support Dashboard Initialization", "emoji": true }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "Please select a date range and click *Generate Report* to view the Analytics & Workload:" }
            },
            {
               "type": "actions",
               "block_id": "queue_date_range_block",
               "elements": [
                  {
                     "type": "datepicker",
                     "initial_date": today,
                     "placeholder": { "type": "plain_text", "text": "Start Date", "emoji": true },
                     "action_id": "queue_start_date"
                  },
                  {
                     "type": "datepicker",
                     "initial_date": today,
                     "placeholder": { "type": "plain_text", "text": "End Date", "emoji": true },
                     "action_id": "queue_end_date"
                  },
                  {
                     "type": "button",
                     "text": { "type": "plain_text", "text": "Generate Report 🚀", "emoji": true },
                     "style": "primary",
                     "value": "submit",
                     "action_id": "queue_range_submit"
                  }
               ]
            }
         ];
         
         await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", replace_original: true, blocks });
      } else if (command === '/acetrack' && String(text).trim().toLowerCase().startsWith('ticket ')) {
         const ticketId = String(text).trim().split(' ')[1];
         if (!ticketId) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: "Please provide a valid ticket ID. Usage: `/acetrack ticket 123456`" });
         }
         
         const { SupportTicket, Player } = await import('../../models/index.mjs');
         const ticket = await SupportTicket.findOne({ id: String(ticketId) }).lean();
         
         if (!ticket) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: `⚠️ Support Ticket *${ticketId}* not found in the database.` });
         }
         
         const tData = ticket.data || {};
         const userId = tData.userId || 'Unknown';
         const statusRaw = String(tData.status || 'open');
         const status = statusRaw.toLowerCase();
         const createdAt = tData.createdAt || tData.timestamp || ticket.lastUpdated;
         const issueDesc = tData.description || tData.issue || tData.message || 'No description provided';
         const assignedTo = tData.assignedTo;
         
         // Fetch user details
         const user = await Player.findOne({ id: userId }).lean();
         const uData = user?.data || {};
         const userName = uData.firstName ? `${uData.firstName} ${uData.lastName || ''}` : uData.email || userId;
         const userPhone = uData.phoneNumber || uData.phone || 'Not provided';
         
         // Fetch assigned agent details
         let agentName = "Unassigned";
         if (assignedTo) {
             const agent = await Player.findOne({ id: assignedTo }).lean();
             const aData = agent?.data || {};
             agentName = aData.firstName ? `${aData.firstName} ${aData.lastName || ''} (${aData.email})` : (aData.email || assignedTo);
         }
         
         // AI Summary Generation
         let summary = "Generating AI summary...";
         const apiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
         
         if (apiKey) {
            try {
               let chatHistory = "No conversation history found.";
               if (tData.messages && Array.isArray(tData.messages)) {
                   chatHistory = tData.messages.map(m => `[${m.senderId || m.sender || 'User'}]: ${m.text || m.content || m.message || ''}`).join('\n');
               } else if (ticket.messages && Array.isArray(ticket.messages)) {
                   chatHistory = ticket.messages.map(m => `[${m.senderId || m.sender || 'User'}]: ${m.text || m.content || m.message || ''}`).join('\n');
               }
               
               const prompt = `You are a Customer Support AI Assistant. Summarize the support ticket below. 
You MUST format your response EXACTLY like this (use standard bullet points, and ensure EVERY bullet point is on a NEW LINE, do not include any extra text or pleasantries):

• [Bullet point 1 summarizing the core issue]
• [Bullet point 2 summarizing the conversation history]
• [Bullet point 3 summarizing the current state, mentioning that it is ${statusRaw.toUpperCase()}]

*Next Step:* [1 clear, highly actionable next step for the support agent]

Ticket Description: ${issueDesc}
Ticket Status: ${statusRaw.toUpperCase()}
Chat History:
${chatHistory.substring(0, 3000)}`;

               const aiReq = await fetchWithAIFallback({
                   model: "llama-3.3-70b-versatile",
                   messages: [{ role: 'user', content: prompt }],
                   temperature: 0.3,
                   max_tokens: 300,
                   apiKey
               });
               
               if (aiReq.ok) {
                  const aiJson = await aiReq.json();
                  let rawContent = aiJson.choices?.[0]?.message?.content || "AI returned empty response.";
                  
                  // Force a newline before every bullet point if the AI missed it
                  summary = rawContent.replace(/(?<!\n)(•|-)/g, '\n$1').trim();
               } else {
                  let errorBody = await aiReq.text();
                  try { 
                     const p = JSON.parse(errorBody);
                     if (p.error && p.error.message) errorBody = p.error.message;
                  } catch(e){}
                  summary = `_AI Error (${aiReq.status}): ${aiReq.statusText || 'Request Failed'} - ${errorBody}_`;
               }
            } catch (e) {
               summary = `_AI Generation Failed: ${e.message}_`;
            }
         } else {
            summary = "_AI Summary unavailable: GROQ_API_KEY is not set on the backend._";
         }
         
         const ticketFields = [
            { "type": "mrkdwn", "text": `*Raised By:*\n${userName}` },
            { "type": "mrkdwn", "text": `*Contact Number:*\n${userPhone}` },
            { "type": "mrkdwn", "text": `*Assigned To:*\n${agentName}` },
            { "type": "mrkdwn", "text": `*Status:*\n\`${statusRaw.toUpperCase()}\`` },
            { "type": "mrkdwn", "text": `*Opened On:*\n${new Date(createdAt).toLocaleString()}` }
         ];

         if (status === 'closed' || status === 'resolved') {
            const closedAt = tData.closedAt || tData.resolvedAt || ticket.lastUpdated;
            ticketFields.push({ "type": "mrkdwn", "text": `*Closed On:*\n${new Date(closedAt).toLocaleString()}` });
         }
         
         const blocks = [
            {
               "type": "header",
               "text": { "type": "plain_text", "text": `🎫 Ticket #${ticketId}`, "emoji": true }
            },
            {
               "type": "section",
               "fields": ticketFields
            },
            { "type": "divider" },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": `*Issue Description:*\n> ${issueDesc}` }
            },
            { "type": "divider" },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": `*🤖 AI Conversation Summary & Next Steps:*\n${summary}` }
            },
            { "type": "context", "elements": [ { "type": "mrkdwn", "text": `*<!date^${expTs}^⏳ Expiring at {time}|⏳ Expiring in 30 mins>*` } ] },
            { "type": "actions", "elements": [ 
               { "type": "button", "text": { "type": "plain_text", "text": "🔗 View Ticket", "emoji": true }, "url": ticketLink, "action_id": "view_ticket" },
               { "type": "button", "text": { "type": "plain_text", "text": "👍", "emoji": true }, "value": JSON.stringify({ action: "up", context: "ticket", query: ticketId, intent: null }), "action_id": "ai_feedback_up" },
               { "type": "button", "text": { "type": "plain_text", "text": "👎", "emoji": true }, "value": JSON.stringify({ action: "down", context: "ticket", query: ticketId, intent: null }), "action_id": "ai_feedback_down" }
            ] }
         ];
         
         await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", blocks });
      } else if (command === '/acetrack' && String(text).trim().toLowerCase() === 'help') {
         const blocks = [
            {
               "type": "header",
               "text": { "type": "plain_text", "text": "🛠️ AceTrack Slash Commands", "emoji": true }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack security`*\nGenerates a security summary report for the last 24 hours." }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack queue`*\nOpens the Support Dashboard to view ticket analytics over a date range." }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack ticket <id>`*\nFetches details and an AI summary of a specific support ticket.\n_Example: `/acetrack ticket 123456`_" }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack logs <query>`*\nUses AI to search and summarize system logs (MongoDB & Filesystem) based on natural language.\n_Example: `/acetrack logs were there any critical server panics today?`_" }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack query <json>`*\nExecutes a raw JSON MongoDB query directly against the AuditLog collection.\n_Example: `/acetrack query {\"action\": \"UNAUTHORIZED_ACCESS_BLOCKED\"}`_" }
            },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": "*`/acetrack users [role]`*\nFetches a formatted list of users from the Player database. Optional roles: `support`, `coach`, `academy`, `regular`, `all`.\n_Example: `/acetrack users all`_" }
            }
         ];
         return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", replace_original: true, blocks });
      } else if (command === '/acetrack' && String(text).trim().toLowerCase().startsWith('logs ')) {
         const userQuery = String(text).trim().substring(5).trim();
         if (!userQuery) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: "Please provide a query. Usage: `/acetrack logs was there any recent password change activity`" });
         }

         await runLogAI(userQuery, response_url, false);
      } else if (command === '/acetrack' && String(text).trim().toLowerCase().startsWith('query ')) {
         const userQuery = String(text).trim().substring(6).trim();
         if (!userQuery) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: "Please provide a valid JSON query. Usage: `/acetrack query {\"action\":\"LOGIN\"}`" });
         }

         let queryObj;
         try {
            queryObj = JSON.parse(userQuery);
            if (queryObj && typeof queryObj === 'object' && queryObj.mongoFilter) {
               queryObj = queryObj.mongoFilter;
            }
         } catch (e) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: `⚠️ *Invalid JSON:* ${e.message}` });
         }

         const { AuditLog } = await import('../../models/index.mjs');
         let mongoLogs = [];
         try {
            mongoLogs = await AuditLog.find(sanitizeMongoFilter(queryObj)).sort({ timestamp: -1 }).limit(50).lean();
         } catch (e) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: `⚠️ *MongoDB Error:* ${e.message}` });
         }

         if (mongoLogs.length === 0) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: `🔍 *Query:* \`${userQuery}\`\n\n*Result:* No logs found.` });
         }
         // Pass raw results through AI for a clean summary
         await runQueryAI(userQuery, mongoLogs, response_url);
      } else if (command === '/acetrack' && String(text).trim().toLowerCase().startsWith('users')) {
         const args = String(text).trim().toLowerCase().split(' ').slice(1);
         const roleFilter = args.length > 0 && args[0] !== '' ? args[0] : 'all';

         const { Player } = await import('../../models/index.mjs');
         
         let filter = { id: { $ne: 'admin' } };
         if (roleFilter === 'support') {
            filter['data.role'] = 'support';
         } else if (roleFilter === 'coaches' || roleFilter === 'coach') {
            filter['data.role'] = 'coach';
         } else if (roleFilter === 'academies' || roleFilter === 'academy') {
            filter['data.role'] = 'academy';
         } else if (roleFilter === 'regular' || roleFilter === 'user' || roleFilter === 'users') {
            filter['data.role'] = { $in: ['user', null, undefined] };
         } else if (roleFilter !== 'all') {
            return await sendDelayedSlackResponse(response_url, { 
               response_type: "ephemeral", 
               text: `⚠️ *Invalid Role:* '${roleFilter}'. Supported roles are: \`support\`, \`coach\`, \`academy\`, \`regular\`, \`all\`.` 
            });
         }

         let players = [];
         try {
            players = await Player.find(filter).lean();
         } catch (e) {
            return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", text: `⚠️ *Database Error:* ${e.message}` });
         }

         let blocks = [];
         
         const createSections = (title, userList) => {
             if (userList.length === 0) return [];
             let sections = [];
             let currentText = `*${title}*\n`;
             
             for (const p of userList) {
                 const data = p.data || {};
                 const line = `${data.name || 'N/A'} (${p.id}) -\n\n${data.email || 'N/A'}\n`;
                 // Slack limits text block to 3000 chars. Split safely.
                 if (currentText.length + line.length > 2900) {
                     sections.push({ type: "section", text: { type: "mrkdwn", text: currentText } });
                     currentText = line;
                 } else {
                     currentText += line;
                 }
             }
             if (currentText.trim() !== '') {
                 sections.push({ type: "section", text: { type: "mrkdwn", text: currentText } });
             }
             return sections;
         };

         blocks.push({ type: "header", text: { type: "plain_text", text: `👥 AceTrack Users List${roleFilter !== 'all' ? ` (${roleFilter.toUpperCase()})` : ''}`, emoji: true } });

         if (roleFilter === 'all') {
            const regular = players.filter(p => !p.data?.role || p.data.role === 'user');
            const academies = players.filter(p => p.data?.role === 'academy');
            const coaches = players.filter(p => p.data?.role === 'coach');
            const support = players.filter(p => p.data?.role === 'support');

            blocks.push(...createSections('Regular Users', regular));
            blocks.push(...createSections('Academies', academies));
            blocks.push(...createSections('Coaches', coaches));
            blocks.push(...createSections('Support Staff', support));
         } else {
            const secs = createSections('Users', players);
            if (secs.length > 0) blocks.push(...secs);
            else blocks.push({ type: "section", text: { type: "mrkdwn", text: "No users found for this role." } });
         }

         // Ensure we don't exceed Slack's 50 block limit.
         if (blocks.length > 50) {
             blocks = blocks.slice(0, 49);
             blocks.push({ type: "section", text: { type: "mrkdwn", text: "_...Results truncated due to Slack limits._" } });
         }

         return await sendDelayedSlackResponse(response_url, { response_type: "ephemeral", blocks });
      }

}
