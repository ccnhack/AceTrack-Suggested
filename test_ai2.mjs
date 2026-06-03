import 'dotenv/config';
import { fetchWithAIFallback } from './backend/utils/aiRouter.mjs';

async function test() {
  const isCerebrasOnly = !process.env.GROQ_API_KEY && process.env.CEREBRAS_API_KEY;
  console.log("isCerebrasOnly:", isCerebrasOnly);
  console.log("GROQ_API_KEY exists?", !!process.env.GROQ_API_KEY);
  console.log("CEREBRAS_API_KEY exists?", !!process.env.CEREBRAS_API_KEY);
  try {
    const res = await fetchWithAIFallback({
      messages: [
        { role: 'system', content: 'You are an AI.' },
        { role: 'user', content: 'Summarize this: Issue is broken' }
      ]
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
