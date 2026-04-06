/**
 * 🎁 Referral System Utilities
 * PM Fix: Referral codes and reward tracking
 */

/**
 * Generate a unique referral code from a username
 * @param {string} username
 * @returns {string} e.g., "ACE-SHASHANK"
 */
export const generateReferralCode = (username) => {
  const clean = String(username || 'user')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .substring(0, 10);
  return `ACE-${clean}`;
};

/**
 * Validate a referral code format
 * @param {string} code
 * @returns {boolean}
 */
export const isValidReferralCode = (code) => {
  return /^ACE-[A-Z0-9]{2,10}$/.test(String(code).toUpperCase());
};

/**
 * Apply referral reward to both referrer and referee
 * @param {Object} players - Array of players
 * @param {string} referrerId - The referrer's player ID
 * @param {string} refereeId - The new user's player ID
 * @param {number} rewardAmount - Credits to award (default ₹50)
 * @returns {Object} Updated players array
 */
export const applyReferralReward = (players, referrerId, refereeId, rewardAmount = 50) => {
  return players.map(player => {
    if (player.id === referrerId) {
      return {
        ...player,
        walletCredits: (player.walletCredits || 0) + rewardAmount,
        referralCount: (player.referralCount || 0) + 1,
        referralHistory: [
          ...(player.referralHistory || []),
          { refereeId, amount: rewardAmount, date: new Date().toISOString() }
        ]
      };
    }
    if (player.id === refereeId) {
      return {
        ...player,
        walletCredits: (player.walletCredits || 0) + rewardAmount,
        referredBy: referrerId,
      };
    }
    return player;
  });
};

/**
 * Find a player by referral code
 * @param {Array} players
 * @param {string} code
 * @returns {Object|null}
 */
export const findPlayerByReferralCode = (players, code) => {
  const clean = String(code).toUpperCase();
  return players.find(p => (p.referralCode && p.referralCode.toUpperCase() === clean) || generateReferralCode(p.username) === clean) || null;
};

/**
 * Get referral stats for a player
 * @param {Object} player
 * @returns {Object}
 */
export const getReferralStats = (player) => {
  const history = player.referralHistory || [];
  return {
    code: player.referralCode || generateReferralCode(player.username),
    totalReferrals: history.length,
    totalEarned: history.reduce((sum, r) => sum + r.amount, 0),
    recentReferrals: history.slice(-5).reverse(),
  };
};
