import { fetchWithAIFallback } from '../../utils/aiRouter.mjs';
import { 
    sendDelayedSlackResponse, 
    sanitizeMongoFilter, 
    resolveIpGeoLocations, 
    postEphemeral 
} from './SlackNotificationService.mjs';

export async function runQueryAI(originalQuery, mongoLogs, responseUrl) {
      const apiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;

      const compactLogsArr = mongoLogs.map(l => {
         let d = ''; try { d = JSON.stringify(l.details || {}); } catch(e){}
         const istDate = new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
         const ip = l.ipAddress ? ` IP:${l.ipAddress}` : '';
         return `[${istDate}] User:${l.userId}${ip} Action:${l.action} Details:${d}`;
      });

      const ipGeoMap = await resolveIpGeoLocations(compactLogsArr);
      const geoMapStr = Object.keys(ipGeoMap).length > 0 
         ? `\n\nIP Geolocation Map (use this to show location next to every IP):\n${Object.entries(ipGeoMap).map(([ip, loc]) => `  ${ip} → ${loc}`).join('\n')}`
         : '';

      const compactLogs = compactLogsArr.join('\n');
      let summaryContent = compactLogs.substring(0, 2500);

      if (apiKey) {
         try {
            const summaryPrompt = `You are a system administrator AI. A user ran a direct MongoDB query: \`${originalQuery}\`

Here are the raw results (${mongoLogs.length} documents):
${compactLogs.substring(0, 12000)}${geoMapStr}

Provide a highly structured, visually clean summary of these results.

⚠️⚠️ ABSOLUTELY CRITICAL RULES:
- You MUST sort ALL events strictly by timestamp in DESCENDING order (most recent event FIRST). Do NOT group by status.
- You MUST output all timestamps in IST (Indian Standard Time).
- You MUST number events sequentially (1, 2, 3...) where #1 is the MOST RECENT event.
- For EVERY IP address you display, you MUST append the geographic location in parentheses using the IP Geolocation Map provided above. Format: \`IP_ADDRESS\`(City). If an IP has no geo data, show \`IP_ADDRESS\`(Unknown).
- Use emojis for visual separation (🚨 failures, ✅ successes, 📍 location, 🔑 passwords).
- Organize the data into clear, distinct sections (e.g., 'Query Results').
- NEVER display internal system IDs starting with 'sup_'. Use 'details.identifier' or 'details.email' instead.
- ⚠️ SLACK FORMATTING REQUIRED: You are outputting to Slack. Slack does NOT support Markdown headers (#, ##, ###). DO NOT use hashtags for headers. Instead, use *Bold Text* for section headers.
- ⚠️ SLACK FORMATTING REQUIRED: Use bullet points like \`• \` instead of \`- \`. Do NOT use markdown links \`[text](url)\`.
🛡️ SECURITY EXCEPTION: Reveal all IPs, emails, and details without masking.`;

            const aiReq = await fetchWithAIFallback({
                  model: "llama-3.3-70b-versatile",
                  messages: [{ role: 'user', content: summaryPrompt }],
                  temperature: 0.3,
                  max_tokens: 800,
                  apiKey
            });
            if (aiReq.ok) {
               const aiJson = await aiReq.json();
               summaryContent = aiJson.choices?.[0]?.message?.content || summaryContent;
            }
         } catch(e) {
            console.error('Query AI summary error:', e.message);
         }
      }

      const expTs = Math.floor(Date.now() / 1000) + (30 * 60);
      const blocks = [
         { "type": "header", "text": { "type": "plain_text", "text": "📊 MongoDB Query Result", "emoji": true } },
         { "type": "context", "elements": [
            { "type": "mrkdwn", "text": `*Query:* \`${originalQuery}\`` },
            { "type": "mrkdwn", "text": `*Results:* ${mongoLogs.length} documents` },
            { "type": "mrkdwn", "text": `*<!date^${expTs}^⏳ Auto-expiring at {time}|⏳ Auto-expiring in 30 mins>*` }
         ]},
         { "type": "divider" },
         { "type": "section", "text": { "type": "mrkdwn", "text": summaryContent } },
         {
            "type": "actions",
            "elements": [
               { "type": "button", "text": { "type": "plain_text", "text": "👍 Helpful", "emoji": true }, "value": JSON.stringify({ action: "up", context: "query", query: originalQuery.substring(0, 200), intent: null }), "action_id": "ai_feedback_up" },
               { "type": "button", "text": { "type": "plain_text", "text": "👎 Unhelpful", "emoji": true }, "value": JSON.stringify({ action: "down", context: "query", query: originalQuery.substring(0, 200), intent: null }), "action_id": "ai_feedback_down" }
            ]
         }
      ];

      await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", replace_original: true, blocks });

      setTimeout(() => {
         sendDelayedSlackResponse(responseUrl, { 
            response_type: "ephemeral", 
            replace_original: true, 
            text: "⏳ *Query Results Expired* - Please run `/acetrack query` again to fetch fresh logs." 
         }).catch(e => console.error("Auto-expire failed:", e));
      }, 29 * 60 * 1000); // 29 mins (Slack response URLs expire after 30 mins)
   }

export async function runLogAI(userQuery, responseUrl, bypassRedaction = false) {
      const apiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
      if (!apiKey) {
         return await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", text: "⚠️ _AI Query unavailable: GROQ_API_KEY is not set._" });
      }

      try {
         const filterPrompt = `You are an AI Log Router. A user is asking to search logs.
Current Server Time (ISO): ${new Date().toISOString()}

We have five data sources:
1. 'AuditLog' (MongoDB): Contains user actions, authentication events, and security logs.
   Schema: { userId: String, ipAddress: String, userAgent: String, action: String, details: Mixed, timestamp: Date }
   - Common actions: 'SUPPORT_LOGIN_SUCCESS', 'SUPPORT_LOGIN_FAILED', 'ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILED', 'PASSWORD_CHANGED', 'BRUTE_FORCE_DETECTED', 'UNAUTHORIZED_ACCESS_BLOCKED', 'SUPPORT_SHIFT_CHECKIN', 'SUPPORT_SHIFT_CHECKOUT', etc.
   - ⚠️ IMPORTANT: If the user asks about "logins" or "login attempts", ensure your regex includes "UNAUTHORIZED" alongside "LOGIN" (e.g., {"action": {"$regex": "LOGIN|UNAUTHORIZED", "$options": "i"}}).
   - ⚠️ IMPORTANT: If the user asks about "shifts", "checkin", "checkout", or "timings", ensure your regex includes "SHIFT" or explicitly uses 'SUPPORT_SHIFT_CHECKIN' and 'SUPPORT_SHIFT_CHECKOUT'.
   - ⚠️ IMPORTANT: For queries involving usernames, names, or emails (like 'shush' or 'john'), AuditLog may not have their name directly in 'details'. You MUST also provide a "playerFilter" (e.g. {"data.name": {"$regex": "john", "$options": "i"}}) to find the user profile. The system will automatically use the found profile IDs to search the AuditLogs.
   - ⚠️ CRITICAL: ONLY apply a "timestamp" date filter if the user explicitly asks for a specific timeframe. Use the Current Server Time provided above to calculate accurate ISO date strings for $gte/$lte.
2. 'server_events.jsonl' (Filesystem): Contains system crashes, server panics, WebSocket errors, and legacy ephemeral events.
3. 'Player' (MongoDB): Contains user profiles and their current state (e.g. active, suspended, role).
   Schema: { id: String, role: String, data: { name: String, email: String, supportStatus: String, shortLeaves: [{ status: String, startTime: String, endTime: String, reason: String }] } }
   - ⚠️ IMPORTANT: If the user asks about "pending leaves" or "short leaves", you MUST use a "playerFilter" to query the 'data.shortLeaves.status' field (e.g. {"data.shortLeaves": { $elemMatch: { "status": "pending" } }} or {"data.shortLeaves.status": "pending"}).
   - Example: { "role": "support", "data.supportStatus": "suspended" }
4. 'CoachInvite' & 'SupportInvite' (MongoDB): Contains registration invites for coaches and support staff.
   Schema: { email: String, name: String, status: String (Pending|Clicked|Used|Expired), academyId: String, tournamentId: String }
   - ⚠️ IMPORTANT: If the user asks about a coach or support staff's registration status, invite link, or if they completed registration, you MUST provide an "inviteFilter"!
   - ⚠️ CRITICAL: Do NOT filter by 'status' (e.g. 'Used', 'Pending') in inviteFilter. ONLY filter by 'name' or 'email' using $regex so we can see all invites regardless of status.
5. 'SupportTicket' (MongoDB): Contains support tickets, bug reports, and user cases.
   Schema: { id: String, data: { status: String, subject: String, type: String, closureSummary: String, assignedTo: String } }
   - ⚠️ IMPORTANT: If the user asks about cases, tickets, bugs, or closure summaries, use a "ticketFilter" against 'data' fields! Example for missing summary: {"data.closureSummary": { $exists: false }} or {"data.closureSummary": null}.

User query: "${userQuery}"

Based on this query, generate a JSON object with five fields:
1. "mongoFilter": A valid MongoDB query object for the AuditLog collection. Use {} if broad.
2. "playerFilter": A valid MongoDB query object for the Player collection. Use {} if not asking about users.
3. "inviteFilter": A valid MongoDB query object for CoachInvite/SupportInvite collections. Use {} if not asking about invites/registration.
4. "ticketFilter": A valid MongoDB query object for the SupportTicket collection. Use {} if not asking about tickets or cases.
5. "checkServerEventsFile": A boolean.

DO NOT wrap the JSON in markdown code blocks. Output ONLY valid, parsable JSON. No explanations.`;

         const filterReq = await fetchWithAIFallback({
               model: "llama-3.3-70b-versatile",
               messages: [{ role: 'user', content: filterPrompt }],
               temperature: 0.1,
               max_tokens: 300,
               apiKey
         });

         let routingIntent = { mongoFilter: {}, playerFilter: {}, inviteFilter: {}, ticketFilter: {}, checkServerEventsFile: false };
         if (filterReq.ok) {
            const filterJson = await filterReq.json();
            let rawJson = filterJson.choices?.[0]?.message?.content || "{}";
            rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
            try {
               routingIntent = JSON.parse(rawJson);
            } catch (e) {
               console.error("AI Routing Parse Error:", e.message, rawJson);
            }
         }

         let combinedLogsArr = [];
         let foundPlayerIds = [];

         const hasMongoFilter = Object.keys(routingIntent.mongoFilter || {}).length > 0;
         const hasPlayerFilter = Object.keys(routingIntent.playerFilter || {}).length > 0;
         const hasInviteFilter = Object.keys(routingIntent.inviteFilter || {}).length > 0;
         const hasTicketFilter = Object.keys(routingIntent.ticketFilter || {}).length > 0;

         if (hasInviteFilter) {
            const { CoachInvite, SupportInvite } = await import('../../models/index.mjs');
            const sanitizedInviteFilter = sanitizeMongoFilter(routingIntent.inviteFilter);
            try {
               const cInvites = await CoachInvite.find(sanitizedInviteFilter).limit(50).lean();
               const sInvites = await SupportInvite.find(sanitizedInviteFilter).limit(50).lean();
               
               const { Tournament, Player } = await import('../../models/index.mjs');
               const formatInvite = async (i, type) => {
                  let acName = i.academyId || 'N/A';
                  let trName = i.tournamentId || 'N/A';
                  if (i.academyId) {
                     const ac = await Player.findOne({ id: i.academyId }).lean();
                     if (ac && ac.data && ac.data.name) acName = `${ac.data.name} (${i.academyId})`;
                  }
                  if (i.tournamentId) {
                     const tr = await Tournament.findOne({ id: i.tournamentId }).lean();
                     if (tr && tr.data && tr.data.title) trName = `${tr.data.title} (${i.tournamentId})`;
                  }
                  return {
                     timeMs: new Date(i.createdAt).getTime() || 0,
                     text: `[Database][${type}] Email:${i.email} Name:${i.name || i.firstName || 'N/A'} Status:${i.status} Clicks:${i.clicks?.length || 0} Academy:${acName} Tournament:${trName}`
                  };
               };
               
               for (const i of cInvites) combinedLogsArr.push(await formatInvite(i, 'CoachInvite'));
               for (const i of sInvites) combinedLogsArr.push(await formatInvite(i, 'SupportInvite'));
            } catch (err) {
               console.error("Invite Query Error:", err.message);
            }
         }

         if (hasPlayerFilter) {
            const { Player } = await import('../../models/index.mjs');
            const sanitizedPlayerFilter = sanitizeMongoFilter(routingIntent.playerFilter);
            try {
               const players = await Player.find(sanitizedPlayerFilter).limit(100).lean();
               foundPlayerIds = players.map(p => p.id);
               const compactPlayers = players.map(p => {
                  const pd = p.data || {};
                  return {
                     timeMs: new Date(p.lastUpdated || pd.createdAt).getTime() || 0,
                     text: `[Database][Player Record] ID:${p.id} Name:${pd.name || pd.firstName || 'N/A'} Role:${p.role || pd.role || 'N/A'} Designation:${pd.designation || 'N/A'} EmploymentStanding:${(pd.supportStatus === 'terminated') ? 'Terminated' : (pd.supportStatus === 'suspended') ? 'Suspended' : (pd.supportStatus === 'inactive' || pd.supportStatus === 'left' || pd.supportLevel === 'EX-EMPLOYEE') ? 'Ex-Employee' : 'Employee'} Session:${pd.isLive ? 'online' : 'offline'} Email:${pd.email || 'N/A'} Phone:${pd.phoneNumber || pd.phone || 'N/A'} ShortLeaves:${pd.shortLeaves ? JSON.stringify(pd.shortLeaves) : 'None'}`
                  };
               });
               combinedLogsArr.push(...compactPlayers);
            } catch (err) {
               console.error("Player Query Error:", err.message);
            }
         }

         if (hasTicketFilter) {
            const { SupportTicket } = await import('../../models/index.mjs');
            const sanitizedTicketFilter = sanitizeMongoFilter(routingIntent.ticketFilter);
            try {
               const tickets = await SupportTicket.find(sanitizedTicketFilter).limit(100).lean();
               const compactTickets = tickets.map(t => {
                  const td = t.data || {};
                  return {
                     timeMs: new Date(t.lastUpdated || td.createdAt).getTime() || 0,
                     text: `[Database][Support Ticket] ID:${t.id} Subject:${td.subject || 'N/A'} Status:${td.status || 'N/A'} Type:${td.type || 'N/A'} AssignedTo:${td.assignedTo || 'Unassigned'} ClosureSummary:${td.closureSummary || 'N/A'}`
                  };
               });
               combinedLogsArr.push(...compactTickets);
            } catch (err) {
               console.error("Ticket Query Error:", err.message);
            }
         }

         if (hasMongoFilter || (!routingIntent.checkServerEventsFile && !hasPlayerFilter && !hasTicketFilter && !hasInviteFilter)) {
            const { AuditLog } = await import('../../models/index.mjs');
            let sanitizedFilter = sanitizeMongoFilter(routingIntent.mongoFilter);
            
            // Automatically inject resolved player IDs into the AuditLog query
            if (foundPlayerIds.length > 0) {
               if (!sanitizedFilter.$or) sanitizedFilter.$or = [];
               sanitizedFilter.$or.push({ userId: { $in: foundPlayerIds } });
               sanitizedFilter.$or.push({ "details.userId": { $in: foundPlayerIds } });
            }

            let mongoLogs = [];
            try {
               mongoLogs = await AuditLog.find(sanitizedFilter).sort({ timestamp: -1 }).limit(300).lean();
            } catch (err) {
               console.error("MongoDB Query Error (fallback to latest):", err.message);
               mongoLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(300).lean();
            }

            // 🔄 [ZERO-RESULT FALLBACK] (v2.6.545)
            // If the sanitized filter returned 0 results, retry without action & timestamp constraints
            if (mongoLogs.length === 0 && Object.keys(sanitizedFilter).length > 0) {
               console.log('[LOG_AI] Zero results with filter, retrying with relaxed constraints');
               const relaxedFilter = { ...sanitizedFilter };
               delete relaxedFilter.action;
               delete relaxedFilter.timestamp;
               try {
                  mongoLogs = await AuditLog.find(Object.keys(relaxedFilter).length > 0 ? relaxedFilter : {}).sort({ timestamp: -1 }).limit(300).lean();
               } catch (err2) {
                  mongoLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(300).lean();
               }
            }
            
            const compactMongo = mongoLogs.map(l => {
               let d = ''; try { d = JSON.stringify(l.details || {}); } catch(e){}
               const istDate = new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
               const ip = l.ipAddress ? ` IP:${l.ipAddress}` : '';
               return {
                  timeMs: new Date(l.timestamp).getTime() || 0,
                  text: `[Mongo][${istDate}] User:${l.userId}${ip} Action:${l.action} Details:${d}`
               };
            });
            combinedLogsArr.push(...compactMongo);
         }

         if (routingIntent.checkServerEventsFile) {
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const logFile = path.join(__dirname, '..', 'diagnostics', 'server_events.jsonl');
            
            if (fs.existsSync(logFile)) {
               const fileContent = fs.readFileSync(logFile, 'utf8');
               const lines = fileContent.split('\n').filter(Boolean).slice(-300);
               const compactFs = lines.map(line => {
                  let timeMs = 0;
                  try {
                     const obj = JSON.parse(line);
                     if (obj.timestamp) timeMs = new Date(obj.timestamp).getTime();
                  } catch(e) {}
                  return {
                     timeMs,
                     text: `[FS] ${line.substring(0, 500)}`
                  };
               });
               combinedLogsArr.push(...compactFs);
            } else {
               combinedLogsArr.push({ timeMs: 0, text: `[FS] No server_events.jsonl found at ${logFile}` });
            }
         }

         let userSearchTerm = null;
         try {
            const qStr = JSON.stringify(routingIntent.mongoFilter || {});
            const match = qStr.match(/{"\$regex":"([^"|]+)"/);
            if (match && match[1]) {
               userSearchTerm = match[1];
            }
         } catch(e) {}

         if (userSearchTerm && userSearchTerm.length > 2) {
            try {
               const { Player } = await import('../../models/index.mjs');
               const playerDoc = await Player.findOne({ 
                  $or: [
                     { id: { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.email': { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.name': { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.username': { $regex: userSearchTerm, $options: 'i' } }
                  ]
               }).lean();

               if (playerDoc) {
                  const pd = playerDoc.data || {};
                  const creationDate = pd.createdAt || pd.reOnboardedAt || playerDoc.lastUpdated;
                  const istDate = new Date(creationDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                  const istLastUpdated = new Date(playerDoc.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                  const profileName = pd.firstName ? `${pd.firstName} ${pd.lastName || ''}`.trim() : (pd.name || 'N/A');
                  const profileEmail = pd.email || 'N/A';
                  const profilePhone = pd.phoneNumber || pd.phone || 'N/A';
                  const profileUsername = pd.username || playerDoc.id || 'N/A';
                  const profileRole = pd.role || 'user';
                  const profileDesignation = pd.designation || 'N/A';
                  const profileEmploymentStanding = (pd.supportStatus === 'terminated') ? 'Terminated' : (pd.supportStatus === 'suspended') ? 'Suspended' : (pd.supportStatus === 'inactive' || pd.supportStatus === 'left' || pd.supportLevel === 'EX-EMPLOYEE') ? 'Ex-Employee' : 'Employee';
                  const profileSession = pd.isLive ? 'online' : 'offline';
                  combinedLogsArr.push({
                     timeMs: new Date(creationDate).getTime() || 0,
                     text: `[Database][Fallback Record] System found an active database profile matching "${userSearchTerm}". Name: ${profileName}. Username: ${profileUsername}. Email: ${profileEmail}. Phone: ${profilePhone}. Role: ${profileRole}. Designation: ${profileDesignation}. EmploymentStanding: ${profileEmploymentStanding}. Session: ${profileSession}. Original Onboard/Creation Time: ${istDate}. Last Data Update Time: ${istLastUpdated}.`
                  });
               }
            } catch(e) {
               console.error('Player context fallback failed:', e.message);
            }
         }
         
         if (combinedLogsArr.length === 0) {
            return await sendDelayedSlackResponse(responseUrl, { 
               response_type: "ephemeral", 
               text: `🔍 *Query:* "${userQuery}"\n\n*Result:* No logs found across any system based on AI intent: \`${JSON.stringify(routingIntent)}\`` 
            });
         }

         // 🌍 [GEO-RESOLVE IPs] (v2.6.544)
         const ipGeoMap = await resolveIpGeoLocations(combinedLogsArr);
         const geoMapStr = Object.keys(ipGeoMap).length > 0 
            ? `\n\nIP Geolocation Map (use this to show location next to every IP):\n${Object.entries(ipGeoMap).map(([ip, loc]) => `  ${ip} → ${loc}`).join('\n')}`
            : '';

         // Sort all collected logs strictly by timeMs descending, then map to text strings
         combinedLogsArr.sort((a, b) => b.timeMs - a.timeMs);
         const compactLogs = combinedLogsArr.map(item => item.text).join('\n');

         let securityInstruction = bypassRedaction 
            ? `🛡️ SECURITY EXCEPTION: The administrator has authenticated with MFA. You MUST explicitly reveal all passwords, IP addresses, emails, and sensitive PII that answer the user's query. Do NOT mask them.`
            : `🛡️ ZERO-TRUST GUARDRAIL: ALWAYS mask email addresses, IP addresses, and passwords (e.g., h****@gmail.com, 10.x.x.x, [REDACTED]). Do NOT reveal sensitive PII under any circumstances in this initial summary.`;

         const summaryPrompt = `You are a system administrator AI assistant.
A user asked: "${userQuery}"

${compactLogs.substring(0, 15000)}${geoMapStr}

Please analyze these logs and provide a highly structured, visually clean summary answering the user's question. 

⚠️⚠️ ABSOLUTELY CRITICAL RULES (MUST FOLLOW OR OUTPUT IS INVALID):
- You MUST sort ALL events strictly by timestamp in DESCENDING order (most recent event FIRST, oldest LAST). Do NOT group by status (success/failure) — sort ONLY by time.
- You MUST output all timestamps in IST (Indian Standard Time). If a log is in UTC, convert it to IST.
- You MUST number events sequentially (1, 2, 3...) where #1 is the MOST RECENT event.
- For EVERY IP address you display, you MUST append the geographic location in parentheses using the IP Geolocation Map provided above. Format: \`IP_ADDRESS\`(City). If an IP has no geo data, show \`IP_ADDRESS\`(Unknown).

Formatting rules:
1. Use emojis for visual separation (e.g. 🚨 for failed logins, ✅ for successes, 📍 for location, 🔑 for passwords).
2. Format IPs in inline code blocks followed by location in parentheses: \`1.2.3.4\`(Mumbai).
3. If an IP is a comma-separated list (e.g. "x.x.x.x, proxy1, proxy2"), ONLY extract and display the first IP (the actual client).
4. Organize the data into clear, distinct sections (e.g. 'Incident Report', 'Key Anomalies').
5. For any login or authentication attempts, explicitly state whether the attempt was a SUCCESS or FAILURE based on the log action (e.g., 'LOGIN_SUCCESS' vs 'LOGIN_FAILED').
6. Only include REAL events from the logs. Do NOT fabricate entries like "No other recent login failures found" — if there are fewer events than requested, just show what exists.
7. NEVER display internal system IDs (e.g., ones starting with 'sup_'). Instead, use the 'details.identifier', 'details.email', or 'details.name' from the log. NEVER print 'sup_do8ux1cc' or similar.
8. ALWAYS include the full date (e.g., '22 May 2026') alongside the time for every event.
9. If a '[Database][Fallback Record]' or '[Database][Player Record]' is present, you MUST create an 'Account Information' section AT THE VERY TOP of your summary containing all extracted details (Name, Username, Phone, Email, Role, Designation, EmploymentStanding, Session). You MUST output the EmploymentStanding EXACTLY as provided (e.g. 'Employee', 'Ex-Employee', 'Terminated', 'Suspended'), do NOT change it to 'offline' or 'online'.
10. ⚠️ CRITICAL OVERRIDE: If the user query is strictly asking for "pending short leaves" or similar leave requests, DO NOT output a 'Recent Events' or 'Key Anomalies' section. Instead, ONLY output the 'Account Information' and a 'Pending Short Leave Requests' section containing the leave details and the 'reason' (justification) from the JSON.
11. ⚠️ SLACK FORMATTING REQUIRED: You are outputting to Slack. Slack does NOT support Markdown headers (#, ##, ###). DO NOT use hashtags for headers. Instead, use *Bold Text* for section headers (e.g., *Account Information*).
12. ⚠️ SLACK FORMATTING REQUIRED: Use bullet points like \`• \` instead of \`- \`. Do NOT use markdown links \`[text](url)\`.
${securityInstruction}`;

         let summaryReq = await fetchWithAIFallback({
               model: "llama-3.3-70b-versatile",
               messages: [{ role: 'user', content: summaryPrompt }],
               temperature: 0.3,
               max_tokens: 800,
               apiKey
         });

         let summaryContent = "_AI Summary failed to generate._";
         if (summaryReq.ok) {
            const summaryJson = await summaryReq.json();
            summaryContent = summaryJson.choices?.[0]?.message?.content || summaryContent;
         } else {
            let errorBody = await summaryReq.text();
            try { 
               const p = JSON.parse(errorBody);
               if (p.error && p.error.message) errorBody = p.error.message;
            } catch(e){}
            summaryContent = `_AI Error (${summaryReq.status}): ${summaryReq.statusText || 'Request Failed'} - ${errorBody}_`;
         }

         const blocks = [
            {
               "type": "header",
               "text": { "type": "plain_text", "text": bypassRedaction ? "🔓 Unredacted AI Log Analysis" : "📊 AI Log Analysis", "emoji": true }
            },
            {
               "type": "context",
               "elements": [
                  { "type": "mrkdwn", "text": `*Query:* "${userQuery}"` },
                  { "type": "mrkdwn", "text": `*AI Routing Intent:* \`${JSON.stringify(routingIntent)}\`` },
                  { "type": "mrkdwn", "text": `*Logs Analyzed:* ${combinedLogsArr.length}` }
               ]
            },
            { "type": "divider" },
            {
               "type": "section",
               "text": { "type": "mrkdwn", "text": summaryContent }
            }
         ];

         let actionsElements = [];
         
         if (!bypassRedaction) {
             actionsElements.push({
                 "type": "button",
                 "text": { "type": "plain_text", "text": "🔓 Reveal Secure Details" },
                 "style": "danger",
                 "action_id": "reveal_secure_details",
                 "value": JSON.stringify({ query: userQuery, url: responseUrl, intent: routingIntent })
             });
         }

         if (!summaryReq.ok) {
             actionsElements.push({
                 "type": "button",
                 "text": { "type": "plain_text", "text": "📄 Dump Raw Logs" },
                 "action_id": "dump_raw_logs",
                 "value": JSON.stringify({ query: userQuery, url: responseUrl, intent: routingIntent })
             });
         }

         if (actionsElements.length > 0) {
             blocks.push({
                "type": "actions",
                "elements": actionsElements
             });
         }

         // Add Feedback Buttons
         blocks.push({
            "type": "actions",
            "elements": [
               { "type": "button", "text": { "type": "plain_text", "text": "👍 Helpful", "emoji": true }, "value": JSON.stringify({ action: "up", context: "log_search", query: userQuery.substring(0, 200), intent: routingIntent }), "action_id": "ai_feedback_up" },
               { "type": "button", "text": { "type": "plain_text", "text": "👎 Unhelpful", "emoji": true }, "value": JSON.stringify({ action: "down", context: "log_search", query: userQuery.substring(0, 200), intent: routingIntent }), "action_id": "ai_feedback_down" }
            ]
         });

         const payloadToSend = { 
            response_type: "ephemeral", 
            replace_original: !bypassRedaction, // Slack drops view_submission ephemeral replacements. Force a NEW message if bypassed.
            text: bypassRedaction ? "🔓 Unredacted AI Log Analysis" : "📊 AI Log Analysis",
            blocks 
         };

         await sendDelayedSlackResponse(responseUrl, payloadToSend);

         // 🕒 Auto-Revert after 10 minutes for security
         if (bypassRedaction) {
            setTimeout(() => {
               // Re-run the log AI with bypassRedaction = false to replace the unredacted message with the redacted one
               runLogAI(userQuery, responseUrl, false).catch(e => console.error("Auto-revert failed:", e));
            }, 10 * 60 * 1000); // 10 minutes
         }

      } catch (e) {
         await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", text: `⚠️ *Error running log query:* ${e.message}` });
      }
  }

export // 🔓 [MFA REVEAL DELIVERY] (v2.6.544)
  // Runs the same AI log query but delivers results via chat.postEphemeral (Slack Web API)
  // with response_url as fallback, because view_submission payloads don't carry a response_url.
  async function runLogAIEphemeral(userQuery, channelId, slackUserId, fallbackResponseUrl, precalculatedIntent = null) {
      const slackBotToken = process.env.SLACK_BOT_TOKEN;
      
      // We need at least ONE delivery mechanism
      const canEphemeral = slackBotToken && channelId && slackUserId;
      const canResponseUrl = !!fallbackResponseUrl;
      
      if (!canEphemeral && !canResponseUrl) {
         console.error('runLogAIEphemeral: No delivery mechanism available', { channelId, slackUserId, hasToken: !!slackBotToken, hasUrl: canResponseUrl });
         return;
      }
      
      console.log('📡 [MFA_REVEAL_DELIVERY] Delivery paths:', { canEphemeral, canResponseUrl });

      const apiKey = process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY;
      if (!apiKey) {
         return await postEphemeral(slackBotToken, channelId, slackUserId, "⚠️ _AI Query unavailable: GROQ_API_KEY is not set._");
      }

      try {
         let routingIntent = precalculatedIntent;
         if (!routingIntent) {
            // 1. Route the query (same as runLogAI)
            const filterPrompt = `You are an AI Log Router. A user is asking to search logs.
Current Server Time (ISO): ${new Date().toISOString()}

We have five data sources:
1. 'AuditLog' (MongoDB): Contains user actions, authentication events, and security logs.
   Schema: { userId: String, ipAddress: String, userAgent: String, action: String, details: Mixed, timestamp: Date }
   - Common actions: 'SUPPORT_LOGIN_SUCCESS', 'SUPPORT_LOGIN_FAILED', 'ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILED', 'PASSWORD_CHANGED', 'BRUTE_FORCE_DETECTED', 'UNAUTHORIZED_ACCESS_BLOCKED', etc.
   - ⚠️ IMPORTANT: If the user asks about "logins" or "login attempts", ensure your regex includes "UNAUTHORIZED" alongside "LOGIN" (e.g., {"action": {"$regex": "LOGIN|UNAUTHORIZED", "$options": "i"}}).
   - ⚠️ IMPORTANT: For queries involving usernames or emails (like 'shush' or 'john'), do NOT just query 'userId'. Use an $or array on 'details.email', 'details.name', 'details.userId', 'details.identifier', 'details.receivedIdentifier'.
   - ⚠️ CRITICAL: ONLY apply a "timestamp" date filter if the user explicitly asks for a specific timeframe. Use the Current Server Time provided above to calculate accurate ISO date strings for $gte/$lte.
2. 'server_events.jsonl' (Filesystem): Contains system crashes, server panics, WebSocket errors, and legacy ephemeral events.
3. 'Player' (MongoDB): Contains user profiles and their current state (e.g. active, suspended, role).
   Schema: { id: String, role: String, data: { name: String, email: String, supportStatus: String, shortLeaves: [{ status: String, startTime: String, endTime: String, reason: String }] } }
   - ⚠️ IMPORTANT: If the user asks about "pending leaves" or "short leaves", you MUST use a "playerFilter" to query the 'data.shortLeaves.status' field (e.g. {"data.shortLeaves": { $elemMatch: { "status": "pending" } }} or {"data.shortLeaves.status": "pending"}).
   - Example: { "role": "support", "data.supportStatus": "suspended" }
4. 'CoachInvite' & 'SupportInvite' (MongoDB): Contains registration invites for coaches and support staff.
   Schema: { email: String, name: String, status: String (Pending|Clicked|Used|Expired), academyId: String, tournamentId: String }
   - ⚠️ IMPORTANT: If the user asks about a coach or support staff's registration status, invite link, or if they completed registration, you MUST provide an "inviteFilter"!
   - ⚠️ CRITICAL: Do NOT filter by 'status' (e.g. 'Used', 'Pending') in inviteFilter. ONLY filter by 'name' or 'email' using $regex so we can see all invites regardless of status.
5. 'SupportTicket' (MongoDB): Contains support tickets, bug reports, and user cases.
   Schema: { id: String, data: { status: String, subject: String, type: String, closureSummary: String, assignedTo: String } }
   - ⚠️ IMPORTANT: If the user asks about cases, tickets, bugs, or closure summaries, use a "ticketFilter" against 'data' fields! Example for missing summary: {"data.closureSummary": { $exists: false }} or {"data.closureSummary": null}.

User query: "${userQuery}"

Based on this query, generate a JSON object with five fields:
1. "mongoFilter": A valid MongoDB query object for the AuditLog collection. Use {} if broad.
2. "playerFilter": A valid MongoDB query object for the Player collection. Use {} if not asking about users.
3. "inviteFilter": A valid MongoDB query object for CoachInvite/SupportInvite collections. Use {} if not asking about invites/registration.
4. "ticketFilter": A valid MongoDB query object for the SupportTicket collection. Use {} if not asking about tickets or cases.
5. "checkServerEventsFile": A boolean.

DO NOT wrap the JSON in markdown code blocks. Output ONLY valid, parsable JSON. No explanations.`;

            const filterReq = await fetchWithAIFallback({
                  model: "llama-3.3-70b-versatile",
                  messages: [{ role: 'user', content: filterPrompt }],
                  temperature: 0.1,
                  max_tokens: 300,
                  apiKey
            });

            routingIntent = { mongoFilter: {}, playerFilter: {}, inviteFilter: {}, ticketFilter: {}, checkServerEventsFile: false };
            if (filterReq.ok) {
               const filterJson = await filterReq.json();
               let rawJson = filterJson.choices?.[0]?.message?.content || "{}";
               rawJson = rawJson.replace(/```json/g, '').replace(/```/g, '').trim();
               try { routingIntent = JSON.parse(rawJson); } catch (e) { console.error("Ephemeral AI Routing Parse Error:", e.message); }
            }
         }

         // 2. Fetch logs
         let combinedLogsArr = [];

         const hasMongoFilter = Object.keys(routingIntent.mongoFilter || {}).length > 0;
         const hasPlayerFilter = Object.keys(routingIntent.playerFilter || {}).length > 0;
         const hasInviteFilter = Object.keys(routingIntent.inviteFilter || {}).length > 0;
         const hasTicketFilter = Object.keys(routingIntent.ticketFilter || {}).length > 0;

         if (hasInviteFilter) {
            const { CoachInvite, SupportInvite } = await import('../../models/index.mjs');
            const sanitizedInviteFilter = sanitizeMongoFilter(routingIntent.inviteFilter);
            try {
               const cInvites = await CoachInvite.find(sanitizedInviteFilter).limit(50).lean();
               const sInvites = await SupportInvite.find(sanitizedInviteFilter).limit(50).lean();
               
               const { Tournament, Player } = await import('../../models/index.mjs');
               const formatInvite = async (i, type) => {
                  let acName = i.academyId || 'N/A';
                  let trName = i.tournamentId || 'N/A';
                  if (i.academyId) {
                     const ac = await Player.findOne({ id: i.academyId }).lean();
                     if (ac && ac.data && ac.data.name) acName = `${ac.data.name} (${i.academyId})`;
                  }
                  if (i.tournamentId) {
                     const tr = await Tournament.findOne({ id: i.tournamentId }).lean();
                     if (tr && tr.data && tr.data.title) trName = `${tr.data.title} (${i.tournamentId})`;
                  }
                  return `[Database][${type}] Email:${i.email} Name:${i.name || i.firstName || 'N/A'} Status:${i.status} Clicks:${i.clicks?.length || 0} Academy:${acName} Tournament:${trName}`;
               };
               
               for (const i of cInvites) combinedLogsArr.push(await formatInvite(i, 'CoachInvite'));
               for (const i of sInvites) combinedLogsArr.push(await formatInvite(i, 'SupportInvite'));
            } catch (err) {
               console.error("Ephemeral Invite Query Error:", err.message);
            }
         }

         if (hasPlayerFilter) {
            const { Player } = await import('../../models/index.mjs');
            const sanitizedPlayerFilter = sanitizeMongoFilter(routingIntent.playerFilter);
            try {
               const players = await Player.find(sanitizedPlayerFilter).limit(100).lean();
               const compactPlayers = players.map(p => {
                  const pd = p.data || {};
                  return `[Database][Player Record] ID:${p.id} Name:${pd.name || pd.firstName || 'N/A'} Role:${p.role || pd.role || 'N/A'} Designation:${pd.designation || 'N/A'} EmploymentStanding:${(pd.supportStatus === 'terminated') ? 'Terminated' : (pd.supportStatus === 'suspended') ? 'Suspended' : (pd.supportStatus === 'inactive' || pd.supportStatus === 'left' || pd.supportLevel === 'EX-EMPLOYEE') ? 'Ex-Employee' : 'Employee'} Session:${pd.isLive ? 'online' : 'offline'} Email:${pd.email || 'N/A'} Phone:${pd.phoneNumber || pd.phone || 'N/A'} ShortLeaves:${pd.shortLeaves ? JSON.stringify(pd.shortLeaves) : 'None'}`;
               });
               combinedLogsArr.push(...compactPlayers);
            } catch (err) {
               console.error("Ephemeral Player Query Error:", err.message);
            }
         }

         if (hasTicketFilter) {
            const { SupportTicket } = await import('../../models/index.mjs');
            const sanitizedTicketFilter = sanitizeMongoFilter(routingIntent.ticketFilter);
            try {
               const tickets = await SupportTicket.find(sanitizedTicketFilter).limit(100).lean();
               const compactTickets = tickets.map(t => {
                  const td = t.data || {};
                  return `[Database][Support Ticket] ID:${t.id} Subject:${td.subject || 'N/A'} Status:${td.status || 'N/A'} Type:${td.type || 'N/A'} AssignedTo:${td.assignedTo || 'Unassigned'} ClosureSummary:${td.closureSummary || 'N/A'}`;
               });
               combinedLogsArr.push(...compactTickets);
            } catch (err) {
               console.error("Ephemeral Ticket Query Error:", err.message);
            }
         }

         if (hasMongoFilter || (!routingIntent.checkServerEventsFile && !hasPlayerFilter && !hasTicketFilter && !hasInviteFilter)) {
            const { AuditLog } = await import('../../models/index.mjs');
            const sanitizedFilter = sanitizeMongoFilter(routingIntent.mongoFilter);
            let mongoLogs = [];
            try {
               mongoLogs = await AuditLog.find(sanitizedFilter).sort({ timestamp: -1 }).limit(300).lean();
            } catch (err) {
               mongoLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(300).lean();
            }

            // 🔄 [ZERO-RESULT FALLBACK] (v2.6.545)
            if (mongoLogs.length === 0 && Object.keys(sanitizedFilter).length > 0) {
               const relaxedFilter = { ...sanitizedFilter };
               delete relaxedFilter.action;
               delete relaxedFilter.timestamp;
               try {
                  mongoLogs = await AuditLog.find(Object.keys(relaxedFilter).length > 0 ? relaxedFilter : {}).sort({ timestamp: -1 }).limit(300).lean();
               } catch (err2) {
                  mongoLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(300).lean();
               }
            }

            const compactMongo = mongoLogs.map(l => {
               let d = ''; try { d = JSON.stringify(l.details || {}); } catch(e){}
               const istDate = new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
               const ip = l.ipAddress ? ` IP:${l.ipAddress}` : '';
               return `[Mongo][${istDate}] User:${l.userId}${ip} Action:${l.action} Details:${d}`;
            });
            combinedLogsArr.push(...compactMongo);
         }

         if (routingIntent.checkServerEventsFile) {
            const fs = await import('fs');
            const path = await import('path');
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const logFile = path.join(__dirname, '..', 'diagnostics', 'server_events.jsonl');
            if (fs.existsSync(logFile)) {
               const fileContent = fs.readFileSync(logFile, 'utf8');
               const lines = fileContent.split('\n').filter(Boolean).slice(-300);
               combinedLogsArr.push(...lines.map(line => `[FS] ${line.substring(0, 500)}`));
            }
         }

         let userSearchTerm = null;
         try {
            const qStr = JSON.stringify(routingIntent.mongoFilter || {});
            const match = qStr.match(/{"\$regex":"([^"|]+)"/);
            if (match && match[1]) {
               userSearchTerm = match[1];
            }
         } catch(e) {}

         if (userSearchTerm && userSearchTerm.length > 2) {
            try {
               const { Player } = await import('../../models/index.mjs');
               const playerDoc = await Player.findOne({ 
                  $or: [
                     { id: { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.email': { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.name': { $regex: userSearchTerm, $options: 'i' } },
                     { 'data.username': { $regex: userSearchTerm, $options: 'i' } }
                  ]
               }).lean();

               if (playerDoc) {
                  const pd = playerDoc.data || {};
                  const creationDate = pd.createdAt || pd.reOnboardedAt || playerDoc.lastUpdated;
                  const istDate = new Date(creationDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                  const istLastUpdated = new Date(playerDoc.lastUpdated).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
                  const profileName = pd.firstName ? `${pd.firstName} ${pd.lastName || ''}`.trim() : (pd.name || 'N/A');
                  const profileEmail = pd.email || 'N/A';
                  const profilePhone = pd.phoneNumber || pd.phone || 'N/A';
                  const profileUsername = pd.username || playerDoc.id || 'N/A';
                  const profileRole = pd.role || 'user';
                  const profileDesignation = pd.designation || 'N/A';
                  const profileEmploymentStanding = (pd.supportStatus === 'terminated') ? 'Terminated' : (pd.supportStatus === 'suspended') ? 'Suspended' : (pd.supportStatus === 'inactive' || pd.supportStatus === 'left' || pd.supportLevel === 'EX-EMPLOYEE') ? 'Ex-Employee' : 'Employee';
                  const profileSession = pd.isLive ? 'online' : 'offline';
                  combinedLogsArr.push(`[Database][Fallback Record] System found an active database profile matching "${userSearchTerm}". Name: ${profileName}. Username: ${profileUsername}. Email: ${profileEmail}. Phone: ${profilePhone}. Role: ${profileRole}. Designation: ${profileDesignation}. EmploymentStanding: ${profileEmploymentStanding}. Session: ${profileSession}. Original Onboard/Creation Time: ${istDate}. Last Data Update Time: ${istLastUpdated}.`);
               }
            } catch(e) {
               console.error('Ephemeral Player context fallback failed:', e.message);
            }
         }

         if (combinedLogsArr.length === 0) {
            return await postEphemeral(slackBotToken, channelId, slackUserId, `🔍 *Query:* "${userQuery}"\n\n*Result:* No logs found.`);
         }

         // 3. Geo-resolve IPs and Summarize with AI (UNREDACTED)
         const ipGeoMap = await resolveIpGeoLocations(combinedLogsArr);
         const geoMapStr = Object.keys(ipGeoMap).length > 0 
            ? `\n\nIP Geolocation Map (use this to show location next to every IP):\n${Object.entries(ipGeoMap).map(([ip, loc]) => `  ${ip} → ${loc}`).join('\n')}`
            : '';

         const compactLogs = combinedLogsArr.join('\n');
         const summaryPrompt = `You are a system administrator AI assistant.
A user asked: "${userQuery}"

Here are the retrieved system logs:
${compactLogs.substring(0, 15000)}${geoMapStr}

Provide a highly structured, visually clean summary answering the user's question.

⚠️⚠️ ABSOLUTELY CRITICAL RULES (MUST FOLLOW OR OUTPUT IS INVALID):
- You MUST sort ALL events strictly by timestamp in DESCENDING order (most recent event FIRST, oldest LAST). Do NOT group by status (success/failure) — sort ONLY by time.
- You MUST output all timestamps in IST (Indian Standard Time). If a log is in UTC, convert it to IST.
- You MUST number events sequentially (1, 2, 3...) where #1 is the MOST RECENT event.
- For EVERY IP address you display, you MUST append the geographic location in parentheses using the IP Geolocation Map provided above. Format: \`IP_ADDRESS\`(City). If an IP has no geo data, show \`IP_ADDRESS\`(Unknown).

Formatting rules:
1. Use emojis for visual separation (e.g. 🚨 for failed logins, ✅ for successes, 📍 for location, 🔑 for passwords).
2. Format IPs in inline code blocks followed by location in parentheses: \`1.2.3.4\`(Mumbai).
3. If an IP is a comma-separated list (e.g. "x.x.x.x, proxy1, proxy2"), ONLY extract and display the first IP (the actual client).
4. Organize the data into clear, distinct sections (e.g. 'Incident Report', 'Key Anomalies').
5. For any login or authentication attempts, explicitly state whether the attempt was a SUCCESS or FAILURE based on the log action (e.g., 'LOGIN_SUCCESS' vs 'LOGIN_FAILED').
6. Only include REAL events from the logs. Do NOT fabricate entries like "No other recent login failures found" — if there are fewer events than requested, just show what exists.
7. NEVER display internal system IDs (e.g., ones starting with 'sup_'). Instead, use the 'details.identifier', 'details.email', or 'details.name' from the log. NEVER print 'sup_do8ux1cc' or similar.
8. ALWAYS include the full date (e.g., '22 May 2026') alongside the time for every event.
9. If a '[Database][Fallback Record]' or '[Database][Player Record]' is present, you MUST create an 'Account Information' section AT THE VERY TOP of your summary containing all extracted details (Name, Username, Phone, Email, Role, Designation, etc.).
10. ⚠️ CRITICAL OVERRIDE: If the user query is strictly asking for "pending short leaves" or similar leave requests, DO NOT output a 'Recent Events' or 'Key Anomalies' section. Instead, ONLY output the 'Account Information' and a 'Pending Short Leave Requests' section containing the leave details and the 'reason' (justification) from the JSON.
11. ⚠️ SLACK FORMATTING REQUIRED: You are outputting to Slack. Slack does NOT support Markdown headers (#, ##, ###). DO NOT use hashtags for headers. Instead, use *Bold Text* for section headers (e.g., *Account Information*).
12. ⚠️ SLACK FORMATTING REQUIRED: Use bullet points like \`• \` instead of \`- \`. Do NOT use markdown links \`[text](url)\`.
13. DO NOT include security disclaimers, notes, or lectures about the SECURITY EXCEPTION. Just output the data.
🛡️ SECURITY EXCEPTION: The administrator has authenticated with MFA. You MUST explicitly reveal all passwords, IP addresses, emails, and sensitive PII. Do NOT mask them.`;

         let summaryReq = await fetchWithAIFallback({
               model: "llama-3.3-70b-versatile",
               messages: [{ role: 'user', content: summaryPrompt }],
               temperature: 0.3,
               max_tokens: 800,
               apiKey
         });

         let summaryContent = "_AI Summary failed to generate._";
         if (summaryReq.ok) {
            const summaryJson = await summaryReq.json();
            summaryContent = summaryJson.choices?.[0]?.message?.content || summaryContent;
         }

         // 4. Deliver the unredacted results
         const expTs = Math.floor(Date.now() / 1000) + (10 * 60);
         const blocks = [
            { "type": "header", "text": { "type": "plain_text", "text": "🔓 Unredacted AI Log Analysis", "emoji": true } },
            { "type": "context", "elements": [
               { "type": "mrkdwn", "text": `*Query:* "${userQuery}"` },
               { "type": "mrkdwn", "text": `*Logs Analyzed:* ${combinedLogsArr.length}` },
               { "type": "mrkdwn", "text": `*<!date^${expTs}^⏳ Auto-redacting at {time}|⏳ Auto-redacting in 10 mins>*` }
            ]},
            { "type": "divider" },
            { "type": "section", "text": { "type": "mrkdwn", "text": summaryContent } }
         ];

         if (!summaryReq.ok) {
             blocks.push({
                 "type": "actions",
                 "elements": [{
                     "type": "button",
                     "text": { "type": "plain_text", "text": "📄 Dump Raw Logs" },
                     "action_id": "dump_raw_logs",
                     "value": JSON.stringify({ query: userQuery, url: fallbackResponseUrl, intent: routingIntent })
                 }]
             });
         }

         const payload = { 
            response_type: "ephemeral", 
            replace_original: true, 
            text: "🔓 Unredacted AI Log Analysis", 
            blocks 
         };

         // To replace the original message, we MUST use the response_url.
         let delivered = false;
         if (canResponseUrl) {
            console.log('📡 [MFA_REVEAL] Using response_url to replace original message');
            await sendDelayedSlackResponse(fallbackResponseUrl, payload);
            delivered = true;
         }
         
         if (!delivered && canEphemeral) {
            console.log('📡 [MFA_REVEAL] Falling back to chat.postEphemeral (will not replace original)');
            delivered = await postEphemeral(slackBotToken, channelId, slackUserId, payload.text, blocks);
         }

         if (delivered && canResponseUrl) {
            setTimeout(() => {
               console.log('📡 [MFA_REVEAL] Auto-reverting unredacted message after 10 mins');
               runLogAI(userQuery, fallbackResponseUrl, false).catch(e => console.error("Auto-revert failed:", e));
            }, 10 * 60 * 1000); // 10 minutes
         }

      } catch (e) {
         console.error('runLogAIEphemeral error:', e);
         const errMsg = `⚠️ *Error running unredacted query:* ${e.message}`;
         if (canResponseUrl) {
            await sendDelayedSlackResponse(fallbackResponseUrl, { response_type: "ephemeral", text: errMsg, replace_original: true });
         } else if (canEphemeral) {
            await postEphemeral(slackBotToken, channelId, slackUserId, errMsg);
         }
      }
  }

export async function dumpRawLogs(userQuery, routingIntent, responseUrl) {
      if (!routingIntent) {
         return await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", text: "⚠️ _Cannot dump raw logs: No routing intent found._" });
      }

      let combinedLogsArr = [];
      if (Object.keys(routingIntent.mongoFilter || {}).length > 0 || !routingIntent.checkServerEventsFile) {
         const { AuditLog } = await import('../../models/index.mjs');
         const sanitizedFilter = sanitizeMongoFilter(routingIntent.mongoFilter);
         let mongoLogs = [];
         try {
            mongoLogs = await AuditLog.find(Object.keys(sanitizedFilter).length > 0 ? sanitizedFilter : {}).sort({ timestamp: -1 }).limit(300).lean();
         } catch(e) {
            mongoLogs = await AuditLog.find({}).sort({ timestamp: -1 }).limit(300).lean();
         }
         
         const compactMongo = mongoLogs.map(l => {
            let d = ''; try { d = JSON.stringify(l.details || {}); } catch(e){}
            const istDate = new Date(l.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
            return `[${istDate}] ${l.userId} | ${l.ipAddress} | ${l.action} | ${d}`;
         });
         combinedLogsArr.push(...compactMongo);
      }
      
      const rawText = combinedLogsArr.join('\n');
      const truncated = rawText.length > 2900 ? rawText.substring(0, 2900) + "\n...[TRUNCATED]" : rawText;
      
      const blocks = [
         { "type": "header", "text": { "type": "plain_text", "text": "📄 Raw Log Dump", "emoji": true } },
         { "type": "context", "elements": [
            { "type": "mrkdwn", "text": `*Query:* "${userQuery}"` },
            { "type": "mrkdwn", "text": `*Logs Found:* ${combinedLogsArr.length}` }
         ]},
         { "type": "divider" },
         { "type": "section", "text": { "type": "mrkdwn", "text": "```\n" + (truncated || "No logs found.") + "\n```" } }
      ];

      await sendDelayedSlackResponse(responseUrl, { response_type: "ephemeral", replace_original: false, blocks });
   }
