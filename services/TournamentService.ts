import logger from '../utils/logger';

/**
 * TOURNAMENT SERVICE (Phase 1.1)
 * Centralized business logic for tournament operations.
 */
class TournamentService {
  /**
   * Normalizes an ID for consistent comparison.
   * Handles case-sensitivity and underscore variations.
   */
  static normalizeId(id) {
    if (!id) return '';
    return String(id).replace(/_/g, '').toLowerCase().trim();
  }

  /**
   * Registers a user for a tournament.
   * Handles capacity checks and referral bonuses.
   */
  static register(tid, userId, tournaments, players, currentUser) {
    logger.logAction('TOURNAMENT_REGISTER_START', { tid, userId });

    const tournament = tournaments.find(t => t.id === tid);
    if (!tournament) return { success: false, message: 'Tournament not found' };

    // 1. Capacity Guard
    const registeredCount = (tournament.registeredPlayerIds || []).length;
    const isFull = registeredCount >= (tournament.maxPlayers || Infinity);
    const wasAlreadyRegistered = (tournament.registeredPlayerIds || []).includes(userId);

    if (isFull && !wasAlreadyRegistered) {
      logger.logAction('TOURNAMENT_REGISTER_FULL', { tid, userId });
      // Cleanup pending payment if they were in that state
      const updatedTournaments = tournaments.map(t => {
        if (t.id === tid) {
          const ts = { ...(t.pendingPaymentTimestamps || {}) };
          delete ts[userId];
          return {
            ...t,
            pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => pid !== userId),
            pendingPaymentTimestamps: ts,
            playerStatuses: (() => {
               const ps = { ...(t.playerStatuses || {}) };
               delete ps[userId];
               return ps;
            })()
          };
        }
        return t;
      });
      return { success: false, message: 'Slots Full', type: 'FULL', tournaments: updatedTournaments };
    }

    // 2. Update Tournament State
    const updatedTournaments = tournaments.map(t => {
      if (t.id === tid) {
        return {
          ...t,
          registeredPlayerIds: [...new Set([...(t.registeredPlayerIds || []), userId])],
          pendingPaymentPlayerIds: (t.pendingPaymentPlayerIds || []).filter(pid => pid !== userId),
          pendingPaymentTimestamps: (() => {
            const ts = { ...(t.pendingPaymentTimestamps || {}) };
            delete ts[userId];
            return ts;
          })(),
          waitlistedPlayerIds: (t.waitlistedPlayerIds || []).filter(pid => pid !== userId),
          optedOutPlayerIds: (t.optedOutPlayerIds || []).filter(pid => pid !== userId),
          playerStatuses: (() => {
            const rest = { ...(t.playerStatuses || {}) };
            delete rest[userId];
            return rest;
          })()
        };
      }
      return t;
    });

    // 3. Referral Bonus Logic
    const isFirstRegistration = (currentUser.registeredTournamentIds || []).length === 0;
    const referralBonus = (isFirstRegistration && currentUser.referredBy) ? 100 : 0;
    
    let updatedCurrentUser = {
      ...currentUser,
      registeredTournamentIds: [...new Set([...(currentUser.registeredTournamentIds || []), tid])]
    };

    if (referralBonus > 0) {
      updatedCurrentUser.credits = (updatedCurrentUser.credits || 0) + referralBonus;
      updatedCurrentUser.walletHistory = [
        { id: `ref-ref-${Date.now()}`, amount: referralBonus, type: 'credit', description: `Referral Reward (Referee Bonus)`, date: new Date().toISOString() },
        ...(updatedCurrentUser.walletHistory || [])
      ];
    }

    let updatedPlayers = players.map(p => 
      String(p.id).toLowerCase() === String(userId).toLowerCase() ? updatedCurrentUser : p
    );

    if (referralBonus > 0 && currentUser.referredBy) {
      const referrerId = currentUser.referredBy;
      updatedPlayers = updatedPlayers.map(p => {
        if (String(p.id).toLowerCase() === String(referrerId).toLowerCase()) {
          return {
            ...p,
            credits: (p.credits || 0) + 100,
            walletHistory: [
              { id: `ref-sor-${Date.now()}`, amount: 100, type: 'credit', description: `Referral Reward (Referrer Bonus for ${updatedCurrentUser.name})`, date: new Date().toISOString() },
              ...(p.walletHistory || [])
            ]
          };
        }
        return p;
      });
    }

    logger.logAction('TOURNAMENT_REGISTER_SUCCESS', { tid, userId, bonus: referralBonus });

    return {
      success: true,
      tournaments: updatedTournaments,
      players: updatedPlayers,
      currentUser: updatedCurrentUser,
      referralBonus
    };
  }

  /**
   * Opts a user out of a tournament.
   * Handles waitlist promotion and notifications.
   */
  static optOut(tid, userId, tournaments, players, currentUser) {
    logger.logAction('TOURNAMENT_OPTOUT_START', { tid, userId });

    let updatedPlayers = [...players];
    let updatedCurrentUser = { ...currentUser };

    const updatedTournaments = tournaments.map(item => {
      if (item.id !== tid) return item;

      const wasRegistered = (item.registeredPlayerIds || []).some(pid => String(pid).toLowerCase() === String(userId).toLowerCase());
      
      let updatedItem = {
        ...item,
        registeredPlayerIds: (item.registeredPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(userId).toLowerCase()),
        pendingPaymentPlayerIds: (item.pendingPaymentPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(userId).toLowerCase()),
        waitlistedPlayerIds: (item.waitlistedPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(userId).toLowerCase()),
        optedOutPlayerIds: [...new Set([...(item.optedOutPlayerIds || []), userId.toLowerCase()])],
        playerStatuses: { ...(item.playerStatuses || {}), [userId.toLowerCase()]: 'Opted-Out' }
      };

      // Auto-promote waitlisted player
      if (wasRegistered && (updatedItem.waitlistedPlayerIds || []).length > 0) {
        const promotedId = updatedItem.waitlistedPlayerIds[0];
        const isPaid = (updatedItem.entryFee || 0) > 0;

        updatedItem = {
          ...updatedItem,
          registeredPlayerIds: isPaid 
            ? updatedItem.registeredPlayerIds 
            : [...new Set([...(updatedItem.registeredPlayerIds || []), promotedId])],
          pendingPaymentPlayerIds: isPaid 
            ? [...new Set([...(updatedItem.pendingPaymentPlayerIds || []), promotedId])] 
            : updatedItem.pendingPaymentPlayerIds,
          pendingPaymentTimestamps: {
            ...(updatedItem.pendingPaymentTimestamps || {}),
            [promotedId]: isPaid ? Date.now() : undefined
          },
          waitlistedPlayerIds: updatedItem.waitlistedPlayerIds.filter(pid => String(pid).toLowerCase() !== String(promotedId).toLowerCase()),
          optedOutPlayerIds: (updatedItem.optedOutPlayerIds || []).filter(pid => String(pid).toLowerCase() !== String(promotedId).toLowerCase()),
          playerStatuses: (() => {
            const rest = { ...(updatedItem.playerStatuses || {}) };
            delete rest[promotedId];
            return rest;
          })()
        };

        // Update promoted player's state
        updatedPlayers = updatedPlayers.map(p => {
          if (String(p.id).toLowerCase() === String(promotedId).toLowerCase()) {
            const notification = {
              id: `notif_promote_${Date.now()}`,
              title: 'Slot Opened!',
              message: isPaid 
                ? `A slot opened up in "${item.title}". You have been promoted from the waitlist! Please complete payment to finalize registration.`
                : `A slot opened up in "${item.title}". You have been promoted from the waitlist and are now registered!`,
              date: new Date().toISOString(),
              read: false,
              type: 'tournament_registration',
              tournamentId: item.id
            };
            return {
              ...p,
              notifications: [notification, ...(p.notifications || [])],
              registeredTournamentIds: isPaid 
                ? (p.registeredTournamentIds || []) 
                : [...new Set([...(p.registeredTournamentIds || []), tid])]
            };
          }
          return p;
        });
      }

      return updatedItem;
    });

    // Update currentUser if they are the one opting out
    if (String(userId).toLowerCase() === String(currentUser.id).toLowerCase()) {
      updatedCurrentUser.registeredTournamentIds = (currentUser.registeredTournamentIds || []).filter(id => id !== tid);
      // Sync currentUser back into updatedPlayers
      updatedPlayers = updatedPlayers.map(p => 
        String(p.id).toLowerCase() === String(userId).toLowerCase() ? updatedCurrentUser : p
      );
    }

    logger.logAction('TOURNAMENT_OPTOUT_SUCCESS', { tid, userId });

    return {
      success: true,
      tournaments: updatedTournaments,
      players: updatedPlayers,
      currentUser: updatedCurrentUser
    };
  }

  static joinWaitlist(tid, userId, tournaments) {
    const updated = tournaments.map(t => {
      if (t.id === tid) {
        return {
          ...t,
          waitlistedPlayerIds: [...new Set([...(t.waitlistedPlayerIds || []), userId])],
          optedOutPlayerIds: (t.optedOutPlayerIds || []).filter(pid => pid !== userId),
          playerStatuses: (() => {
            const rest = { ...(t.playerStatuses || {}) };
            delete rest[userId];
            return rest;
          })()
        };
      }
      return t;
    });
    return { success: true, tournaments: updated };
  }

  static deleteTournament(tid, tournaments) {
    const softDeleted = tournaments.map(t => t.id === tid ? { ...t, status: 'deleted', isDeleted: true } : t);
    const filtered = softDeleted.filter(t => t.id !== tid);
    return { success: true, tournaments: filtered, softDeletedTournaments: softDeleted };
  }

  static assignCoach(tid, cid, tournaments) {
    const updated = tournaments.map(t => t.id === tid ? { ...t, assignedCoachId: cid, coachStatus: 'Coach Assigned' } : t);
    return { success: true, tournaments: updated };
  }

  static removeCoach(tid, tournaments) {
    const updated = tournaments.map(t => t.id === tid ? { ...t, assignedCoachId: null, coachStatus: 'Awaiting Coach Confirmation' } : t);
    return { success: true, tournaments: updated };
  }

  static addCoachComment(tid, cid, comment, tournaments) {
    const updated = tournaments.map(t => t.id === tid ? { ...t, coachComments: [...(t.coachComments || []), { id: Date.now(), coachId: cid, text: comment, timestamp: new Date().toISOString() }] } : t);
    return { success: true, tournaments: updated };
  }

  static logFailedOtp(tid, cid, otp, tournaments) {
    const updated = tournaments.map(t => t.id === tid ? { ...t, failedOtps: [...(t.failedOtps || []), { coachId: cid, otp, timestamp: new Date().toISOString() }] } : t);
    return { success: true, tournaments: updated };
  }

  static startTournament(tid, tournaments) {
    const updated = (tournaments || []).map(t => t.id === tid ? { ...t, tournamentStarted: true, status: 'ongoing' } : t);
    return { success: true, tournaments: updated };
  }

  static endTournament(tid, tournaments) {
    const updated = (tournaments || []).map(t => t.id === tid ? { ...t, status: 'completed', tournamentConcluded: true } : t);
    return { success: true, tournaments: updated };
  }

  static declineCoachRequest(tid, tournaments) {
    const updated = (tournaments || []).map(item => item && item.id === tid ? { ...item, coachStatus: 'Declined' } : item);
    return { success: true, tournaments: updated };
  }

  static approveCoach(cid, status = 'approved', players) {
    const targetId = String(cid).toLowerCase().trim();
    const updatedPlayers = (players || []).map(p => 
      String(p.id).toLowerCase().trim() === targetId 
        ? { ...p, coachStatus: status, isApprovedCoach: status === 'approved' } 
        : p
    );
    return { success: true, players: updatedPlayers };
  }

  /**
   * Toggles a user's interest in a tournament.
   */
  static toggleInterest(tournament, user) {
    const interestedIds = [...(tournament.interestedPlayerIds || [])];
    const userId = user.id;
    const index = interestedIds.indexOf(userId);
    
    let updatedIds;
    if (index > -1) {
      updatedIds = interestedIds.filter(id => id !== userId);
    } else {
      updatedIds = [...interestedIds, userId];
    }

    return {
      ...tournament,
      interestedPlayerIds: updatedIds
    };
  }

  /**
   * Manages interested users (approve/reject).
   */
  static manageInterested(tid, pid, action, tournaments) {
    const updated = tournaments.map(t => {
      if (t.id !== tid) return t;
      
      const interestedIds = (t.interestedPlayerIds || []).filter(id => id !== pid);
      let registeredIds = [...(t.registeredPlayerIds || [])];
      
      if (action === 'approve') {
        registeredIds = [...new Set([...registeredIds, pid])];
      }

      return {
        ...t,
        interestedPlayerIds: interestedIds,
        registeredPlayerIds: registeredIds
      };
    });

    return { success: true, tournaments: updated };
  }
}

export default TournamentService;
