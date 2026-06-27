/**
 * ═══════════════════════════════════════════════════════════════
 * 🏆 TournamentService.mjs (v2.6.772)
 * Extracted from routes/tournaments.mjs — Monolith Decomposition Phase 1A
 * 
 * Pure business logic for all tournament operations.
 * No Express req/res — accepts plain objects, returns result objects.
 * ═══════════════════════════════════════════════════════════════
 */
import { Tournament, Player } from '../models/index.mjs';
import { addInAppNotification } from '../helpers/utils.mjs';
import { sendPushNotification } from '../notifications.js';
import crypto from 'crypto';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function toLower(id) { return String(id).toLowerCase(); }

function caseInsensitiveIds(ids) {
  return ids.flatMap(u => [u, toLower(u), new RegExp(`^${u}$`, 'i')]);
}

function broadcastTournamentUpdate(io, data, extra = {}) {
  if (io) {
    io.emit('entity_updated', {
      entity: 'tournaments',
      data,
      source: 'api',
      timestamp: Date.now(),
      ...extra,
    });
  }
}

async function notifyPlayer(playerId, title, body, payload) {
  const pDoc = await Player.findOne({ id: playerId });
  if (!pDoc || !pDoc.data) return;
  const pData = pDoc.data;
  pData.notifications = pData.notifications || [];
  addInAppNotification(pData, title, body, payload);
  await Player.updateOne({ id: playerId }, { $set: { 'data.notifications': pData.notifications, lastUpdated: new Date() } });
  if (pData.pushTokens?.length > 0) {
    sendPushNotification(pData.pushTokens, title, body, payload).catch(console.error);
  }
}

// ─────────────────────────────────────────────────────────────
// registerPlayer
// ─────────────────────────────────────────────────────────────

export async function registerPlayer(tid, userId, body, io) {
  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found' };

  const tData = tournamentDoc.data || {};

  // Server-side cost validation
  const serverCost = Number(tData.entryFee || tData.cost || tData.registrationFee || 0);
  const isDoubles = ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(tData.format);

  const { method = 'credits', partnerId, teamCode, registeringPartnerId, idempotencyKey } = body;

  // Idempotency guard
  const lowerUserIdCheck = toLower(userId);
  if (idempotencyKey) {
    const existingPayment = tData.playerPaymentMethods?.[lowerUserIdCheck];
    if (existingPayment?.idempotencyKey === idempotencyKey) {
      return { status: 200, success: true, type: 'IDEMPOTENT_REPLAY', message: 'Already registered (duplicate request detected)' };
    }
  }

  // Block partner registration in singles
  if (!isDoubles && (registeringPartnerId || partnerId || teamCode)) {
    return { status: 400, success: false, message: 'Partner registration is only available for Doubles formats.' };
  }

  const wasAlreadyRegistered = (tData.registeredPlayerIds || []).includes(userId);
  const wasPending = (tData.pendingPaymentPlayerIds || []).includes(userId);

  if (wasAlreadyRegistered || wasPending) {
    return { status: 400, success: false, message: 'You are already registered or have a pending payment for this tournament.' };
  }

  const partnerAlreadyRegistered = registeringPartnerId && (
    (tData.registeredPlayerIds || []).includes(registeringPartnerId) ||
    (tData.pendingPaymentPlayerIds || []).includes(registeringPartnerId)
  );

  // Calculate costs and slots
  const individualCost = isDoubles ? serverCost / 2 : serverCost;
  let totalCost = individualCost;
  let slotsNeeded = 1;
  const usersToRegister = [userId];

  if (registeringPartnerId && !partnerAlreadyRegistered) {
    totalCost += individualCost;
    slotsNeeded += 1;
    usersToRegister.push(registeringPartnerId);
  }

  // Find joining team
  let joiningTeam = null;
  let partnerDoc = null;
  if (isDoubles) {
    if (registeringPartnerId) {
      partnerDoc = await Player.findOne({ id: registeringPartnerId });
      if (!partnerDoc) return { status: 404, success: false, message: 'Partner user not found.' };

      const partnerGender = partnerDoc.data?.gender;
      if (tData.format === "Men's Doubles" && partnerGender !== 'Male') {
        return { status: 400, success: false, message: "Only male players are allowed in Men's Doubles." };
      }
      if (tData.format === "Women's Doubles" && partnerGender !== 'Female') {
        return { status: 400, success: false, message: "Only female players are allowed in Women's Doubles." };
      }
    } else {
      const teams = tData.doublesTeams || [];
      if (teamCode) {
        joiningTeam = teams.find(t => t.teamCode === teamCode && !t.player2Id);
        if (!joiningTeam) return { status: 404, success: false, message: 'Invalid or full team code.' };
      } else if (partnerId) {
        joiningTeam = teams.find(t => t.player1Id === partnerId && !t.player2Id);
        if (!joiningTeam) return { status: 404, success: false, message: 'Partner already has a full team or is not registered.' };
      }
    }
  }

  // Capacity guard
  const registeredCount = (tData.registeredPlayerIds || []).length;
  const pendingCount = (tData.pendingPaymentPlayerIds || []).filter(pid => pid !== userId && pid !== registeringPartnerId).length;
  const max = tData.maxPlayers || Infinity;

  if (registeredCount + pendingCount + slotsNeeded > max) {
    return { status: 400, success: false, message: 'Slots Full', type: 'FULL' };
  }

  // Fetch current user
  const currentUserDoc = await Player.findOne({ id: userId });
  if (!currentUserDoc) return { status: 404, success: false, message: 'User not found' };

  const pData = currentUserDoc.data || {};
  const currentCredits = pData.credits || 0;

  // Validate funds
  if (method === 'credits' && totalCost > 0 && currentCredits < totalCost) {
    return { status: 400, success: false, message: 'Insufficient credits' };
  }

  // Referral bonus
  const isFirstRegistration = (pData.registeredTournamentIds || []).length === 0;
  const referralBonus = (isFirstRegistration && pData.referredBy) ? 100 : 0;

  // Execute atomic updates
  const lowerUsersToRegister = usersToRegister.map(u => toLower(u));
  const caseInsensitiveUsers = caseInsensitiveIds(usersToRegister);
  const lowerUserId = toLower(userId);

  // A. Tournament update
  const tUpdate = {
    $addToSet: {},
    $pull: {
      'data.waitlistedPlayerIds': { $in: caseInsensitiveUsers },
      'data.optedOutPlayerIds': { $in: caseInsensitiveUsers }
    },
    $unset: {},
    $set: { lastUpdated: new Date() }
  };

  let newTeamCode = null;

  if (isDoubles) {
    if (joiningTeam) {
      tUpdate.$set['data.doublesTeams.$.player2Id'] = lowerUserId;
      tUpdate.$set['data.doublesTeams.$.updatedAt'] = new Date().toISOString();
    } else {
      const teamId = `team_${Date.now()}`;
      newTeamCode = crypto.randomBytes(4).toString('hex').toUpperCase();
      tUpdate.$push = {
        'data.doublesTeams': {
          id: teamId,
          teamCode: newTeamCode,
          player1Id: lowerUserId,
          player2Id: registeringPartnerId ? toLower(registeringPartnerId) : null,
          createdAt: new Date().toISOString()
        }
      };
    }
  }

  if (method === 'pending') {
    tUpdate.$addToSet['data.pendingPaymentPlayerIds'] = { $each: lowerUsersToRegister };
    tUpdate.$pull['data.registeredPlayerIds'] = { $in: caseInsensitiveUsers };
    for (const uId of lowerUsersToRegister) {
      tUpdate.$set[`data.pendingPaymentTimestamps.${uId}`] = Date.now();
      tUpdate.$set[`data.playerPaymentMethods.${uId}`] = { method, cost: individualCost, timestamp: new Date().toISOString(), paidBy: userId, idempotencyKey: idempotencyKey || null };
    }
  } else {
    tUpdate.$addToSet['data.registeredPlayerIds'] = { $each: lowerUsersToRegister };
    tUpdate.$pull['data.pendingPaymentPlayerIds'] = { $in: caseInsensitiveUsers };
    for (let i = 0; i < usersToRegister.length; i++) {
      const uId = usersToRegister[i];
      const lowerUId = lowerUsersToRegister[i];
      tUpdate.$unset[`data.playerStatuses.${uId}`] = "";
      tUpdate.$unset[`data.playerStatuses.${lowerUId}`] = "";
      tUpdate.$unset[`data.pendingPaymentTimestamps.${uId}`] = "";
      tUpdate.$unset[`data.pendingPaymentTimestamps.${lowerUId}`] = "";
      tUpdate.$set[`data.playerPaymentMethods.${lowerUId}`] = { method, cost: individualCost, timestamp: new Date().toISOString(), paidBy: userId, idempotencyKey: idempotencyKey || null };
    }
  }

  // Concurrency guard
  const query = { id: tid };
  if (isDoubles && joiningTeam) {
    query['data.doublesTeams'] = { $elemMatch: { id: joiningTeam.id, player2Id: null } };
  }

  const updatedTournament = await Tournament.findOneAndUpdate(query, tUpdate, { new: true });
  if (!updatedTournament) {
    return { status: 409, success: false, message: 'The slot you are trying to book was just taken by someone else. Please try another team or refresh.' };
  }

  // B. Update current user
  const pUpdate = {
    $addToSet: { 'data.registeredTournamentIds': tid },
    $set: { lastUpdated: new Date() }
  };

  let netCreditChange = 0;
  let walletEntries = [];

  if (method === 'credits' && totalCost > 0) {
    netCreditChange -= totalCost;
    walletEntries.push({
      id: `reg-deduct-${Date.now()}`, amount: -totalCost, type: 'debit',
      description: `Registration for ${tData.title}`, date: new Date().toISOString()
    });
  }

  if (referralBonus > 0) {
    netCreditChange += referralBonus;
    walletEntries.push({
      id: `ref-ref-${Date.now()}`, amount: referralBonus, type: 'credit',
      description: `Referral Reward (Referee Bonus)`, date: new Date().toISOString()
    });
  }

  if (netCreditChange !== 0) pUpdate.$inc = { 'data.credits': netCreditChange };
  if (walletEntries.length > 0) {
    pUpdate.$push = { 'data.walletHistory': { $each: walletEntries, $position: 0 } };
  }

  const updatedUser = await Player.findOneAndUpdate({ id: userId }, pUpdate, { new: true });

  // C. Update partner
  if (registeringPartnerId && partnerDoc) {
    const partnerUpdate = {
      $addToSet: { 'data.registeredTournamentIds': tid },
      $set: { lastUpdated: new Date() }
    };

    const notifTitle = 'Tournament Registration';
    const notifBody = `${pData.name || 'Your partner'} has registered you for "${tData.title}"!`;
    let pDataMut = partnerDoc.data || {};
    pDataMut.notifications = pDataMut.notifications || [];
    addInAppNotification(pDataMut, notifTitle, notifBody, { tournamentId: tid, type: 'TOURNAMENT_PARTNER_REG' });
    partnerUpdate.$set['data.notifications'] = pDataMut.notifications;

    if (pDataMut.pushTokens?.length > 0) {
      await sendPushNotification(pDataMut.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TOURNAMENT_PARTNER_REG' });
    }
    await Player.updateOne({ id: registeringPartnerId }, partnerUpdate);
  }

  // D. Update referrer
  if (referralBonus > 0 && pData.referredBy) {
    const referrerId = pData.referredBy.toLowerCase();
    await Player.findOneAndUpdate(
      { id: referrerId },
      {
        $inc: { 'data.credits': 100 },
        $push: {
          'data.walletHistory': {
            $each: [{ id: `ref-sor-${Date.now()}`, amount: 100, type: 'credit', description: `Referral Reward (Referrer Bonus for ${pData.name || 'User'})`, date: new Date().toISOString() }],
            $position: 0
          }
        }
      },
      { new: true }
    );
  }

  // Broadcast
  broadcastTournamentUpdate(io, updatedTournament.data);

  return {
    status: 200, success: true,
    type: method === 'upi' ? 'UPI_SUCCESS' : 'SUCCESS',
    tournament: updatedTournament.data,
    currentUser: updatedUser.data,
    teamCode: newTeamCode,
    referralBonus
  };
}

// ─────────────────────────────────────────────────────────────
// optOutPlayer
// ─────────────────────────────────────────────────────────────

export async function optOutPlayer(tid, userId, body, io) {
  const { refundToWallet = true, optOutMode = 'individual' } = body;

  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found' };

  const tData = tournamentDoc.data || {};
  const lowerUserId = toLower(userId);
  const wasRegistered = (tData.registeredPlayerIds || []).some(id => toLower(id) === lowerUserId);
  const isWaitlisted = (tData.waitlistedPlayerIds || []).some(id => toLower(id) === lowerUserId);
  const isPending = (tData.pendingPaymentPlayerIds || []).some(id => toLower(id) === lowerUserId);

  if (!wasRegistered && !isWaitlisted && !isPending) {
    // Zombie state recovery
    const updatedUser = await Player.findOneAndUpdate(
      { id: userId },
      { $pull: { 'data.registeredTournamentIds': tid }, $set: { lastUpdated: new Date() } },
      { new: true }
    );
    return { status: 200, success: true, message: 'Cleaned up desynced tournament state.', tournament: tData, currentUser: updatedUser.data };
  }

  // Determine who paid
  const paymentInfo = tData.playerPaymentMethods?.[lowerUserId];
  let originalPayerId = userId;
  let userPaidCost = tData.entryFee || 0;

  if (paymentInfo) {
    if (paymentInfo.paidBy) originalPayerId = paymentInfo.paidBy;
    if (paymentInfo.cost !== undefined) userPaidCost = paymentInfo.cost;
  }

  // Team context for doubles
  let teamToOptOut = null;
  let usersToRemove = [userId];
  let lowerUsersToRemove = [lowerUserId];
  let amountToCalculateRefundOn = userPaidCost;

  if (tData.doublesTeams) {
    const team = tData.doublesTeams.find(t => toLower(t.player1Id) === lowerUserId || toLower(t.player2Id) === lowerUserId);
    if (team) {
      if (optOutMode === 'team' && toLower(team.player1Id) === lowerUserId && team.player2Id) {
        usersToRemove = [team.player1Id, team.player2Id];
        lowerUsersToRemove = usersToRemove.map(id => toLower(id));
        amountToCalculateRefundOn = tData.entryFee || 0;
        teamToOptOut = team;
      } else {
        amountToCalculateRefundOn = (tData.entryFee || 0) / 2;
      }
    }
  } else {
    amountToCalculateRefundOn = tData.entryFee || 0;
  }

  // Calculate refund
  let refundAmount = 0;
  let cancellationCharge = 0;
  let cancellationPercent = 0;
  let refundInfo = null;

  if (refundToWallet && amountToCalculateRefundOn > 0 && wasRegistered) {
    const now = Date.now();
    const tournamentTime = new Date(tData.date).getTime();
    const daysRemaining = (tournamentTime - now) / (1000 * 60 * 60 * 24);

    if (daysRemaining >= 5) cancellationPercent = 0;
    else if (daysRemaining >= 3) cancellationPercent = 25;
    else if (daysRemaining >= 1) cancellationPercent = 50;
    else cancellationPercent = 100;

    cancellationCharge = Math.round(amountToCalculateRefundOn * (cancellationPercent / 100));
    refundAmount = amountToCalculateRefundOn - cancellationCharge;

    refundInfo = {
      entryFee: amountToCalculateRefundOn, cancellationPercent, cancellationCharge,
      refundAmount, daysRemaining: Math.max(0, Math.floor(daysRemaining)),
      timestamp: new Date().toISOString(), playerId: userId, refundedTo: originalPayerId,
      isTeamOptOut: optOutMode === 'team'
    };
  }

  // Prepare tournament updates
  let updatedRegistered = (tData.registeredPlayerIds || []).filter(id => !lowerUsersToRemove.includes(toLower(id)));
  let updatedPending = (tData.pendingPaymentPlayerIds || []).filter(id => !lowerUsersToRemove.includes(toLower(id)));
  let updatedWaitlisted = (tData.waitlistedPlayerIds || []).filter(id => !lowerUsersToRemove.includes(toLower(id)));

  const tUpdate = {
    $addToSet: { 'data.optedOutPlayerIds': { $each: lowerUsersToRemove } },
    $set: { lastUpdated: new Date() },
    $unset: {}
  };

  for (const uId of usersToRemove) {
    const lId = toLower(uId);
    tUpdate.$set[`data.playerStatuses.${lId}`] = 'Opted-Out';
    tUpdate.$unset[`data.pendingPaymentTimestamps.${uId}`] = "";
    tUpdate.$unset[`data.pendingPaymentTimestamps.${lId}`] = "";
    tUpdate.$unset[`data.playerPaymentMethods.${uId}`] = "";
    tUpdate.$unset[`data.playerPaymentMethods.${lId}`] = "";
    if (uId !== lId) tUpdate.$unset[`data.playerStatuses.${uId}`] = "";
  }

  if (Object.keys(tUpdate.$unset).length === 0) delete tUpdate.$unset;

  // Doubles team atomic update
  let doublesTeamAtomicUpdate = null;

  if (tData.doublesTeams?.length > 0) {
    if (optOutMode === 'team' && teamToOptOut) {
      tUpdate.$pull = tUpdate.$pull || {};
      tUpdate.$pull['data.doublesTeams'] = { id: teamToOptOut.id };
    } else {
      const team = tData.doublesTeams.find(t =>
        toLower(t.player1Id) === lowerUserId || (t.player2Id && toLower(t.player2Id) === lowerUserId)
      );
      if (team) {
        const isPlayer1 = toLower(team.player1Id) === lowerUserId;
        if (isPlayer1 && team.player2Id) {
          doublesTeamAtomicUpdate = { query: { id: tid, 'data.doublesTeams.id': team.id }, update: { $set: { 'data.doublesTeams.$.player1Id': team.player2Id, 'data.doublesTeams.$.player2Id': null } } };
        } else if (isPlayer1 && !team.player2Id) {
          doublesTeamAtomicUpdate = { query: { id: tid }, update: { $pull: { 'data.doublesTeams': { id: team.id } } } };
        } else {
          doublesTeamAtomicUpdate = { query: { id: tid, 'data.doublesTeams.id': team.id }, update: { $set: { 'data.doublesTeams.$.player2Id': null } } };
        }
      }
    }
  }

  if (refundInfo) tUpdate.$push = { 'data.refundHistory': refundInfo };

  // Auto-promotion from waitlist
  let promotedId = null;
  const isPaid = amountToCalculateRefundOn > 0;

  if (wasRegistered && updatedWaitlisted.length > 0) {
    const numToPromote = Math.min(updatedWaitlisted.length, usersToRemove.length);
    if (numToPromote > 0) {
      const promotedIds = updatedWaitlisted.slice(0, numToPromote);
      promotedId = promotedIds[0];
      updatedWaitlisted = updatedWaitlisted.filter(id => !promotedIds.includes(id));

      if (isPaid) {
        updatedPending = [...new Set([...updatedPending, ...promotedIds])];
        promotedIds.forEach(pid => { tUpdate.$set[`data.pendingPaymentTimestamps.${pid}`] = Date.now(); });
      } else {
        updatedRegistered = [...new Set([...updatedRegistered, ...promotedIds])];
      }
      tUpdate.$unset = tUpdate.$unset || {};
      promotedIds.forEach(pid => { tUpdate.$unset[`data.playerStatuses.${pid}`] = ""; });
    }
  }

  tUpdate.$set['data.registeredPlayerIds'] = updatedRegistered;
  tUpdate.$set['data.pendingPaymentPlayerIds'] = updatedPending;
  tUpdate.$set['data.waitlistedPlayerIds'] = updatedWaitlisted;

  let updatedTournament = await Tournament.findOneAndUpdate({ id: tid }, tUpdate, { new: true });

  if (doublesTeamAtomicUpdate && updatedTournament) {
    updatedTournament = await Tournament.findOneAndUpdate(doublesTeamAtomicUpdate.query, doublesTeamAtomicUpdate.update, { new: true }) || updatedTournament;
  }

  // Refund
  if (refundAmount > 0) {
    const historyEntry = {
      id: `refund-${Date.now()}`, amount: refundAmount, type: 'credit',
      description: `Refund for ${tData.title}${cancellationCharge > 0 ? ` (₹${cancellationCharge} cancellation fee deducted)` : ''}`,
      date: new Date().toISOString(),
      refundMeta: { tournamentId: tid, entryFee: amountToCalculateRefundOn, cancellationPercent, cancellationCharge }
    };
    await Player.findOneAndUpdate(
      { id: originalPayerId },
      { $inc: { 'data.credits': refundAmount }, $push: { 'data.walletHistory': { $each: [historyEntry], $position: 0 } }, $set: { lastUpdated: new Date() } }
    );
  }

  // Cleanup registeredTournamentIds for removed users
  let updatedUser = null;
  for (const uId of usersToRemove) {
    const updatePayload = { $pull: { 'data.registeredTournamentIds': tid }, $set: { lastUpdated: new Date() } };

    if (uId !== userId) {
      const notif = {
        id: `notif_optout_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        title: 'Tournament Opt-Out', message: `Your partner has opted your team out of "${tData.title}".`,
        date: new Date().toISOString(), read: false, type: 'tournament_optout', tournamentId: tid
      };
      updatePayload.$push = { 'data.notifications': { $each: [notif], $position: 0 } };
    }

    const pUpdateDoc = await Player.findOneAndUpdate({ id: uId }, updatePayload, { new: true });

    if (uId === userId) {
      updatedUser = pUpdateDoc;
    } else if (pUpdateDoc?.data?.pushTokens?.length > 0) {
      sendPushNotification(pUpdateDoc.data.pushTokens, 'Tournament Opt-Out', `Your partner has opted your team out of "${tData.title}".`, { tournamentId: tid, type: 'TOURNAMENT_OPTOUT' }).catch(console.error);
    }
  }

  // Promoted player notification
  let updatedPromotedPlayer = null;
  if (promotedId) {
    const notif = {
      id: `notif_promote_${Date.now()}`, title: 'Slot Opened!',
      message: isPaid
        ? `A slot opened up in "${tData.title}". You have been promoted from the waitlist! Please complete payment to finalize registration.`
        : `A slot opened up in "${tData.title}". You have been promoted from the waitlist and are now registered!`,
      date: new Date().toISOString(), read: false, type: 'tournament_registration', tournamentId: tid
    };
    const pUpdate = { $push: { 'data.notifications': { $each: [notif], $position: 0 } }, $set: { lastUpdated: new Date() } };
    if (!isPaid) pUpdate.$addToSet = { 'data.registeredTournamentIds': tid };
    updatedPromotedPlayer = await Player.findOneAndUpdate({ id: promotedId }, pUpdate, { new: true });
  }

  broadcastTournamentUpdate(io, updatedTournament.data);

  return {
    status: 200, success: true,
    tournament: updatedTournament.data,
    currentUser: updatedUser?.data,
    refundInfo,
    promotedPlayer: updatedPromotedPlayer?.data || null
  };
}

// ─────────────────────────────────────────────────────────────
// Simple admin operations
// ─────────────────────────────────────────────────────────────

export async function startTournament(tid, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  doc.data.status = 'In Progress';
  doc.data.startedAt = new Date().toISOString();
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function endTournament(tid, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  doc.data.status = 'Completed';
  doc.data.endedAt = new Date().toISOString();
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function removeCoach(tid, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  delete doc.data.assignedCoach;
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function manageInterested(tid, pid, action, io) {
  const updateQuery = { $set: { lastUpdated: new Date() } };
  const caseInsensitivePlayerIds = [pid, toLower(pid), new RegExp(`^${pid}$`, 'i')];
  updateQuery.$pull = { 'data.interestedPlayerIds': { $in: caseInsensitivePlayerIds } };

  if (action === 'accept') {
    updateQuery.$addToSet = { 'data.registeredPlayerIds': toLower(pid) };
  }

  const updatedTournament = await Tournament.findOneAndUpdate({ id: tid }, updateQuery, { new: true });
  if (!updatedTournament) return { status: 404, error: 'Tournament not found' };

  broadcastTournamentUpdate(io, updatedTournament.data);
  return { status: 200, success: true, tournament: updatedTournament.data };
}

export async function removePending(tid, pid, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  const tData = doc.data;
  const lowerPid = toLower(pid);
  tData.pendingPaymentPlayerIds = (tData.pendingPaymentPlayerIds || []).filter(id => toLower(id) !== lowerPid);
  if (tData.pendingPaymentTimestamps) {
    delete tData.pendingPaymentTimestamps[pid];
    delete tData.pendingPaymentTimestamps[lowerPid];
  }

  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function deleteTournament(tid, io) {
  const doc = await Tournament.findOneAndDelete({ id: tid });
  if (!doc) return { status: 404, error: 'Tournament not found' };

  broadcastTournamentUpdate(io, null, { deletedId: tid });
  return { status: 200, success: true };
}

// ─────────────────────────────────────────────────────────────
// Coach operations
// ─────────────────────────────────────────────────────────────

export async function declineCoach(tid, coachId, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  delete doc.data.assignedCoachId;
  doc.data.coachStatus = 'Coach Declined';
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  const pDoc = await Player.findOne({ id: coachId });
  if (pDoc?.data) {
    const metrics = pDoc.data.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
    metrics.tournamentsDeclined = (metrics.tournamentsDeclined || 0) + 1;
    pDoc.data.coachMetrics = metrics;
    pDoc.lastUpdated = new Date();
    pDoc.markModified('data');
    await pDoc.save();
  }

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data, currentUser: pDoc?.data || null };
}

export async function confirmCoach(tid, coachId, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc?.data) return { status: 404, error: 'Tournament not found' };

  doc.data.assignedCoachId = coachId;
  doc.data.coachStatus = 'Coach Confirmed';
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();

  const pDoc = await Player.findOne({ id: coachId });
  if (pDoc?.data) {
    const metrics = pDoc.data.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
    metrics.tournamentsAccepted = (metrics.tournamentsAccepted || 0) + 1;
    pDoc.data.coachMetrics = metrics;
    pDoc.lastUpdated = new Date();
    pDoc.markModified('data');
    await pDoc.save();
  }

  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data, currentUser: pDoc?.data || null };
}

// ─────────────────────────────────────────────────────────────
// Waitlist, CRUD, assign/comment/add-player
// ─────────────────────────────────────────────────────────────

export async function joinWaitlist(tid, userId, io) {
  const doc = await Tournament.findOne({ id: tid });
  if (!doc) return { status: 404, success: false, message: 'Tournament not found' };

  const tData = doc.data || {};
  const lowerUserId = toLower(userId);
  if ((tData.registeredPlayerIds || []).some(id => toLower(id) === lowerUserId)) return { status: 400, success: false, message: 'Already registered' };
  if ((tData.waitlistedPlayerIds || []).some(id => toLower(id) === lowerUserId)) return { status: 400, success: false, message: 'Already on waitlist' };

  await Tournament.updateOne({ id: tid }, { $addToSet: { 'data.waitlistedPlayerIds': userId }, $set: { lastUpdated: new Date() } });
  const updated = await Tournament.findOne({ id: tid });
  broadcastTournamentUpdate(io, updated.data);
  return { status: 200, success: true, tournament: updated.data };
}

export async function createTournament(tournament, io) {
  if (!tournament?.id) return { status: 400, error: 'Tournament data with id required' };
  const existing = await Tournament.findOne({ id: tournament.id });
  if (existing) return { status: 409, error: 'Tournament with this ID already exists' };

  const doc = new Tournament({ id: tournament.id, data: tournament, lastUpdated: new Date() });
  await doc.save();
  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function updateTournament(tid, tournament, io) {
  if (!tournament) return { status: 400, error: 'Tournament data required' };
  const doc = await Tournament.findOne({ id: tid });
  if (!doc) return { status: 404, success: false, message: 'Tournament not found' };

  doc.data = { ...doc.data, ...tournament, id: doc.data.id };
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();
  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function assignCoach(tid, coachId, io) {
  if (!coachId) return { status: 400, error: 'coachId required' };
  const doc = await Tournament.findOne({ id: tid });
  if (!doc) return { status: 404, success: false, message: 'Tournament not found' };

  doc.data.assignedCoachId = coachId;
  doc.data.coachStatus = 'Pending Confirmation';
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();
  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function addCoachComment(tid, coachId, comment, userRole, io) {
  if (!comment) return { status: 400, error: 'Comment text required' };
  const doc = await Tournament.findOne({ id: tid });
  if (!doc) return { status: 404, success: false, message: 'Tournament not found' };

  if (doc.data.assignedCoachId !== coachId && userRole !== 'admin') {
    return { status: 403, error: 'Only the assigned coach or admin can add comments' };
  }

  const coachComments = doc.data.coachComments || [];
  coachComments.push({ coachId, comment, timestamp: new Date().toISOString() });
  doc.data.coachComments = coachComments;
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();
  broadcastTournamentUpdate(io, doc.data);
  return { status: 200, success: true, tournament: doc.data };
}

export async function addPlayer(tid, playerId, io) {
  if (!playerId) return { status: 400, error: 'playerId required' };
  const doc = await Tournament.findOne({ id: tid });
  if (!doc) return { status: 404, success: false, message: 'Tournament not found' };

  if ((doc.data.registeredPlayerIds || []).includes(playerId)) {
    return { status: 400, success: false, message: 'Player already registered' };
  }

  await Tournament.updateOne({ id: tid }, { $addToSet: { 'data.registeredPlayerIds': playerId }, $set: { lastUpdated: new Date() } });
  const updated = await Tournament.findOne({ id: tid });
  broadcastTournamentUpdate(io, updated.data);
  return { status: 200, success: true, tournament: updated.data };
}

// ─────────────────────────────────────────────────────────────
// joinTeam
// ─────────────────────────────────────────────────────────────

export async function joinTeam(tid, userId, teamCode, io) {
  if (!teamCode) return { status: 400, success: false, message: 'Team code is required.' };

  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found.' };

  const tData = tournamentDoc.data || {};
  const isDoubles = ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(tData.format);
  if (!isDoubles) return { status: 400, success: false, message: 'Team joining is only available for Doubles formats.' };

  const lowerUserId = toLower(userId);
  const isRegistered = (tData.registeredPlayerIds || []).some(id => toLower(id) === lowerUserId);
  const isPending = (tData.pendingPaymentPlayerIds || []).some(id => toLower(id) === lowerUserId);

  if (!isRegistered && !isPending) {
    return { status: 400, success: false, message: 'You must be registered for this tournament before joining a team.' };
  }

  const teams = tData.doublesTeams || [];
  const existingTeam = teams.find(t => toLower(t.player1Id) === lowerUserId || toLower(t.player2Id) === lowerUserId);
  if (existingTeam?.player1Id && existingTeam?.player2Id) {
    return { status: 400, success: false, message: 'You already have a complete team for this tournament.' };
  }

  const targetTeam = teams.find(t => t.teamCode === teamCode && !t.player2Id);
  if (!targetTeam) return { status: 404, success: false, message: 'Invalid team code, or the team is already full.' };
  if (toLower(targetTeam.player1Id) === lowerUserId) return { status: 400, success: false, message: 'You cannot join your own team.' };

  // Gender validation
  const userDoc = await Player.findOne({ id: userId });
  if (!userDoc) return { status: 404, success: false, message: 'User not found.' };
  const userGender = userDoc.data?.gender;

  if (tData.format === "Men's Doubles" && userGender !== 'Male') {
    return { status: 400, success: false, message: "Only male players are allowed in Men's Doubles." };
  }
  if (tData.format === "Women's Doubles" && userGender !== 'Female') {
    return { status: 400, success: false, message: "Only female players are allowed in Women's Doubles." };
  }

  // Dissolve old incomplete team if needed
  if (existingTeam && existingTeam.id !== targetTeam.id) {
    await Tournament.updateOne({ id: tid }, { $pull: { 'data.doublesTeams': { id: existingTeam.id } } });
  }

  const updateOps = {
    $set: {
      'data.doublesTeams.$.player2Id': lowerUserId,
      'data.doublesTeams.$.updatedAt': new Date().toISOString(),
      lastUpdated: new Date()
    }
  };

  const updatedTournament = await Tournament.findOneAndUpdate(
    { id: tid, 'data.doublesTeams': { $elemMatch: { teamCode, player2Id: null } } },
    updateOps,
    { new: true }
  );

  if (!updatedTournament) {
    return { status: 409, success: false, message: 'Team was just filled by another player. Please try again.' };
  }

  // Notify partner
  const partnerId = targetTeam.player1Id;
  const partnerDoc = await Player.findOne({ id: partnerId });
  if (partnerDoc) {
    const notifTitle = 'Team Matched! 🎉';
    const notifBody = `${userDoc.data?.name || 'A player'} has joined your team for "${tData.title}"!`;
    let pDataMut = partnerDoc.data || {};
    pDataMut.notifications = pDataMut.notifications || [];
    addInAppNotification(pDataMut, notifTitle, notifBody, { tournamentId: tid, type: 'TEAM_JOINED' });
    await Player.updateOne({ id: partnerId }, { $set: { 'data.notifications': pDataMut.notifications } });
    if (pDataMut.pushTokens?.length > 0) {
      sendPushNotification(pDataMut.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TEAM_JOINED' }).catch(console.error);
    }
  }

  broadcastTournamentUpdate(io, updatedTournament.data);

  return {
    status: 200, success: true,
    tournament: updatedTournament.data,
    currentUser: userDoc.data,
    message: `You have been matched with ${partnerDoc?.data?.name || 'your partner'}!`
  };
}

// ─────────────────────────────────────────────────────────────
// checkIn
// ─────────────────────────────────────────────────────────────

export async function checkInPlayer(tid, requesterId, requesterRole, body, io) {
  let targetPlayerId;
  if (body.playerId) {
    if (requesterRole !== 'admin' && requesterRole !== 'coach') {
      return { status: 403, success: false, message: 'Only admins and coaches can check in other players.' };
    }
    targetPlayerId = toLower(body.playerId);
  } else {
    targetPlayerId = toLower(requesterId);
  }

  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found.' };

  const tData = tournamentDoc.data || {};
  const registeredIds = (tData.registeredPlayerIds || []).map(id => toLower(id));
  if (!registeredIds.includes(targetPlayerId)) {
    return { status: 400, success: false, message: 'Player is not registered for this tournament.' };
  }

  if ((tData.playerStatuses || {})[targetPlayerId] === 'Checked-In') {
    return { status: 200, success: true, type: 'ALREADY_CHECKED_IN', message: 'Player is already checked in.' };
  }

  const updatedTournament = await Tournament.findOneAndUpdate(
    { id: tid },
    { $set: { [`data.playerStatuses.${targetPlayerId}`]: 'Checked-In', lastUpdated: new Date() } },
    { new: true }
  );

  if (!updatedTournament) return { status: 500, success: false, message: 'Failed to update check-in status.' };

  // Notifications
  const playerDoc = await Player.findOne({ id: targetPlayerId });
  const playerData = playerDoc?.data || {};
  const tournamentTitle = tData.title || 'Tournament';

  await notifyPlayer(targetPlayerId, 'Check-In Confirmed! ✅', `You have successfully checked in for ${tournamentTitle}.`, { tournamentId: tid, type: 'TOURNAMENT_CHECKIN' });

  if (tData.assignedCoachId) {
    await notifyPlayer(tData.assignedCoachId, 'Player Checked-In ✅', `${playerData.name || targetPlayerId} has checked in for ${tournamentTitle}.`, { tournamentId: tid, type: 'COACH_PLAYER_CHECKIN' });
  }

  broadcastTournamentUpdate(io, updatedTournament.data);
  console.log(`✅ [CheckIn] Player ${targetPlayerId} checked into tournament ${tid} by ${requesterId}`);

  return {
    status: 200, success: true,
    message: `${playerData.name || targetPlayerId} checked in successfully.`,
    tournament: updatedTournament.data
  };
}
