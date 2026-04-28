
import config from '../config';

/**
 * Unified AI Service that provides fallback logic between Gemini and Groq.
 */

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  text: string;
}

/**
 * Generates a response using Groq via Backend Proxy.
 */
export const generateAIResponse = async (messages: ChatMessage[]): Promise<string> => {
  try {
    const groqMessages = messages.map(m => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'),
      content: String(m.text || '')
    }));

    console.log("AI Service: Requesting summary from backend proxy...");
    const response = await fetch(`${config.API_BASE_URL}/api/support/ai-summary`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ace-api-key': config.PUBLIC_APP_ID
      },
      credentials: 'include',
      body: JSON.stringify({ messages: groqMessages })
    });

    const data = await response.json();
    if (data.success && data.text) {
      console.log("AI Service: Response success");
      return data.text;
    }
    
    if (data.error) {
      console.error("AI Service: Backend Proxy API Error:", data.error);
      throw new Error(data.error.message || data.error || "Backend AI Proxy Error");
    }
  } catch (error: any) {
    console.error("AI Service: Error in generateAIResponse:", error.message);
    throw error;
  }

  throw new Error("AI failed to return a response.");
};

/**
 * Legacy support for specific skill analysis and tournament summaries
 */
export const getQuickAIResponse = async (prompt: string): Promise<string> => {
  return generateAIResponse([{ role: 'user', text: prompt }]);
};
