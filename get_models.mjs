import 'dotenv/config';
async function run() {
  const res = await fetch("https://api.cerebras.ai/v1/models", {
    headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}` }
  });
  const data = await res.json();
  console.log(data);
}
run();
