
import config from '../config';

/**
 * Unified AI Service that provides fallback logic between Gemini and Groq.
 */

export interface ChatMessage {
  role: 'user' | 'model' | 'assistant' | 'system';
  text: string;
}

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";


/**
 * Generates a response using Groq.
 */
export const generateAIResponse = async (messages: ChatMessage[]): Promise<string> => {
  const groqKey = config.GROQ_API_KEY;
  console.log("AI Service: Groq Key present?", !!groqKey);
  
  if (!groqKey) {
    throw new Error("AI Configuration Error: Groq API key is missing.");
  }

  try {
    const groqMessages = messages.map(m => ({
      role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : (m.role === 'user' ? 'user' : 'system'),
      content: m.text
    }));

    console.log("AI Service: Fetching Groq...");
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 1024
      })
    });

    const data = await response.json();
    if (data.choices && data.choices[0] && data.choices[0].message) {
      console.log("AI Service: Groq response success");
      return data.choices[0].message.content;
    }
    
    if (data.error) {
      console.log("AI Service: Groq API Error Data:", JSON.stringify(data));
      throw new Error(data.error.message || "Groq API Error");
    }
  } catch (error: any) {
    console.log("AI Service: Error in generateAIResponse:", error.message);
    throw error;
  }

  throw new Error("Groq AI failed to return a response.");
};

/**
 * Legacy support for specific skill analysis and tournament summaries
 */
export const getQuickAIResponse = async (prompt: string): Promise<string> => {
  return generateAIResponse([{ role: 'user', text: prompt }]);
};
