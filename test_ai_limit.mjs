import { fetchWithAIFallback } from './backend/utils/aiRouter.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function test() {
   const filterPrompt = `You are an AI Log Router. A user is asking to search logs.
Current Server Time (ISO): ${new Date().toISOString()}

User query: "which ip and geolocation did nishant support employee logged in"

Based on this query, generate a JSON object with two fields:
1. "mongoFilter"
2. "checkServerEventsFile"
`;

    const filterReq = await fetchWithAIFallback({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: 'user', content: filterPrompt }],
        temperature: 0.1,
        max_tokens: 300,
        apiKey: process.env.CEREBRAS_API_KEY
    });
    
    if (!filterReq.ok) {
       console.log("Failed:", await filterReq.text());
    } else {
       console.log("Success:", await filterReq.json());
    }
}
test();
