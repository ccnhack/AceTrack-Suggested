import 'dotenv/config';
async function run() {
  const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "llama-3.3-70b",
      messages: [{ role: 'system', content: 'You are an AI.' }, { role: 'user', content: 'Hello' }],
      max_tokens: 10
    })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}
run();
