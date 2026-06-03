import 'dotenv/config';
import { fetchWithAIFallback } from './backend/utils/aiRouter.mjs';

async function test() {
  try {
    const res = await fetchWithAIFallback({
      messages: [
        { role: 'system', content: 'You are an AI.' },
        { role: 'user', content: 'Summarize this: Issue is broken' }
      ],
      temperature: 0.5,
      max_tokens: 512
    });
    const data = await res.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
