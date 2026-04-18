import { checkMatchWin, createMatch as createBaseMatch } from '../utils/scoringRules';
import logger from '../utils/logger';

/**
 * MATCH SERVICE (Phase 1.3+)
 * Centralizes business logic for matchmaking, challenges, and scoring.
 * Implements the "Triple-Guard" ready logic with mandatory result structures.
 */
class MatchService {
  /**
   * Creates a new match challenge.
   */
  static createChallenge(sender, receiver, date, time, sport, venue) {
    logger.logAction('MATCH_CHALLENGE_CREATE', { senderId: sender.id, receiverId: receiver.id });

    const challenge = {
      id: `match_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
      senderId: sender.id,
      senderName: sender.name,
      receiverId: receiver.id,
      receiverName: receiver.name,
      name: receiver.name, // compatibility
      image: receiver.image,
      proposedDate: date,
      proposedTime: time,
      sport: sport,
      location: venue?.label || venue?.name || 'Local Arena',
      status: 'Pending',
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      isNew: true,
      version: 1
    };

    return {
      success: true,
      code: 'CHALLENGE_CREATED',
      type: 'success',
      data: { 
        updatedMatch: challenge,
        priority: 'MEDIUM'
      },
      notification: {
        type: 'challenge',
        title: 'New Match Challenge',
        message: `${sender.name} has challenged you to a game of ${sport} on ${date} at ${time}.`,
      }
    };
  }

  /**
   * Responds to an existing challenge (Accept, Decline, Cancel).
   */
  static respond(challenge, action, userId, userName, overrides = {}) {
    logger.logAction('MATCH_CHALLENGE_RESPOND', { challengeId: challenge.id, action });

    let updatedChallenge = { 
      ...challenge, 
      lastUpdatedBy: userId,
      lastUpdatedByName: userName,
      lastUpdated: new Date().toISOString(),
      isNew: false,
      ...overrides
    };

    let notification = null;
    let priority = 'MEDIUM';
    let code = 'MATCH_RESPONDED';

    if (action === 'accept') {
      updatedChallenge.status = 'Accepted';
      updatedChallenge.time = challenge.time || `${challenge.proposedDate}, ${challenge.proposedTime}`;
      code = 'MATCH_ACCEPTED';
      priority = 'HIGH';
      notification = {
        type: 'challenge',
        title: 'Challenge Accepted',
        message: `${userName} has accepted your match challenge for ${challenge.sport}!`,
      };
    } else if (action === 'decline') {
      updatedChallenge.status = 'Declined';
      code = 'MATCH_DECLINED';
      priority = 'MEDIUM';
      notification = {
        type: 'challenge',
        title: 'Challenge Declined',
        message: `${userName} has declined your match challenge for ${challenge.sport}.`,
      };
    } else if (action === 'cancel') {
      updatedChallenge.status = 'Cancelled';
      code = 'MATCH_CANCELLED';
      priority = 'HIGH';
    }

    return {
      success: true,
      code,
      type: 'success',
      data: { 
        updatedMatch: updatedChallenge,
        priority
      },
      notification
    };
  }

  /**
   * Proposes a counter-offer for an existing challenge.
   */
  static proposeCounter(challenge, userId, userName, date, time, venue, comment) {
    logger.logAction('MATCH_CHALLENGE_COUNTER', { challengeId: challenge.id });

    const updatedChallenge = {
      ...challenge,
      originalChallengerDate: challenge.originalChallengerDate || challenge.proposedDate || challenge.time?.split(',')[0]?.trim(),
      originalChallengerTime: challenge.originalChallengerTime || challenge.proposedTime || challenge.time?.split(',')[1]?.trim(),
      proposedDate: date,
      proposedTime: time,
      location: venue?.label || venue?.name || challenge.location,
      myCounterDate: date,
      myCounterTime: time,
      counterComment: comment?.trim() || null,
      status: 'Countered',
      isNew: false,
      lastUpdatedBy: userId,
      lastUpdatedByName: userName,
      lastUpdated: new Date().toISOString(),
      hasUserResponse: false
    };

    return {
      success: true,
      code: 'MATCH_COUNTERED',
      type: 'success',
      data: { 
        updatedMatch: updatedChallenge,
        priority: 'MEDIUM'
      }
    };
  }

  /**
   * Finalizes a match with scores, using the scoring rules engine.
   */
  static finalizeMatch(match, sets, sport) {
    const result = checkMatchWin(sets, sport);
    const winnerId = result.winner === 1 ? match.player1Id : (result.winner === 2 ? match.player2Id : null);

    const finalizedMatch = {
      ...match,
      status: 'Completed',
      endTime: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      sets,
      winnerId,
      winner: winnerId,
      resultText: `${sets[0].score1}-${sets[0].score2}${sets.length > 1 ? ', ...' : ''}` // simplified summary
    };

    return {
      success: true,
      code: 'MATCH_COMPLETED',
      type: 'success',
      data: { 
        updatedMatch: finalizedMatch,
        priority: 'HIGH'
      },
      winnerId
    };
  }

  /**
   * Confirms a booking (Special for Coaches/Academies).
   */
  static confirmBooking(match, userId, userName) {
    const updatedMatch = {
      ...match,
      status: 'Accepted',
      lastUpdatedBy: userId,
      lastUpdatedByName: userName,
      lastUpdated: new Date().toISOString(),
      time: match.proposedTime ? `${match.proposedDate}, ${match.proposedTime}` : match.time
    };

    return {
      success: true,
      code: 'BOOKING_CONFIRMED',
      type: 'success',
      data: {
        updatedMatch,
        priority: 'HIGH'
      }
    };
  }

  /**
   * Logic for removing expired entries.
   */
  static removeExpired(matchId) {
    return {
      success: true,
      code: 'MATCH_EXPIRED_REMOVED',
      type: 'info',
      data: {
        removedMatchIds: [matchId],
        priority: 'LOW'
      }
    };
  }

  /**
   * Logic for bulk removing expired entries.
   */
  static removeAllExpired(expiredIds) {
    return {
      success: true,
      code: 'ALL_EXPIRED_REMOVED',
      type: 'info',
      data: {
        removedMatchIds: expiredIds,
        priority: 'LOW'
      }
    };
  }
}

export default MatchService;
