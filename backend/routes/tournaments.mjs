import express from 'express';
import { Tournament, Player } from '../models/index.mjs';
import { authGuard } from '../middleware/security.mjs';
import { addInAppNotification } from '../helpers/utils.mjs';
import { sendPushNotification } from '../notifications.js';

export default function({ io }) {
  const router = express.Router();

  // POST /api/v1/tournaments/:id/register
  router.post('/:id/register', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    // 🛡️ [VAPT-BL2] (v2.6.556): method and cost are now derived server-side

    try {
      // 1. Fetch current tournament state
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      const tData = tournamentDoc.data || {};

      // 🛡️ [VAPT-BL2] (v2.6.556): Server-side cost validation
      const serverCost = Number(tData.entryFee || tData.cost || tData.registrationFee || 0);
      const isDoubles = ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(tData.format);
      
      const { method = 'credits', partnerId, teamCode, registeringPartnerId } = req.body;
      
      // 🛡️ [VAPT-BL4]: Block partner registration in singles tournaments
      if (!isDoubles && (registeringPartnerId || partnerId || teamCode)) {
        return res.status(400).json({ success: false, message: 'Partner registration is only available for Doubles formats.' });
      }

      const wasAlreadyRegistered = (tData.registeredPlayerIds || []).includes(userId);
      const wasPending = (tData.pendingPaymentPlayerIds || []).includes(userId);
      
      // 🛡️ [VAPT-BL3]: Prevent capacity bypass and free registration loopholes
      if (wasAlreadyRegistered || wasPending) {
        return res.status(400).json({ success: false, message: 'You are already registered or have a pending payment for this tournament.' });
      }

      const partnerAlreadyRegistered = registeringPartnerId && ((tData.registeredPlayerIds || []).includes(registeringPartnerId) || (tData.pendingPaymentPlayerIds || []).includes(registeringPartnerId));

      // Calculate strictly needed slots and individual costs
      const individualCost = isDoubles ? serverCost / 2 : serverCost;
      let totalCost = 0;
      let slotsNeeded = 0;
      const usersToRegister = [];

      totalCost += individualCost;
      slotsNeeded += 1;
      usersToRegister.push(userId);

      if (registeringPartnerId && !partnerAlreadyRegistered) {
        totalCost += individualCost;
        slotsNeeded += 1;
        usersToRegister.push(registeringPartnerId);
      }

      // Find if we are joining an existing team
      let joiningTeam = null;
      let partnerDoc = null;
      if (isDoubles) {
        if (registeringPartnerId) {
          // Verify partner is valid
          partnerDoc = await Player.findOne({ id: registeringPartnerId });
          if (!partnerDoc) {
            return res.status(404).json({ success: false, message: 'Partner user not found.' });
          }
          
          const partnerGender = partnerDoc.data?.gender;
          if (tData.format === "Men's Doubles" && partnerGender !== 'Male') {
            return res.status(400).json({ success: false, message: "Only male players are allowed in Men's Doubles." });
          }
          if (tData.format === "Women's Doubles" && partnerGender !== 'Female') {
            return res.status(400).json({ success: false, message: "Only female players are allowed in Women's Doubles." });
          }
        } else {
          const teams = tData.doublesTeams || [];
          if (teamCode) {
             joiningTeam = teams.find(t => t.teamCode === teamCode && !t.player2Id);
             if (!joiningTeam) return res.status(404).json({ success: false, message: 'Invalid or full team code.' });
          } else if (partnerId) {
             joiningTeam = teams.find(t => t.player1Id === partnerId && !t.player2Id);
             if (!joiningTeam) return res.status(404).json({ success: false, message: 'Partner already has a full team or is not registered.' });
          }
        }
      }

      // 2. Capacity Guard (Server-Side)
      const registeredCount = (tData.registeredPlayerIds || []).length;
      const pendingCount = (tData.pendingPaymentPlayerIds || []).filter(pid => pid !== userId && pid !== registeringPartnerId).length;
      const max = tData.maxPlayers || Infinity;
      
      if (registeredCount + pendingCount + slotsNeeded > max) {
        return res.status(400).json({ success: false, message: 'Slots Full', type: 'FULL' });
      }

      // 3. Fetch current user
      const currentUserDoc = await Player.findOne({ id: userId });
      if (!currentUserDoc) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      
      const pData = currentUserDoc.data || {};
      const currentCredits = pData.credits || 0;

      // 4. Validate Funds
      if (method === 'credits' && totalCost > 0 && currentCredits < totalCost) {
        return res.status(400).json({ success: false, message: 'Insufficient credits' });
      }

      // 5. Calculate Referral Bonus
      const isFirstRegistration = (pData.registeredTournamentIds || []).length === 0;
      const referralBonus = (isFirstRegistration && pData.referredBy) ? 100 : 0;

      // 6. Execute Atomic Updates
      const lowerUsersToRegister = usersToRegister.map(u => String(u).toLowerCase());
      const caseInsensitiveUsers = usersToRegister.flatMap(u => [u, String(u).toLowerCase(), new RegExp(`^${u}$`, 'i')]);

      // A. Update Tournament
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

      // 🛡️ [v2.6.615] Lowercase all player IDs in doublesTeams for consistency
      const lowerUserId = String(userId).toLowerCase();
      if (isDoubles) {
        if (joiningTeam) {
          // Update the existing team to add player2Id using the positional operator for atomic safety
          tUpdate.$set['data.doublesTeams.$.player2Id'] = lowerUserId;
          tUpdate.$set['data.doublesTeams.$.updatedAt'] = new Date().toISOString();
        } else {
          // Create a new team
          const teamId = `team_${Date.now()}`;
          newTeamCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
          tUpdate.$push = {
            'data.doublesTeams': {
              id: teamId,
              teamCode: newTeamCode,
              player1Id: lowerUserId,
              player2Id: registeringPartnerId ? String(registeringPartnerId).toLowerCase() : null,
              createdAt: new Date().toISOString()
            }
          };
        }
      }

      // 🛡️ [v2.6.615] Per user request: UPI now registers directly (no pending).
      // Only 'pending' method goes to pendingPaymentPlayerIds.
      if (method === 'pending') {
         tUpdate.$addToSet['data.pendingPaymentPlayerIds'] = { $each: lowerUsersToRegister };
         tUpdate.$pull['data.registeredPlayerIds'] = { $in: caseInsensitiveUsers };
         for (const uId of lowerUsersToRegister) {
           tUpdate.$set[`data.pendingPaymentTimestamps.${uId}`] = Date.now();
           tUpdate.$set[`data.playerPaymentMethods.${uId}`] = { method, cost: individualCost, timestamp: new Date().toISOString(), paidBy: userId };
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
           // 🛡️ Ensure individualCost is recorded to prevent double refunds
           tUpdate.$set[`data.playerPaymentMethods.${lowerUId}`] = { method, cost: individualCost, timestamp: new Date().toISOString(), paidBy: userId };
         }
      }

      // 7. Concurrency Guard & Atomic Update
      const query = { id: tid };
      if (isDoubles && joiningTeam) {
        query['data.doublesTeams'] = { $elemMatch: { id: joiningTeam.id, player2Id: null } };
      }

      const updatedTournament = await Tournament.findOneAndUpdate(
        query,
        tUpdate,
        { new: true }
      );

      if (!updatedTournament) {
        return res.status(409).json({ 
          success: false, 
          message: 'The slot you are trying to book was just taken by someone else. Please try another team or refresh.' 
        });
      }

      // B. Update Current User
      const pUpdate = {
        $addToSet: { 'data.registeredTournamentIds': tid },
        $set: { lastUpdated: new Date() }
      };

      // Handle deductions and bonuses
      let netCreditChange = 0;
      let walletEntries = [];

      if (method === 'credits' && totalCost > 0) {
        netCreditChange -= totalCost;
        walletEntries.push({
          id: `reg-deduct-${Date.now()}`,
          amount: -totalCost,
          type: 'debit',
          description: `Registration for ${tData.title}`,
          date: new Date().toISOString()
        });
      }

      if (referralBonus > 0) {
        netCreditChange += referralBonus;
        walletEntries.push({
          id: `ref-ref-${Date.now()}`,
          amount: referralBonus,
          type: 'credit',
          description: `Referral Reward (Referee Bonus)`,
          date: new Date().toISOString()
        });
      }

      if (netCreditChange !== 0) {
        pUpdate.$inc = { 'data.credits': netCreditChange };
      }
      if (walletEntries.length > 0) {
        pUpdate.$push = {
          'data.walletHistory': {
            $each: walletEntries,
            $position: 0
          }
        };
      }

      const updatedUser = await Player.findOneAndUpdate(
        { id: userId },
        pUpdate,
        { new: true }
      );

      // C. Update Partner if applicable
      if (registeringPartnerId && partnerDoc) {
        const partnerUpdate = {
          $addToSet: { 'data.registeredTournamentIds': tid },
          $set: { lastUpdated: new Date() }
        };
        
        // Notifications for partner
        const notifTitle = `Tournament Registration`;
        const notifBody = `${pData.name || 'Your partner'} has registered you for "${tData.title}"!`;
        
        let pDataMut = partnerDoc.data || {};
        pDataMut.notifications = pDataMut.notifications || [];
        addInAppNotification(pDataMut, notifTitle, notifBody, { tournamentId: tid, type: 'TOURNAMENT_PARTNER_REG' });
        partnerUpdate.$set['data.notifications'] = pDataMut.notifications;
        
        if (pDataMut.pushTokens && pDataMut.pushTokens.length > 0) {
          await sendPushNotification(pDataMut.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TOURNAMENT_PARTNER_REG' });
        }
        
        await Player.updateOne({ id: registeringPartnerId }, partnerUpdate);
      }

      // C. Update Referrer (if applicable)
      let updatedReferrer = null;
      if (referralBonus > 0 && pData.referredBy) {
        const referrerId = pData.referredBy.toLowerCase();
        updatedReferrer = await Player.findOneAndUpdate(
          { id: referrerId },
          {
            $inc: { 'data.credits': 100 },
            $push: {
              'data.walletHistory': {
                $each: [{
                  id: `ref-sor-${Date.now()}`,
                  amount: 100,
                  type: 'credit',
                  description: `Referral Reward (Referrer Bonus for ${pData.name || 'User'})`,
                  date: new Date().toISOString()
                }],
                $position: 0
              }
            }
          },
          { new: true }
        );
      }

      // 7. Broadcast update to active clients so they see the slot taken
      if (io) {
        io.emit('entity_updated', {
          entity: 'tournaments',
          data: updatedTournament.data,
          source: 'api',
          timestamp: Date.now()
        });
      }

      return res.status(200).json({
        success: true,
        type: method === 'upi' ? 'UPI_SUCCESS' : 'SUCCESS',
        tournament: updatedTournament.data,
        currentUser: updatedUser.data,
        teamCode: newTeamCode,
        referralBonus
      });

    } catch (err) {
      console.error('[Registration API] Error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/v1/tournaments/:id/optout
  router.post('/:id/optout', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    const { refundToWallet = true, optOutMode = 'individual' } = req.body;

    try {
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      const tData = tournamentDoc.data || {};
      const lowerUserId = String(userId).toLowerCase();
      const wasRegistered = (tData.registeredPlayerIds || []).some(id => String(id).toLowerCase() === lowerUserId);
      const isWaitlisted = (tData.waitlistedPlayerIds || []).some(id => String(id).toLowerCase() === lowerUserId);
      const isPending = (tData.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === lowerUserId);

      if (!wasRegistered && !isWaitlisted && !isPending) {
        // ZOMBIE STATE RECOVERY: The user thinks they are registered, but the tournament doesn't.
        // Clean up the user's document so it stops showing in the Matches tab.
        const updatedUser = await Player.findOneAndUpdate(
          { id: userId },
          { $pull: { 'data.registeredTournamentIds': tid }, $set: { lastUpdated: new Date() } },
          { new: true }
        );
        return res.status(200).json({ 
          success: true, 
          message: 'Cleaned up desynced tournament state.',
          tournament: tData,
          currentUser: updatedUser.data 
        });
      }

      // Determine who actually paid for this slot
      const paymentInfo = tData.playerPaymentMethods ? tData.playerPaymentMethods[lowerUserId] : null;
      let originalPayerId = userId;
      let userPaidCost = tData.entryFee || 0;
      
      if (paymentInfo) {
        if (paymentInfo.paidBy) {
          originalPayerId = paymentInfo.paidBy;
        }
        if (paymentInfo.cost !== undefined) {
          userPaidCost = paymentInfo.cost;
        }
      }

      // Identify team context for doubles
      let teamToOptOut = null;
      let usersToRemove = [userId];
      let lowerUsersToRemove = [lowerUserId];
      let amountToCalculateRefundOn = userPaidCost;

      if (tData.doublesTeams) {
        const team = tData.doublesTeams.find(t => String(t.player1Id).toLowerCase() === lowerUserId || String(t.player2Id).toLowerCase() === lowerUserId);
        if (team) {
          if (optOutMode === 'team' && String(team.player1Id).toLowerCase() === lowerUserId && team.player2Id) {
            // Opting out both players
            usersToRemove = [team.player1Id, team.player2Id];
            lowerUsersToRemove = usersToRemove.map(id => String(id).toLowerCase());
            amountToCalculateRefundOn = tData.entryFee || 0;
            teamToOptOut = team;
          } else {
            // Opting out individually (could be lead or partner)
            amountToCalculateRefundOn = (tData.entryFee || 0) / 2;
          }
        }
      } else {
        amountToCalculateRefundOn = tData.entryFee || 0;
      }

      // 1. Calculate Refund (if applicable)
      let refundAmount = 0;
      let cancellationCharge = 0;
      let cancellationPercent = 0;
      let refundInfo = null;

      if (refundToWallet && amountToCalculateRefundOn > 0 && wasRegistered) {
        // Backend equivalent of getCancellationChargePercent
        const now = Date.now();
        const tournamentTime = new Date(tData.date).getTime();
        const msRemaining = tournamentTime - now;
        const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

        if (daysRemaining >= 5) { cancellationPercent = 0; }
        else if (daysRemaining >= 3) { cancellationPercent = 25; }
        else if (daysRemaining >= 1) { cancellationPercent = 50; }
        else { cancellationPercent = 100; }

        cancellationCharge = Math.round(amountToCalculateRefundOn * (cancellationPercent / 100));
        refundAmount = amountToCalculateRefundOn - cancellationCharge;

        refundInfo = {
          entryFee: amountToCalculateRefundOn,
          cancellationPercent,
          cancellationCharge,
          refundAmount,
          daysRemaining: Math.max(0, Math.floor(daysRemaining)),
          timestamp: new Date().toISOString(),
          playerId: userId,
          refundedTo: originalPayerId,
          isTeamOptOut: optOutMode === 'team'
        };
      }

      // 2. Prepare Tournament Updates
      let updatedRegistered = (tData.registeredPlayerIds || []).filter(id => !lowerUsersToRemove.includes(String(id).toLowerCase()));
      let updatedPending = (tData.pendingPaymentPlayerIds || []).filter(id => !lowerUsersToRemove.includes(String(id).toLowerCase()));
      let updatedWaitlisted = (tData.waitlistedPlayerIds || []).filter(id => !lowerUsersToRemove.includes(String(id).toLowerCase()));

      const tUpdate = {
        $addToSet: {
          'data.optedOutPlayerIds': { $each: lowerUsersToRemove }
        },
        $set: {
          lastUpdated: new Date()
        },
        $unset: {}
      };

      for (const uId of usersToRemove) {
        const lId = String(uId).toLowerCase();
        tUpdate.$set[`data.playerStatuses.${lId}`] = 'Opted-Out';
        tUpdate.$unset[`data.pendingPaymentTimestamps.${uId}`] = "";
        tUpdate.$unset[`data.pendingPaymentTimestamps.${lId}`] = "";
        tUpdate.$unset[`data.playerPaymentMethods.${uId}`] = "";
        tUpdate.$unset[`data.playerPaymentMethods.${lId}`] = "";
        if (uId !== lId) {
          tUpdate.$unset[`data.playerStatuses.${uId}`] = "";
        }
      }

      if (Object.keys(tUpdate.$unset).length === 0) {
        delete tUpdate.$unset;
      }

      if (tData.doublesTeams && tData.doublesTeams.length > 0) {
        if (optOutMode === 'team' && teamToOptOut) {
          // Remove the team entirely
          const newTeams = tData.doublesTeams.filter(t => t.id !== teamToOptOut.id);
          tUpdate.$set['data.doublesTeams'] = newTeams;
        } else {
          // Individual opt-out: remove just the opting-out user from their team
          const newTeams = tData.doublesTeams.map(team => {
            const lowerUserIdOptingOut = String(userId).toLowerCase();
            const lowerP1 = team.player1Id ? String(team.player1Id).toLowerCase() : null;
            const lowerP2 = team.player2Id ? String(team.player2Id).toLowerCase() : null;

            if (lowerP1 === lowerUserIdOptingOut) {
              if (team.player2Id) {
                // Shift player2 to player1 to keep the team alive and waiting for a new partner
                return { ...team, player1Id: team.player2Id, player2Id: null };
              }
              return { ...team, player1Id: null };
            }
            if (lowerP2 === lowerUserIdOptingOut) {
              return { ...team, player2Id: null };
            }
            return team;
          }).filter(team => team.player1Id !== null || team.player2Id !== null);
          tUpdate.$set['data.doublesTeams'] = newTeams;
        }
      }

      if (refundInfo) {
        tUpdate.$push = { 'data.refundHistory': refundInfo };
      }

      // 3. Handle Auto-Promotion from Waitlist
      let promotedId = null;
      let isPaid = amountToCalculateRefundOn > 0;
      
      if (wasRegistered && updatedWaitlisted.length > 0) {
        // We might need to promote multiple people if optOutMode === 'team'
        const numToPromote = Math.min(updatedWaitlisted.length, usersToRemove.length);
        
        if (numToPromote > 0) {
          const promotedIds = updatedWaitlisted.slice(0, numToPromote);
          promotedId = promotedIds[0]; // (Returning first one for legacy compatibility in response)
          
          updatedWaitlisted = updatedWaitlisted.filter(id => !promotedIds.includes(id));
          
          if (isPaid) {
            updatedPending = [...new Set([...updatedPending, ...promotedIds])];
            promotedIds.forEach(pid => {
              tUpdate.$set[`data.pendingPaymentTimestamps.${pid}`] = Date.now();
            });
          } else {
            updatedRegistered = [...new Set([...updatedRegistered, ...promotedIds])];
          }
          tUpdate.$unset = tUpdate.$unset || {};
          promotedIds.forEach(pid => {
            tUpdate.$unset[`data.playerStatuses.${pid}`] = "";
          });
        }
      }

      tUpdate.$set['data.registeredPlayerIds'] = updatedRegistered;
      tUpdate.$set['data.pendingPaymentPlayerIds'] = updatedPending;
      tUpdate.$set['data.waitlistedPlayerIds'] = updatedWaitlisted;

      const updatedTournament = await Tournament.findOneAndUpdate(
        { id: tid },
        tUpdate,
        { new: true }
      );

      // 4. Refund Logic (routing to originalPayerId)
      let updatedUser = null;

      if (refundAmount > 0) {
        const historyEntry = {
          id: `refund-${Date.now()}`,
          amount: refundAmount,
          type: 'credit',
          description: `Refund for ${tData.title}${cancellationCharge > 0 ? ` (₹${cancellationCharge} cancellation fee deducted)` : ''}`,
          date: new Date().toISOString(),
          refundMeta: { tournamentId: tid, entryFee: amountToCalculateRefundOn, cancellationPercent, cancellationCharge }
        };

        // Credit the original payer
        await Player.findOneAndUpdate(
          { id: originalPayerId },
          {
            $inc: { 'data.credits': refundAmount },
            $push: { 'data.walletHistory': { $each: [historyEntry], $position: 0 } },
            $set: { lastUpdated: new Date() }
          }
        );
      }
      
      // Cleanup registeredTournamentIds for all removed users
      for (const uId of usersToRemove) {
        const updatePayload = {
          $pull: { 'data.registeredTournamentIds': tid },
          $set: { lastUpdated: new Date() }
        };

        let notifTitle = null;
        let notifBody = null;

        if (uId !== userId) {
          notifTitle = 'Tournament Opt-Out';
          notifBody = `Your partner has opted your team out of "${tData.title}".`;
          const notif = {
            id: `notif_optout_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
            title: notifTitle,
            message: notifBody,
            date: new Date().toISOString(),
            read: false,
            type: 'tournament_optout',
            tournamentId: tid
          };
          updatePayload.$push = { 'data.notifications': { $each: [notif], $position: 0 } };
        }

        const pUpdateDoc = await Player.findOneAndUpdate(
          { id: uId },
          updatePayload,
          { new: true }
        );
        
        if (uId === userId) {
          updatedUser = pUpdateDoc;
        } else if (pUpdateDoc && pUpdateDoc.data && pUpdateDoc.data.pushTokens && pUpdateDoc.data.pushTokens.length > 0) {
          sendPushNotification(pUpdateDoc.data.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TOURNAMENT_OPTOUT' }).catch(console.error);
        }
      }

      // 5. Update Promoted Player
      let updatedPromotedPlayer = null;
      if (promotedId) {
        const notif = {
          id: `notif_promote_${Date.now()}`,
          title: 'Slot Opened!',
          message: isPaid 
            ? `A slot opened up in "${tData.title}". You have been promoted from the waitlist! Please complete payment to finalize registration.`
            : `A slot opened up in "${tData.title}". You have been promoted from the waitlist and are now registered!`,
          date: new Date().toISOString(),
          read: false,
          type: 'tournament_registration',
          tournamentId: tid
        };

        const pUpdate = {
          $push: { 'data.notifications': { $each: [notif], $position: 0 } },
          $set: { lastUpdated: new Date() }
        };

        if (!isPaid) {
          pUpdate.$addToSet = { 'data.registeredTournamentIds': tid };
        }

        updatedPromotedPlayer = await Player.findOneAndUpdate(
          { id: promotedId },
          pUpdate,
          { new: true }
        );
      }

      // 6. Broadcast update
      if (io) {
        io.emit('entity_updated', {
          entity: 'tournaments',
          data: updatedTournament.data,
          source: 'api',
          timestamp: Date.now()
        });
      }

      return res.status(200).json({
        success: true,
        tournament: updatedTournament.data,
        currentUser: updatedUser.data,
        refundInfo,
        promotedPlayer: updatedPromotedPlayer ? updatedPromotedPlayer.data : null
      });

    } catch (err) {
      console.error('[OptOut API] Error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // POST /api/v1/tournaments/:id/start
  router.post('/:id/start', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      doc.data.status = 'In Progress';
      doc.data.startedAt = new Date().toISOString();
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) {
        io.emit('entity_updated', {
          entity: 'tournaments',
          data: doc.data,
          source: 'api',
          timestamp: Date.now()
        });
      }
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/end
  router.post('/:id/end', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      doc.data.status = 'Completed';
      doc.data.endedAt = new Date().toISOString();
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) {
        io.emit('entity_updated', {
          entity: 'tournaments',
          data: doc.data,
          source: 'api',
          timestamp: Date.now()
        });
      }
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/remove-coach
  router.post('/:id/remove-coach', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      delete doc.data.assignedCoach;
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) {
        io.emit('entity_updated', {
          entity: 'tournaments',
          data: doc.data,
          source: 'api',
          timestamp: Date.now()
        });
      }
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/manage-interested
  router.post('/:id/manage-interested', authGuard, async (req, res) => {
    const tid = req.params.id;
    const { pid, action } = req.body;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      // 🛡️ Use atomic findOneAndUpdate for thread safety
      const updateQuery = {
        $set: { lastUpdated: new Date() }
      };
      
      const caseInsensitiveIds = [pid, String(pid).toLowerCase(), new RegExp(`^${pid}$`, 'i')];
      updateQuery.$pull = { 'data.interestedPlayerIds': { $in: caseInsensitiveIds } };
      
      if (action === 'accept') {
        updateQuery.$addToSet = { 'data.registeredPlayerIds': String(pid).toLowerCase() };
      }

      const updatedTournament = await Tournament.findOneAndUpdate(
        { id: tid },
        updateQuery,
        { new: true }
      );

      if (!updatedTournament) return res.status(404).json({ error: 'Tournament not found' });

      if (io) io.emit('entity_updated', { entity: 'tournaments', data: updatedTournament.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: updatedTournament.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/remove-pending
  router.post('/:id/remove-pending', authGuard, async (req, res) => {
    const tid = req.params.id;
    const { pid } = req.body;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      const tData = doc.data;
      const lowerPid = String(pid).toLowerCase();
      tData.pendingPaymentPlayerIds = (tData.pendingPaymentPlayerIds || []).filter(id => String(id).toLowerCase() !== lowerPid);
      if (tData.pendingPaymentTimestamps) {
        delete tData.pendingPaymentTimestamps[pid];
        delete tData.pendingPaymentTimestamps[lowerPid];
      }
      
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // DELETE /api/v1/tournaments/:id
  router.delete('/:id', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    try {
      const doc = await Tournament.findOneAndDelete({ id: tid });
      if (!doc) return res.status(404).json({ error: 'Tournament not found' });
      
      // Emit delete event so clients can remove it
      if (io) io.emit('entity_updated', { entity: 'tournaments', deletedId: tid, source: 'api', timestamp: Date.now() });
      res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/decline-coach
  router.post('/:id/decline-coach', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      delete doc.data.assignedCoachId;
      doc.data.coachStatus = 'Coach Declined';
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      // Update Player coachMetrics
      const pDoc = await Player.findOne({ id: req.user.id });
      if (pDoc && pDoc.data) {
        const metrics = pDoc.data.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
        metrics.tournamentsDeclined = (metrics.tournamentsDeclined || 0) + 1;
        pDoc.data.coachMetrics = metrics;
        pDoc.lastUpdated = new Date();
        pDoc.markModified('data');
        await pDoc.save();
      }

      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data, currentUser: pDoc ? pDoc.data : null });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // POST /api/v1/tournaments/:id/confirm-coach
  router.post('/:id/confirm-coach', authGuard, async (req, res) => {
    const tid = req.params.id;
    if (req.user.role !== 'coach') return res.status(403).json({ error: 'Coach only' });

    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      doc.data.assignedCoachId = req.user.id;
      doc.data.coachStatus = 'Coach Confirmed';
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      // Update Player coachMetrics
      const pDoc = await Player.findOne({ id: req.user.id });
      if (pDoc && pDoc.data) {
        const metrics = pDoc.data.coachMetrics || { pingsIgnored: 0, tournamentsDeclined: 0, tournamentsAccepted: 0 };
        metrics.tournamentsAccepted = (metrics.tournamentsAccepted || 0) + 1;
        pDoc.data.coachMetrics = metrics;
        pDoc.lastUpdated = new Date();
        pDoc.markModified('data');
        await pDoc.save();
      }

      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data, currentUser: pDoc ? pDoc.data : null });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🛡️ [VAPT-BL1] (v2.6.556): Waitlist Join — Server-Side Validated
  // ═══════════════════════════════════════════════════════════════
  router.post('/:id/waitlist', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    try {
      const doc = await Tournament.findOne({ id: tid });
      if (!doc) return res.status(404).json({ success: false, message: 'Tournament not found' });
      
      const tData = doc.data || {};
      const waitlisted = tData.waitlistedPlayerIds || [];
      const registered = tData.registeredPlayerIds || [];
      
      const lowerUserId = String(userId).toLowerCase();
      if (registered.some(id => String(id).toLowerCase() === lowerUserId)) return res.status(400).json({ success: false, message: 'Already registered' });
      if (waitlisted.some(id => String(id).toLowerCase() === lowerUserId)) return res.status(400).json({ success: false, message: 'Already on waitlist' });
      
      await Tournament.updateOne({ id: tid }, {
        $addToSet: { 'data.waitlistedPlayerIds': userId },
        $set: { lastUpdated: new Date() }
      });
      
      const updated = await Tournament.findOne({ id: tid });
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: updated.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: updated.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🛡️ [VAPT-BL1] (v2.6.556): Create Tournament — Admin Only
  // ═══════════════════════════════════════════════════════════════
  router.post('/', authGuard, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { tournament } = req.body;
    if (!tournament || !tournament.id) return res.status(400).json({ error: 'Tournament data with id required' });
    
    try {
      const existing = await Tournament.findOne({ id: tournament.id });
      if (existing) return res.status(409).json({ error: 'Tournament with this ID already exists' });
      
      const doc = new Tournament({ id: tournament.id, data: tournament, lastUpdated: new Date() });
      await doc.save();
      
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // 🛡️ [VAPT-BL1] (v2.6.556): Update Tournament — Admin Only
  router.put('/:id', authGuard, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { tournament } = req.body;
    if (!tournament) return res.status(400).json({ error: 'Tournament data required' });
    
    try {
      const doc = await Tournament.findOne({ id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: 'Tournament not found' });
      
      doc.data = { ...doc.data, ...tournament, id: doc.data.id };
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();
      
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // 🛡️ [VAPT-F16] (v2.6.556): Assign Coach — Admin Only
  router.post('/:id/assign-coach', authGuard, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { coachId } = req.body;
    if (!coachId) return res.status(400).json({ error: 'coachId required' });
    
    try {
      const doc = await Tournament.findOne({ id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: 'Tournament not found' });
      
      doc.data.assignedCoachId = coachId;
      doc.data.coachStatus = 'Pending Confirmation';
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();
      
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // 🛡️ [VAPT-F16] (v2.6.556): Coach Comment — Coach or Admin
  router.post('/:id/coach-comment', authGuard, async (req, res) => {
    const { comment } = req.body;
    if (!comment) return res.status(400).json({ error: 'Comment text required' });
    
    try {
      const doc = await Tournament.findOne({ id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: 'Tournament not found' });
      
      // Verify user is assigned coach or admin
      if (doc.data.assignedCoachId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Only the assigned coach or admin can add comments' });
      }
      
      const coachComments = doc.data.coachComments || [];
      coachComments.push({ coachId: req.user.id, comment, timestamp: new Date().toISOString() });
      doc.data.coachComments = coachComments;
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();
      
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // 🛡️ [VAPT-F16] (v2.6.556): Add Player — Admin Only
  router.post('/:id/add-player', authGuard, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    const { playerId, slot } = req.body;
    if (!playerId) return res.status(400).json({ error: 'playerId required' });
    
    try {
      const doc = await Tournament.findOne({ id: req.params.id });
      if (!doc) return res.status(404).json({ success: false, message: 'Tournament not found' });
      
      const registered = doc.data.registeredPlayerIds || [];
      if (registered.includes(playerId)) {
        return res.status(400).json({ success: false, message: 'Player already registered' });
      }
      
      await Tournament.updateOne({ id: req.params.id }, {
        $addToSet: { 'data.registeredPlayerIds': playerId },
        $set: { lastUpdated: new Date() }
      });
      
      const updated = await Tournament.findOne({ id: req.params.id });
      if (io) io.emit('entity_updated', { entity: 'tournaments', data: updated.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: updated.data });
    } catch (e) { res.status(500).json({ error: 'Internal server error' }); }
  });

  // ═══════════════════════════════════════════════════════════════
  // 🤝 POST /api/v1/tournaments/:id/join-team (v2.6.613)
  // Lightweight team-join for ALREADY-REGISTERED doubles players.
  // No payment logic — just assigns player2Id on the target team.
  // ═══════════════════════════════════════════════════════════════
  router.post('/:id/join-team', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    const { teamCode } = req.body;

    if (!teamCode) {
      return res.status(400).json({ success: false, message: 'Team code is required.' });
    }

    try {
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) {
        return res.status(404).json({ success: false, message: 'Tournament not found.' });
      }

      const tData = tournamentDoc.data || {};
      const isDoubles = ["Men's Doubles", "Women's Doubles", "Mixed Doubles"].includes(tData.format);

      if (!isDoubles) {
        return res.status(400).json({ success: false, message: 'Team joining is only available for Doubles formats.' });
      }

      // 1. Verify user is already registered (paid their half)
      const lowerUserId = String(userId).toLowerCase();
      const isRegistered = (tData.registeredPlayerIds || []).some(id => String(id).toLowerCase() === lowerUserId);
      const isPending = (tData.pendingPaymentPlayerIds || []).some(id => String(id).toLowerCase() === lowerUserId);

      if (!isRegistered && !isPending) {
        return res.status(400).json({ 
          success: false, 
          message: 'You must be registered for this tournament before joining a team.' 
        });
      }

      // 2. Check user doesn't already have a complete team
      const teams = tData.doublesTeams || [];
      const existingTeam = teams.find(t => 
        String(t.player1Id).toLowerCase() === lowerUserId || 
        String(t.player2Id).toLowerCase() === lowerUserId
      );

      if (existingTeam && existingTeam.player1Id && existingTeam.player2Id) {
        return res.status(400).json({ 
          success: false, 
          message: 'You already have a complete team for this tournament.' 
        });
      }

      // 3. Find the target team by code
      const targetTeam = teams.find(t => t.teamCode === teamCode && !t.player2Id);
      if (!targetTeam) {
        return res.status(404).json({ 
          success: false, 
          message: 'Invalid team code, or the team is already full.' 
        });
      }

      // 4. Prevent joining your own team
      if (String(targetTeam.player1Id).toLowerCase() === lowerUserId) {
        return res.status(400).json({ success: false, message: 'You cannot join your own team.' });
      }

      // 5. Gender validation
      const userDoc = await Player.findOne({ id: userId });
      if (!userDoc) {
        return res.status(404).json({ success: false, message: 'User not found.' });
      }
      const userGender = userDoc.data?.gender;

      if (tData.format === "Men's Doubles" && userGender !== 'Male') {
        return res.status(400).json({ success: false, message: "Only male players are allowed in Men's Doubles." });
      }
      if (tData.format === "Women's Doubles" && userGender !== 'Female') {
        return res.status(400).json({ success: false, message: "Only female players are allowed in Women's Doubles." });
      }

      // 6. If user had their own incomplete team, dissolve it first
      const updateOps = {
        $set: {
          'data.doublesTeams.$.player2Id': lowerUserId,
          'data.doublesTeams.$.updatedAt': new Date().toISOString(),
          lastUpdated: new Date()
        }
      };

      if (existingTeam && existingTeam.id !== targetTeam.id) {
        // Remove user's old incomplete team
        // We need to do this as a separate step since $pull and positional $set conflict
        await Tournament.updateOne(
          { id: tid },
          { $pull: { 'data.doublesTeams': { id: existingTeam.id } } }
        );

        // Atomic update with concurrency guard
        const updatedTournament = await Tournament.findOneAndUpdate(
          { 
            id: tid, 
            'data.doublesTeams': { $elemMatch: { teamCode: teamCode, player2Id: null } }
          },
          updateOps,
          { new: true }
        );

        if (!updatedTournament) {
          return res.status(409).json({ success: false, message: 'Team was just filled by another player. Please try again.' });
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

          if (pDataMut.pushTokens && pDataMut.pushTokens.length > 0) {
            sendPushNotification(pDataMut.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TEAM_JOINED' }).catch(console.error);
          }
        }

        if (io) {
          io.emit('entity_updated', { entity: 'tournaments', data: updatedTournament.data, source: 'api', timestamp: Date.now() });
        }

        return res.status(200).json({
          success: true,
          tournament: updatedTournament.data,
          currentUser: userDoc.data,
          message: `You have been matched with ${partnerDoc?.data?.name || 'your partner'}!`
        });

      } else {
        // Simple case: no old team to dissolve, just fill player2Id
        const updatedTournament = await Tournament.findOneAndUpdate(
          { 
            id: tid, 
            'data.doublesTeams': { $elemMatch: { teamCode: teamCode, player2Id: null } }
          },
          updateOps,
          { new: true }
        );

        if (!updatedTournament) {
          return res.status(409).json({ success: false, message: 'Team was just filled by another player. Please try again.' });
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

          if (pDataMut.pushTokens && pDataMut.pushTokens.length > 0) {
            sendPushNotification(pDataMut.pushTokens, notifTitle, notifBody, { tournamentId: tid, type: 'TEAM_JOINED' }).catch(console.error);
          }
        }

        if (io) {
          io.emit('entity_updated', { entity: 'tournaments', data: updatedTournament.data, source: 'api', timestamp: Date.now() });
        }

        return res.status(200).json({
          success: true,
          tournament: updatedTournament.data,
          currentUser: userDoc.data,
          message: `You have been matched with ${partnerDoc?.data?.name || 'your partner'}!`
        });
      }

    } catch (err) {
      console.error('[Join-Team API] Error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════
  // 💬 PARTNER CHAT (v2.6.615)
  // GET  /api/v1/tournaments/:id/partner-chat — fetch messages
  // POST /api/v1/tournaments/:id/partner-chat — send a message
  // ═══════════════════════════════════════════════════════════════
  router.get('/:id/partner-chat', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    const lowerUserId = String(userId).toLowerCase();

    try {
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) return res.status(404).json({ success: false, message: 'Tournament not found.' });

      const tData = tournamentDoc.data || {};
      const teams = tData.doublesTeams || [];

      // Find the user's team and verify they have a partner
      const myTeam = teams.find(t =>
        String(t.player1Id).toLowerCase() === lowerUserId ||
        String(t.player2Id).toLowerCase() === lowerUserId
      );

      if (!myTeam || !myTeam.player1Id || !myTeam.player2Id) {
        return res.status(403).json({ success: false, message: 'You do not have a partner in this tournament.' });
      }

      const partnerId = String(myTeam.player1Id).toLowerCase() === lowerUserId
        ? String(myTeam.player2Id).toLowerCase()
        : String(myTeam.player1Id).toLowerCase();

      // Fetch messages between these two players for this tournament
      const { PartnerChatMessage } = await import('../models/index.mjs');
      const messages = await PartnerChatMessage.find({
        tournamentId: tid,
        $or: [
          { senderId: lowerUserId, receiverId: partnerId },
          { senderId: partnerId, receiverId: lowerUserId }
        ]
      }).sort({ timestamp: 1 }).limit(200).lean();

      return res.json({ success: true, messages, partnerId });

    } catch (err) {
      console.error('[Partner-Chat GET] Error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  router.post('/:id/partner-chat', authGuard, async (req, res) => {
    const tid = req.params.id;
    const userId = req.user.id;
    const lowerUserId = String(userId).toLowerCase();
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }

    try {
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) return res.status(404).json({ success: false, message: 'Tournament not found.' });

      const tData = tournamentDoc.data || {};

      // Check tournament date hasn't elapsed (allow chat until tournament day + 1 day buffer)
      if (tData.date) {
        const tournamentDate = new Date(tData.date);
        const bufferDate = new Date(tournamentDate);
        bufferDate.setDate(bufferDate.getDate() + 1);
        if (new Date() > bufferDate) {
          return res.status(403).json({ success: false, message: 'Chat is no longer available for past tournaments.' });
        }
      }

      const teams = tData.doublesTeams || [];
      const myTeam = teams.find(t =>
        String(t.player1Id).toLowerCase() === lowerUserId ||
        String(t.player2Id).toLowerCase() === lowerUserId
      );

      if (!myTeam || !myTeam.player1Id || !myTeam.player2Id) {
        return res.status(403).json({ success: false, message: 'You do not have a partner in this tournament.' });
      }

      const partnerId = String(myTeam.player1Id).toLowerCase() === lowerUserId
        ? String(myTeam.player2Id).toLowerCase()
        : String(myTeam.player1Id).toLowerCase();

      // Get sender name
      const senderDoc = await Player.findOne({ id: userId });
      const senderName = senderDoc?.data?.name || 'Unknown';

      const { PartnerChatMessage } = await import('../models/index.mjs');
      const msg = await PartnerChatMessage.create({
        tournamentId: tid,
        senderId: lowerUserId,
        senderName,
        receiverId: partnerId,
        content: content.trim()
      });

      // Broadcast via Socket.io
      if (io) {
        io.to(`user:${partnerId}`).emit('partner_chat_message', {
          tournamentId: tid,
          message: msg.toObject()
        });
      }

      return res.json({ success: true, message: msg.toObject() });

    } catch (err) {
      console.error('[Partner-Chat POST] Error:', err);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  });

  return router;
}
