/**
 * 📊 Leaderboard Utilities — v2.6.566
 * Pure functions for computing weekly and all-time leaderboards.
 * No side effects, no API calls, no state mutations.
 */

/**
 * Compute a weekly leaderboard based on recent tournament results.
 * Ranks players by: wins in the last 7 days, then by total wins, then by TrueSkill.
 *
 * @param {Array} players - All players from the store
 * @param {Array} tournaments - All tournaments from the store
 * @param {number} now - Current timestamp (for testability)
 * @param {number} limit - Max entries (default 10)
 * @returns {Array} Ranked player entries
 */
export const getWeeklyLeaderboard = (players, tournaments, now = Date.now(), limit = 10) => {
  if (!players || !tournaments) return [];

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toISOString().split('T')[0];

  // Find tournaments completed in the last 7 days
  const recentTournaments = tournaments.filter(t => 
    (t.status === 'completed' || t.tournamentConcluded) &&
    t.date >= weekAgoStr
  );

  // Count recent wins per player
  const recentWins = {};
  const recentMatches = {};
  
  recentTournaments.forEach(t => {
    const roundDecisions = t.roundDecisions || {};
    Object.values(roundDecisions).forEach(roundMap => {
      Object.entries(roundMap).forEach(([playerId, decision]) => {
        if (decision === 'Qualified') {
          recentWins[playerId] = (recentWins[playerId] || 0) + 1;
        }
        recentMatches[playerId] = (recentMatches[playerId] || 0) + 1;
      });
    });

    // Also count from playerStatuses if roundDecisions is sparse
    const statuses = t.playerStatuses || {};
    Object.entries(statuses).forEach(([playerId, status]) => {
      if (status === 'Qualified' && !recentWins[playerId]) {
        recentWins[playerId] = (recentWins[playerId] || 0) + 1;
      }
    });
  });

  // Build leaderboard entries
  const entries = players
    .filter(p => p && p.id && p.role === 'user' && !p.isSuspended && !p.isTerminated)
    .map(p => {
      const weekWins = recentWins[p.id] || 0;
      const weekMatches = recentMatches[p.id] || 0;
      const totalWins = p.wins || 0;
      const totalMatches = p.matchesPlayed || 0;
      const trueSkill = p.trueSkillRating || 1000;

      // Composite score: recent activity weighted heavily
      const score = (weekWins * 100) + (totalWins * 5) + trueSkill;

      return {
        id: p.id,
        name: p.name || 'Unknown',
        avatar: p.avatar,
        sport: p.sport || p.managedSports?.[0] || 'Multi-sport',
        city: p.city || '',
        trueSkill: Math.round(trueSkill),
        weekWins,
        weekMatches,
        totalWins,
        totalMatches,
        score,
      };
    })
    .filter(e => e.score > 1000) // Must have at least some activity
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));

  return entries;
};

/**
 * Get a medal emoji for rank position.
 */
export const getRankEmoji = (rank) => {
  switch (rank) {
    case 1: return '🥇';
    case 2: return '🥈';
    case 3: return '🥉';
    default: return `#${rank}`;
  }
};

/**
 * Get rank color for styling.
 */
export const getRankColor = (rank) => {
  switch (rank) {
    case 1: return '#F59E0B'; // Gold
    case 2: return '#94A3B8'; // Silver
    case 3: return '#CD7F32'; // Bronze
    default: return '#64748B';
  }
};
