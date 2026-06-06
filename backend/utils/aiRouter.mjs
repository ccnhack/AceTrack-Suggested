// 🛡️ [AI_ROUTER_V2] (v2.6.617): Hardened AI Router with retry, failover, and timeout
// - AbortController timeout per request (default 5s)
// - Groq↔Cerebras bidirectional failover on error/429/5xx
// - 3-retry mechanism with exponential backoff
// - Never throws — returns a synthetic error response on total failure

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const CEREBRAS_MODEL = "llama3.3-70b";

/**
 * Makes a single AI API call with AbortController timeout.
 * @returns {Response|null} The fetch response, or null on failure.
 */
async function callProvider(url, apiKey, model, messages, temperature, max_tokens, timeoutMs) {
   const controller = new AbortController();
   const timer = setTimeout(() => controller.abort(), timeoutMs);

   try {
      const res = await fetch(url, {
         method: 'POST',
         headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
         body: JSON.stringify({ model, messages, temperature, max_tokens }),
         signal: controller.signal
      });
      clearTimeout(timer);
      return res;
   } catch (err) {
      clearTimeout(timer);
      const reason = err.name === 'AbortError' ? 'TIMEOUT' : err.message;
      console.warn(`[AI_ROUTER] Provider ${url.includes('groq') ? 'Groq' : 'Cerebras'} failed: ${reason}`);
      return null;
   }
}

/**
 * Determines if a response should trigger failover/retry.
 */
function shouldRetry(res) {
   if (!res) return true; // Network error / timeout
   if (res.status === 429) return true; // Rate limited
   if (res.status >= 500) return true; // Server error
   return false;
}

/**
 * Fetches an AI completion with retry + Groq↔Cerebras failover.
 *
 * Retry strategy (3 attempts total):
 *   Attempt 1: Primary provider
 *   Attempt 2: Alternate provider (failover)
 *   Attempt 3: Primary provider again (in case of transient failure)
 *
 * @param {Object} options
 * @param {Array} options.messages - Chat messages array
 * @param {number} [options.temperature=0.3]
 * @param {number} [options.max_tokens=512]
 * @param {string} [options.model] - Override model name
 * @param {string} [options.apiKey] - Override API key
 * @param {number} [options.timeoutMs=5000] - Per-request timeout in ms
 * @param {number} [options.maxRetries=3] - Max retry attempts
 * @returns {Response} A fetch Response (real or synthetic error)
 */
export async function fetchWithAIFallback(options) {
   const {
      messages,
      temperature = 0.3,
      max_tokens = 512,
      model,
      apiKey,
      timeoutMs = 5000,
      maxRetries = 3
   } = options;

   const groqKey = apiKey || process.env.GROQ_API_KEY;
   const cerebrasKey = process.env.CEREBRAS_API_KEY;

   if (!groqKey && !cerebrasKey) {
      throw new Error("AI_API_KEY is not set (neither GROQ nor CEREBRAS)");
   }

   // Build provider list: [primary, alternate]
   const providers = [];
   if (groqKey) {
      providers.push({ url: GROQ_URL, key: groqKey, model: model || GROQ_MODEL, name: 'Groq' });
   }
   if (cerebrasKey) {
      providers.push({ url: CEREBRAS_URL, key: cerebrasKey, model: CEREBRAS_MODEL, name: 'Cerebras' });
   }

   // If only one provider is available, all retries go to it
   // If two providers: attempt 1 → primary, attempt 2 → alternate, attempt 3 → primary
   const BACKOFF_MS = [500, 1000, 2000];
   let lastResponse = null;

   for (let attempt = 0; attempt < maxRetries; attempt++) {
      const providerIdx = providers.length > 1 ? (attempt % 2) : 0;
      const provider = providers[providerIdx];

      if (attempt > 0) {
         const delay = BACKOFF_MS[Math.min(attempt - 1, BACKOFF_MS.length - 1)];
         console.log(`[AI_ROUTER] Retry ${attempt}/${maxRetries - 1} after ${delay}ms → ${provider.name}`);
         await new Promise(r => setTimeout(r, delay));
      }

      const res = await callProvider(
         provider.url, provider.key, provider.model,
         messages, temperature, max_tokens, timeoutMs
      );

      if (res && !shouldRetry(res)) {
         // Success (2xx or 4xx client error that shouldn't be retried)
         return res;
      }

      if (res) {
         lastResponse = res;
         const statusHint = res.status === 429 ? 'RATE_LIMITED' : `HTTP_${res.status}`;
         console.warn(`[AI_ROUTER] ${provider.name} returned ${statusHint} (attempt ${attempt + 1}/${maxRetries})`);
      }
   }

   // All retries exhausted — return last response if we got one, or a synthetic error
   if (lastResponse) {
      console.error(`[AI_ROUTER] All ${maxRetries} attempts failed. Returning last response (status: ${lastResponse.status})`);
      return lastResponse;
   }

   // Total network failure — return a synthetic Response so callers don't crash
   console.error(`[AI_ROUTER] All ${maxRetries} attempts failed with network errors. Returning synthetic error.`);
   return new Response(
      JSON.stringify({ error: { message: 'All AI providers unreachable after retries' }, choices: [] }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
   );
}
