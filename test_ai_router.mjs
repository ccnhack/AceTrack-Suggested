import { fetchWithAIFallback } from './backend/utils/aiRouter.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function testPrompt() {
    const userQuery = "which ip and geolocation did nishant support employee logged in";
    const filterPrompt = `You are an AI Log Router. A user is asking to search logs.
Current Server Time (ISO): ${new Date().toISOString()}

We have two log sources:
1. 'AuditLog' (MongoDB): Contains user actions, authentication events, and security logs.
   Schema: { userId: String, ipAddress: String, userAgent: String, action: String, details: Mixed, timestamp: Date }
   - Common actions: 'SUPPORT_LOGIN_SUCCESS', 'SUPPORT_LOGIN_FAILED', 'ADMIN_LOGIN_SUCCESS', 'ADMIN_LOGIN_FAILED', 'PASSWORD_CHANGED', 'BRUTE_FORCE_DETECTED', 'UNAUTHORIZED_ACCESS_BLOCKED', etc.
   - ⚠️ IMPORTANT: If the user asks about "logins" or "login attempts", you MUST either omit the action filter entirely, or ensure your regex includes "UNAUTHORIZED" alongside "LOGIN" (e.g., {"action": {"$regex": "LOGIN|UNAUTHORIZED", "$options": "i"}}).
   - ⚠️ IMPORTANT: For queries involving usernames or emails (like 'shush' or 'john'), do NOT just query 'userId'. Many events store the target user in 'details.email', 'details.name', 'details.userId', 'details.identifier', 'details.receivedIdentifier'. Use an $or array containing all of these! 
   - ⚠️ IMPORTANT: For IP address queries, search both the 'ipAddress' and 'userId' fields, as 'userId' often stores the IP for unauthenticated attempts.
   - Use $regex heavily for strings! Example for action: { "action": { "$regex": "ADMIN.*LOGIN.*FAIL", "$options": "i" } }
   - ⚠️ CRITICAL: DO NOT use aggregation operators like $date, $subtract, or $$NOW.
   - ⚠️ CRITICAL: ONLY apply a "timestamp" date filter if the user explicitly asks for a specific timeframe (e.g., "today", "yesterday", "last week"). Use the Current Server Time provided above to calculate accurate ISO date strings for $gte/$lte.
2. 'server_events.jsonl' (Filesystem): Contains system crashes, server panics, WebSocket errors, and legacy ephemeral events.

User query: "${userQuery}"

Based on this query, generate a JSON object with two fields:
1. "mongoFilter": A valid MongoDB query object for the AuditLog collection (use $regex heavily for strings!). If the query is broad, return {} to fetch the latest logs.
2. "checkServerEventsFile": A boolean (MUST be true if the query asks about server crashes, panics, WebSocket drops, or system errors).

DO NOT wrap the JSON in markdown code blocks. Output ONLY valid, parsable JSON. No explanations.`;

    const filterReq = await fetchWithAIFallback({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: filterPrompt }],
        temperature: 0.1,
        max_tokens: 300,
        apiKey: process.env.GROQ_API_KEY
    });

    const filterJson = await filterReq.json();
    console.log("Raw LLM Response:");
    console.log(filterJson.choices?.[0]?.message?.content);
}

testPrompt();
