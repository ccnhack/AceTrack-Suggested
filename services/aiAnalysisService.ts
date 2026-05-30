import config from '../config';

export const aiAnalysisService = {
  async generateAnalysis(evaluationScores, playerName, playerSkillLevel) {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/v1/evaluate/analysis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ace-api-key': config.PUBLIC_APP_ID
        },
        credentials: 'omit',
        body: JSON.stringify({ evaluationScores, playerName, playerSkillLevel })
      });

      const data = await response.json();
      if (data.success) {
        return data.analysis;
      } else {
        throw new Error(data.error || 'Failed to generate analysis');
      }
    } catch (error) {
      console.error('AI Analysis Error:', error);
      throw error;
    }
  }
};
