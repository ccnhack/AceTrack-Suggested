/**
 * 🏟️ Tournament Utilities — Templates, Waitlist, Refunds, Sponsors, Staff
 * OWNER Fixes: Various academy management features
 */

/**
 * Clone a tournament as a template
 * @param {Object} sourceTournament - The tournament to clone
 * @param {Object} overrides - Fields to override (e.g., new date, title)
 * @returns {Object} New tournament object
 */
export const cloneTournament = (sourceTournament, overrides = {}) => {
  const clone = {
    ...sourceTournament,
    id: `tournament_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: overrides.title || `${sourceTournament.title} (Copy)`,
    date: overrides.date || '',
    registrationDeadline: overrides.registrationDeadline || '',
    status: 'Upcoming',
    registeredPlayerIds: [],
    waitlistedPlayerIds: [],
    matches: [],
    results: null,
    createdAt: new Date().toISOString(),
    // Keep configurable fields from source
    sport: overrides.sport || sourceTournament.sport,
    entryFee: overrides.entryFee ?? sourceTournament.entryFee,
    maxPlayers: overrides.maxPlayers || sourceTournament.maxPlayers,
    location: overrides.location || sourceTournament.location,
    city: overrides.city || sourceTournament.city,
    skillLevel: overrides.skillLevel || sourceTournament.skillLevel,
    prizePool: overrides.prizePool || sourceTournament.prizePool,
    format: overrides.format || sourceTournament.format,
    courts: overrides.courts || sourceTournament.courts || [],
    sponsorName: overrides.sponsorName || sourceTournament.sponsorName || '',
    sponsorLogoUrl: overrides.sponsorLogoUrl || sourceTournament.sponsorLogoUrl || '',
    refundPolicy: overrides.refundPolicy || sourceTournament.refundPolicy || null,
    staffIds: [],
    ...overrides,
  };
  return clone;
};

/**
 * Add a player to the waitlist
 * @param {Object} tournament
 * @param {string} playerId
 * @returns {Object} Updated tournament
 */
export const addToWaitlist = (tournament, playerId) => {
  const waitlist = tournament.waitlistedPlayerIds || [];
  if (waitlist.includes(playerId)) return tournament;
  if ((tournament.registeredPlayerIds || []).includes(playerId)) return tournament;
  
  return {
    ...tournament,
    waitlistedPlayerIds: [...waitlist, playerId]
  };
};

/**
 * Promote the next waitlisted player when a spot opens
 * @param {Object} tournament
 * @returns {{ tournament: Object, promotedPlayerId: string|null }}
 */
export const promoteFromWaitlist = (tournament) => {
  const waitlist = tournament.waitlistedPlayerIds || [];
  if (waitlist.length === 0) return { tournament, promotedPlayerId: null };
  
  const [promoted, ...remaining] = waitlist;
  return {
    tournament: {
      ...tournament,
      registeredPlayerIds: [...(tournament.registeredPlayerIds || []), promoted],
      waitlistedPlayerIds: remaining
    },
    promotedPlayerId: promoted
  };
};

/**
 * Calculate refund amount based on policy
 * @param {Object} tournament
 * @param {Date} cancellationDate
 * @returns {{ refundAmount: number, refundPercent: number, reason: string }}
 */
export const calculateRefund = (tournament, cancellationDate = new Date()) => {
  const policy = tournament.refundPolicy;
  const entryFee = tournament.entryFee || 0;
  
  // No policy = full refund
  if (!policy) return { refundAmount: entryFee, refundPercent: 100, reason: 'No refund policy — full refund' };
  
  const deadline = new Date(policy.deadline);
  const now = cancellationDate instanceof Date ? cancellationDate : new Date(cancellationDate);
  
  if (now <= deadline) {
    const amount = Math.round(entryFee * (policy.refundPercent / 100));
    return { refundAmount: amount, refundPercent: policy.refundPercent, reason: `Cancelled before deadline (${policy.refundPercent}% refund)` };
  }
  
  // After deadline
  const latePercent = policy.lateRefundPercent || 0;
  const amount = Math.round(entryFee * (latePercent / 100));
  return { refundAmount: amount, refundPercent: latePercent, reason: latePercent > 0 ? `Late cancellation (${latePercent}% refund)` : 'No refund after deadline' };
};

/**
 * Generate CSV report for tournament financials
 * @param {Object} tournament
 * @param {Array} players
 * @returns {string} CSV content
 */
export const generateFinancialCSV = (tournament, players) => {
  const registered = (tournament.registeredPlayerIds || []);
  const rows = [['Player Name', 'Username', 'Entry Fee', 'Payment Status', 'Refund Status', 'Registration Date']];
  
  registered.forEach(playerId => {
    const player = players.find(p => p.id === playerId);
    if (player) {
      const status = (tournament.playerStatuses || {})[playerId] || 'Registered';
      rows.push([
        player.name || player.firstName || '—',
        player.username || '—',
        `₹${tournament.entryFee || 0}`,
        status === 'Denied' ? 'Refunded' : 'Paid',
        status === 'Denied' ? 'Issued' : 'N/A',
        new Date().toLocaleDateString('en-IN')
      ]);
    }
  });
  
  // Summary row
  rows.push([]);
  rows.push(['TOTAL', '', `₹${registered.length * (tournament.entryFee || 0)}`, `${registered.length} players`, '', '']);
  rows.push(['Prize Pool', '', `₹${tournament.prizePool || 0}`, '', '', '']);
  rows.push(['Net Revenue', '', `₹${(registered.length * (tournament.entryFee || 0)) - (tournament.prizePool || 0)}`, '', '', '']);
  
  return rows.map(row => row.join(',')).join('\n');
};

/**
 * Get tournament analytics
 * @param {Array} tournaments - All tournaments for an academy
 * @returns {Object}
 */
export const getTournamentAnalytics = (tournaments) => {
  const completed = tournaments.filter(t => t.status === 'Completed');
  const upcoming = tournaments.filter(t => t.status === 'Upcoming');
  
  const totalRevenue = completed.reduce((sum, t) => {
    const players = (t.registeredPlayerIds || []).length;
    return sum + (players * (t.entryFee || 0));
  }, 0);
  
  const totalPlayers = completed.reduce((sum, t) => sum + (t.registeredPlayerIds || []).length, 0);
  const avgFillRate = completed.length > 0
    ? completed.reduce((sum, t) => {
        const fill = (t.registeredPlayerIds || []).length / (t.maxPlayers || 16);
        return sum + fill;
      }, 0) / completed.length
    : 0;
  
  // Monthly revenue breakdown
  const monthlyRevenue = {};
  completed.forEach(t => {
    const month = new Date(t.date).toLocaleDateString('en-IN', { year: 'numeric', month: 'short' });
    const revenue = (t.registeredPlayerIds || []).length * (t.entryFee || 0);
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + revenue;
  });
  
  return {
    totalTournaments: tournaments.length,
    completedCount: completed.length,
    upcomingCount: upcoming.length,
    totalRevenue,
    totalPlayers,
    avgFillRate: Math.round(avgFillRate * 100),
    avgPlayersPerTournament: completed.length > 0 ? Math.round(totalPlayers / completed.length) : 0,
    monthlyRevenue,
  };
};

/**
 * Create a default refund policy
 * @param {number} daysBeforeTournament
 * @param {number} fullRefundPercent
 * @param {number} lateRefundPercent
 * @returns {Object}
 */
export const createRefundPolicy = (tournamentDate, daysBeforeDeadline = 3, fullRefundPercent = 100, lateRefundPercent = 0) => {
  const deadline = new Date(tournamentDate);
  deadline.setDate(deadline.getDate() - daysBeforeDeadline);
  
  return {
    deadline: deadline.toISOString(),
    refundPercent: fullRefundPercent,
    lateRefundPercent,
    daysBeforeDeadline,
  };
};

export default {
  cloneTournament,
  addToWaitlist,
  promoteFromWaitlist,
  calculateRefund,
  generateFinancialCSV,
  getTournamentAnalytics,
  createRefundPolicy,
};
