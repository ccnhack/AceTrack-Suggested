export async function fetchWithAIFallback(options) {
   const {
      messages,
      temperature = 0.3,
      max_tokens = 512,
      model = "llama-3.3-70b-versatile",
      apiKey = process.env.GROQ_API_KEY
   } = options;

   if (!apiKey) throw new Error("GROQ_API_KEY is not set");

   let req = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, temperature, max_tokens })
   });

   if (req.status === 429 && process.env.CEREBRAS_API_KEY) {
      console.log("[AI_ROUTER] Groq rate limit hit (429). Failing over to Cerebras API.");
      req = await fetch("https://api.cerebras.ai/v1/chat/completions", {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${process.env.CEREBRAS_API_KEY}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({
            model: "llama3.3-70b",
            messages,
            temperature,
            max_tokens
         })
      });
   }

   return req;
}
