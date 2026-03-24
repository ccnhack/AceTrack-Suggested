/**
 * 📐 AceTrack Scoring Rules Engine
 * Expert Panel Fix: Multi-set scoring with deuce handling
 * Supports: Badminton (Best of 3, to 21) and Table Tennis (Best of 5/7, to 11)
 */

export const SPORT_RULES = {
  badminton: {
    name: 'Badminton',
    pointsToWin: 21,
    deuceAt: 20,
    maxPoints: 30,         // Cap at 30-29
    winByMargin: 2,
    bestOf: 3,
    serviceRotation: null, // No fixed rotation in singles
  },
  tabletennis: {
    name: 'Table Tennis',
    pointsToWin: 11,
    deuceAt: 10,
    maxPoints: null,       // No cap, win by 2
    winByMargin: 2,
    bestOf: 5,
    serviceRotation: 2,    // Rotate every 2 points (1 in deuce)
  },
  cricket: {
    name: 'Cricket',
    pointsToWin: null,     // No fixed points
    bestOf: 1,
    serviceRotation: null,
  }
};

/**
 * Check if a set has been won
 * @param {number} score1 - Player 1 score
 * @param {number} score2 - Player 2 score
 * @param {string} sport - 'badminton' or 'tabletennis'
 * @returns {{ won: boolean, winner: number|null }}
 */
export const checkSetWin = (score1, score2, sport = 'badminton') => {
  const rules = SPORT_RULES[sport];
  if (!rules || !rules.pointsToWin) return { won: false, winner: null };

  const { pointsToWin, deuceAt, maxPoints, winByMargin } = rules;

  // Normal win
  if (score1 >= pointsToWin && score2 < deuceAt) return { won: true, winner: 1 };
  if (score2 >= pointsToWin && score1 < deuceAt) return { won: true, winner: 2 };

  // Deuce win (win by margin)
  if (score1 >= deuceAt && score2 >= deuceAt) {
    // Cap check (badminton: 30-29)
    if (maxPoints && score1 >= maxPoints) return { won: true, winner: 1 };
    if (maxPoints && score2 >= maxPoints) return { won: true, winner: 2 };
    
    if (score1 - score2 >= winByMargin) return { won: true, winner: 1 };
    if (score2 - score1 >= winByMargin) return { won: true, winner: 2 };
  }

  return { won: false, winner: null };
};

/**
 * Check if a match has been won (Best of N sets)
 * @param {Array<{score1: number, score2: number}>} sets
 * @param {string} sport
 * @returns {{ won: boolean, winner: number|null, setsWon: [number, number] }}
 */
export const checkMatchWin = (sets, sport = 'badminton') => {
  const rules = SPORT_RULES[sport];
  const setsToWin = Math.ceil(rules.bestOf / 2);
  
  let p1Sets = 0;
  let p2Sets = 0;
  
  sets.forEach(set => {
    const result = checkSetWin(set.score1, set.score2, sport);
    if (result.won) {
      if (result.winner === 1) p1Sets++;
      else p2Sets++;
    }
  });
  
  if (p1Sets >= setsToWin) return { won: true, winner: 1, setsWon: [p1Sets, p2Sets] };
  if (p2Sets >= setsToWin) return { won: true, winner: 2, setsWon: [p1Sets, p2Sets] };
  
  return { won: false, winner: null, setsWon: [p1Sets, p2Sets] };
};

/**
 * Determine if we're in deuce
 * @param {number} score1
 * @param {number} score2
 * @param {string} sport
 * @returns {boolean}
 */
export const isDeuce = (score1, score2, sport = 'badminton') => {
  const rules = SPORT_RULES[sport];
  if (!rules || !rules.deuceAt) return false;
  return score1 >= rules.deuceAt && score2 >= rules.deuceAt;
};

/**
 * Get who should serve next
 * @param {number} totalPoints - Total points in current set
 * @param {boolean} inDeuce - Whether we're in deuce
 * @param {number} firstServer - 1 or 2
 * @param {string} sport
 * @returns {number} 1 or 2
 */
export const getServer = (totalPoints, inDeuce, firstServer, sport = 'badminton') => {
  const rules = SPORT_RULES[sport];
  if (!rules.serviceRotation) return firstServer;
  
  const rotationInterval = inDeuce ? 1 : rules.serviceRotation;
  const rotations = Math.floor(totalPoints / rotationInterval);
  
  return rotations % 2 === 0 ? firstServer : (firstServer === 1 ? 2 : 1);
};

/**
 * Format set scores for display
 * @param {Array<{score1: number, score2: number}>} sets
 * @returns {string} e.g., "21-18, 19-21, 21-15"
 */
export const formatSetScores = (sets) => {
  return sets.map(s => `${s.score1}-${s.score2}`).join(', ');
};

/**
 * Create an empty match with multi-set support
 */
export const createMatch = (player1Id, player2Id, sport = 'badminton', options = {}) => {
  const rules = SPORT_RULES[sport];
  return {
    id: `match_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    player1Id,
    player2Id,
    sport,
    bestOf: options.bestOf || rules.bestOf,
    sets: [{ score1: 0, score2: 0 }],
    currentSet: 0,
    status: 'scheduled', // scheduled | warmup | live | completed
    winner: null,
    startTime: null,
    endTime: null,
    court: options.court || null,
    round: options.round || null,
    tournamentId: options.tournamentId || null,
    warmupDuration: options.warmupDuration || 5, // minutes
    coachNotes: [],
    bookmarks: [], // Video timestamp bookmarks
    serviceRotation: {
      firstServer: 1,
      currentServer: 1
    }
  };
};
