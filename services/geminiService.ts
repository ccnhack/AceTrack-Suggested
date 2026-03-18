import config from '../config';
import { getQuickAIResponse } from './aiService';

/**
 * Legacy support for specific skill analysis and tournament summaries.
 * Now routed through the unified aiService for Gemini-to-Groq fallback.
 */

export const generateContent = async (prompt: string): Promise<string> => {
  return getQuickAIResponse(prompt);
};

export const generateTournamentRecap = async (tournamentTitle: string, winnerName: string) => {
  const prompt = `Write a short, exciting 2-sentence summary for a sports app about a tournament called "${tournamentTitle}" won by ${winnerName}. Make it feel professional and motivating.`;
  
  try {
    const responseText = await getQuickAIResponse(prompt);
    return responseText || "A great display of skill and sportsmanship!";
  } catch (error) {
    console.error("Tournament Recap Error:", error);
    return "A fantastic finish to a hard-fought competition!";
  }
};

export const getSmartSkillAnalysis = async (wins: number, losses: number, sport: string, role?: string) => {
  let prompt = `A player has ${wins} wins and ${losses} losses in amateur ${sport}. Provide a very brief (1 sentence) encouraging coaching tip based on this ratio.`;
  
  if (role === 'coach') {
    prompt = `Provide a very brief (1 sentence) encouraging and professional quote for a sports coach profile.`;
  } else if (role === 'academy') {
    prompt = `Provide a very brief (1 sentence) encouraging and professional quote for a sports academy profile.`;
  }

  try {
    const responseText = await getQuickAIResponse(prompt);
    return responseText || (role === 'coach' ? "Inspiring athletes to reach their full potential." : "Great effort in your matches!");
  } catch (error) {
    console.error("Skill Analysis Error:", error);
    if (role === 'coach') return "Inspiring athletes to reach their full potential.";
    if (role === 'academy') return "Building the next generation of champions.";
    return "Great effort in your matches!";
  }
};
