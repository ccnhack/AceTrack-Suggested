/**
 * 🎯 Matchmaking Utilities — v2.6.566
 * Pure functions for computing opponent suggestions.
 * No side effects, no API calls, no state mutations.
 */

/**
 * Get suggested opponents for a player based on:
 * 1. Same city (highest priority)
 * 2. Similar TrueSkill rating (±300 band)
 * 3. Same preferred sport
 * 4. Not already in an active matchmaking request
 * 5. Not the player themselves
 *
 * @param {Object} currentUser - The logged-in player
 * @param {Array} allPlayers - All players from the players store
 * @param {Array} existingMatchmaking - Current matchmaking entries
 * @param {number} limit - Max suggestions to return (default 3)
 * @returns {Array} Scored and sorted array of player suggestions
 */
export const getSuggestedOpponents = (currentUser, allPlayers, existingMatchmaking = [], limit = 3) => {
  if (!currentUser || !allPlayers || allPlayers.length === 0) return [];

  const myId = currentUser.id;
  const mySkill = currentUser.trueSkillRating || 1000;
  const myCity = (currentUser.city || '').toLowerCase().trim();
  const mySport = currentUser.sport || currentUser.managedSports?.[0] || null;

  // Build set of player IDs that already have active matchmaking with me
  const activeOpponentIds = new Set();
  (existingMatchmaking || []).forEach(m => {
    if (m.status === 'Pending' || m.status === 'Accepted' || m.status === 'Countered') {
      if (m.senderId === myId) activeOpponentIds.add(m.receiverId);
      if (m.receiverId === myId) activeOpponentIds.add(m.senderId);
    }
  });

  // Filter eligible players
  const eligible = allPlayers.filter(p => {
    if (!p || !p.id) return false;
    if (String(p.id) === String(myId)) return false; // Not self
    if (p.role !== 'user') return false; // Only individual players
    if (p.isSuspended || p.isTerminated) return false; // Not suspended
    if (activeOpponentIds.has(p.id)) return false; // No active requests
    return true;
  });

  // Score each eligible player
  const scored = eligible.map(p => {
    let score = 0;

    // City match (highest weight)
    const pCity = (p.city || '').toLowerCase().trim();
    if (myCity && pCity && pCity === myCity) {
      score += 50;
    } else if (myCity && pCity && (pCity.includes(myCity) || myCity.includes(pCity))) {
      score += 25; // Partial city match (e.g., "Bangalore" vs "Bengaluru")
    }

    // TrueSkill proximity (inverse distance, max 30 points)
    const theirSkill = p.trueSkillRating || 1000;
    const skillDiff = Math.abs(mySkill - theirSkill);
    if (skillDiff <= 300) {
      score += Math.max(0, 30 - Math.floor(skillDiff / 10));
    }

    // Sport match
    const theirSport = p.sport || p.managedSports?.[0] || null;
    if (mySport && theirSport && mySport === theirSport) {
      score += 20;
    }

    // Activity bonus (played recently = more likely to be active)
    const matchesPlayed = p.matchesPlayed || 0;
    if (matchesPlayed > 10) score += 10;
    else if (matchesPlayed > 5) score += 5;
    else if (matchesPlayed > 0) score += 2;

    // Skill level alignment
    if (currentUser.skillLevel && p.skillLevel && currentUser.skillLevel === p.skillLevel) {
      score += 10;
    }

    return { ...p, _suggestionScore: score };
  });

  // Sort by score descending, then by name for determinism
  scored.sort((a, b) => {
    if (b._suggestionScore !== a._suggestionScore) return b._suggestionScore - a._suggestionScore;
    return (a.name || '').localeCompare(b.name || '');
  });

  // Return top N with minimum score threshold
  return scored
    .filter(p => p._suggestionScore >= 10) // Must match at least one criterion
    .slice(0, limit);
};

/**
 * Format a suggestion reason string for display.
 */
export const getSuggestionReason = (currentUser, opponent) => {
  const reasons = [];
  
  const myCity = (currentUser?.city || '').toLowerCase();
  const oppCity = (opponent?.city || '').toLowerCase();
  if (myCity && oppCity && myCity === oppCity) {
    reasons.push(`📍 Same city`);
  }

  const mySkill = currentUser?.trueSkillRating || 1000;
  const oppSkill = opponent?.trueSkillRating || 1000;
  if (Math.abs(mySkill - oppSkill) <= 150) {
    reasons.push(`⚡ Similar skill`);
  }

  const mySport = currentUser?.sport || currentUser?.managedSports?.[0];
  const oppSport = opponent?.sport || opponent?.managedSports?.[0];
  if (mySport && oppSport && mySport === oppSport) {
    reasons.push(`🎯 ${mySport}`);
  }

  return reasons.join(' • ') || '🏆 Recommended';
};
