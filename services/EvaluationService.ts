import logger from '../utils/logger';

class EvaluationService {
  /**
   * Centralizes the logic for saving evaluations and processing referral rewards.
   */
  static async saveEvaluation(evaluation, prevEvaluations, players, currentUser) {
    logger.logAction('EVALUATION_SAVE_START', { evaluationId: evaluation.id, playerId: evaluation.playerId });

    // 1. Update evaluations list
    let updatedEvaluations = prevEvaluations.map(item => item.id === evaluation.id ? evaluation : item);
    if (!prevEvaluations.find(item => item.id === evaluation.id)) {
      updatedEvaluations.unshift(evaluation);
    }

    let updatedPlayers = [...players];
    let updatedCurrentUser = currentUser ? { ...currentUser } : null;

    // 2. Finalize Referral Rewards if this is proof of participation
    const referee = players.find(p => p.id === evaluation.playerId);
    if (referee && referee.referredBy) {
      // Check if this is the first evaluation for this player across all tournaments
      const prevEvalsRec = updatedEvaluations.filter(ev => ev.playerId === evaluation.playerId);
      if (prevEvalsRec.length === 1) { // This is their first match evaluation
        logger.logAction('REFERRAL_REWARD_TRIGGERED', { refereeId: referee.id, referrerId: referee.referredBy });

        updatedPlayers = players.map(p => {
          // Finalize Referee
          if (p.id === referee.id) {
            const refereePendingId = `ref-pending-${p.id}`;
            const history = p.walletHistory || [];
            const entryIdx = history.findIndex(h => h.id === refereePendingId && h.status === 'Pending');
            if (entryIdx > -1) {
              const newHistory = [...history];
              newHistory[entryIdx] = { 
                ...newHistory[entryIdx], 
                status: 'Completed', 
                description: 'Referral Reward (Completed - Played Tournament)' 
              };
              return { ...p, walletHistory: newHistory, credits: (p.credits || 0) + 100 };
            }
          }
          // Finalize Referrer
          if (p.id === referee.referredBy) {
            const referrerPendingId = `bonus-pending-${referee.id}`;
            const history = p.walletHistory || [];
            const entryIdx = history.findIndex(h => h.id === referrerPendingId && h.status === 'Pending');
            if (entryIdx > -1) {
              const newHistory = [...history];
              newHistory[entryIdx] = { 
                ...newHistory[entryIdx], 
                status: 'Completed', 
                description: `Referral Bonus: ${referee.id} (Tournament Played)` 
              };
              return { ...p, walletHistory: newHistory, credits: (p.credits || 0) + 100 };
            }
          }
          return p;
        });

        // Update current user if they are affected
        if (updatedCurrentUser) {
          const me = updatedPlayers.find(p => p.id === updatedCurrentUser.id);
          if (me) {
            updatedCurrentUser = me;
          }
        }
      }
    }

    logger.logAction('EVALUATION_SAVE_SUCCESS', { evaluationId: evaluation.id });

    return {
      evaluations: updatedEvaluations,
      players: updatedPlayers,
      currentUser: updatedCurrentUser,
      success: true
    };
  }
}

export default EvaluationService;
