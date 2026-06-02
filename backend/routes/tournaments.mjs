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
      const wasAlreadyRegistered = (tData.registeredPlayerIds || []).includes(userId);
      const wasPending = (tData.pendingPaymentPlayerIds || []).includes(userId);
      
      // If we are registering a partner, we pay the FULL serverCost. Otherwise, we pay half for doubles.
      const baseCost = (isDoubles && !registeringPartnerId) ? serverCost / 2 : serverCost;
      const cost = (wasAlreadyRegistered || wasPending) ? 0 : baseCost;

      // Find if we are joining an existing team
      let joiningTeam = null;
      let partnerDoc = null;
      if (isDoubles) {
        if (registeringPartnerId) {
          // Verify partner is valid and not already registered
          if ((tData.registeredPlayerIds || []).includes(registeringPartnerId) || 
              (tData.pendingPaymentPlayerIds || []).includes(registeringPartnerId)) {
            return res.status(400).json({ success: false, message: 'Partner is already registered or pending payment.' });
          }
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

      const slotsNeeded = (registeringPartnerId && !wasAlreadyRegistered && !wasPending) ? 2 : 1;
      
      if (registeredCount + pendingCount + slotsNeeded > max && !wasAlreadyRegistered && !wasPending) {
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
      if (method === 'credits' && cost > 0 && currentCredits < cost) {
        return res.status(400).json({ success: false, message: 'Insufficient credits' });
      }

      // 5. Calculate Referral Bonus
      const isFirstRegistration = (pData.registeredTournamentIds || []).length === 0;
      const referralBonus = (isFirstRegistration && pData.referredBy) ? 100 : 0;

      // 6. Execute Atomic Updates
      const usersToRegister = registeringPartnerId ? [userId, registeringPartnerId] : [userId];
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

      if (isDoubles) {
        if (joiningTeam) {
          // Update the existing team to add player2Id
          const teamIndex = tData.doublesTeams.findIndex(t => t.id === joiningTeam.id);
          if (teamIndex !== -1) {
            tUpdate.$set[`data.doublesTeams.${teamIndex}.player2Id`] = userId;
            tUpdate.$set[`data.doublesTeams.${teamIndex}.updatedAt`] = new Date().toISOString();
          }
        } else {
          // Create a new team
          const teamId = `team_${Date.now()}`;
          newTeamCode = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6 chars
          tUpdate.$push = {
            'data.doublesTeams': {
              id: teamId,
              teamCode: newTeamCode,
              player1Id: userId,
              player2Id: registeringPartnerId || null,
              createdAt: new Date().toISOString()
            }
          };
        }
      }

      if (method === 'pending' || method === 'upi') {
         tUpdate.$addToSet['data.pendingPaymentPlayerIds'] = { $each: lowerUsersToRegister };
         tUpdate.$pull['data.registeredPlayerIds'] = { $in: caseInsensitiveUsers };
         for (const uId of lowerUsersToRegister) {
           tUpdate.$set[`data.pendingPaymentTimestamps.${uId}`] = Date.now();
           tUpdate.$set[`data.playerPaymentMethods.${uId}`] = { method, cost, timestamp: new Date().toISOString() };
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
           tUpdate.$set[`data.playerPaymentMethods.${lowerUId}`] = { method, cost, timestamp: new Date().toISOString() };
         }
      }

      // 7. Concurrency Guard & Atomic Update
      const query = { id: tid };
      if (isDoubles && joiningTeam) {
        const teamIndex = tData.doublesTeams.findIndex(t => t.id === joiningTeam.id);
        if (teamIndex !== -1) {
          query[`data.doublesTeams.${teamIndex}.player2Id`] = null;
        }
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

      if (method === 'credits' && cost > 0) {
        netCreditChange -= cost;
        walletEntries.push({
          id: `reg-deduct-${Date.now()}`,
          amount: -cost,
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
    const { refundToWallet = true } = req.body;

    try {
      const tournamentDoc = await Tournament.findOne({ id: tid });
      if (!tournamentDoc) {
        return res.status(404).json({ success: false, message: 'Tournament not found' });
      }

      const tData = tournamentDoc.data || {};
      const entryFee = tData.entryFee || 0;
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

      // 1. Calculate Refund (if applicable)
      let refundAmount = 0;
      let cancellationCharge = 0;
      let cancellationPercent = 0;
      let refundInfo = null;

      if (refundToWallet && entryFee > 0 && wasRegistered) {
        // Backend equivalent of getCancellationChargePercent
        const now = Date.now();
        const tournamentTime = new Date(tData.date).getTime();
        const msRemaining = tournamentTime - now;
        const daysRemaining = msRemaining / (1000 * 60 * 60 * 24);

        if (daysRemaining >= 5) { cancellationPercent = 0; }
        else if (daysRemaining >= 3) { cancellationPercent = 25; }
        else if (daysRemaining >= 1) { cancellationPercent = 50; }
        else { cancellationPercent = 100; }

        cancellationCharge = Math.round(entryFee * (cancellationPercent / 100));
        refundAmount = entryFee - cancellationCharge;

        refundInfo = {
          entryFee,
          cancellationPercent,
          cancellationCharge,
          refundAmount,
          daysRemaining: Math.max(0, Math.floor(daysRemaining)),
          timestamp: new Date().toISOString(),
          playerId: userId
        };
      }

      // 2. Prepare Tournament Updates
      // Fix: Case-insensitive removal for arrays and proper cleanup of timestamps
      const lowerUserId = String(userId).toLowerCase();
      const tUpdate = {
        $pull: {
          'data.registeredPlayerIds': { $in: [userId, lowerUserId, new RegExp(`^${userId}$`, 'i')] },
          'data.pendingPaymentPlayerIds': { $in: [userId, lowerUserId, new RegExp(`^${userId}$`, 'i')] },
          'data.waitlistedPlayerIds': { $in: [userId, lowerUserId, new RegExp(`^${userId}$`, 'i')] }
        },
        $addToSet: {
          'data.optedOutPlayerIds': lowerUserId
        },
        $set: {
          [`data.playerStatuses.${lowerUserId}`]: 'Opted-Out',
          lastUpdated: new Date()
        },
        $unset: {
          [`data.pendingPaymentTimestamps.${userId}`]: "",
          [`data.pendingPaymentTimestamps.${lowerUserId}`]: "",
          [`data.playerPaymentMethods.${userId}`]: "",
          [`data.playerPaymentMethods.${lowerUserId}`]: "",
          [`data.playerStatuses.${userId}`]: ""
        }
      };

      if (tData.doublesTeams && tData.doublesTeams.length > 0) {
        const newTeams = tData.doublesTeams.map(team => {
          if (team.player1Id === userId) return { ...team, player1Id: null };
          if (team.player2Id === userId) return { ...team, player2Id: null };
          return team;
        }).filter(team => team.player1Id !== null || team.player2Id !== null);
        tUpdate.$set['data.doublesTeams'] = newTeams;
      }

      if (refundInfo) {
        tUpdate.$push = { 'data.refundHistory': refundInfo };
      }

      // 3. Handle Auto-Promotion from Waitlist
      let promotedId = null;
      let isPaid = entryFee > 0;
      
      if (wasRegistered && (tData.waitlistedPlayerIds || []).length > 0) {
        // The first person in the waitlist gets promoted
        const waitlist = (tData.waitlistedPlayerIds || []).filter(pid => pid !== userId);
        if (waitlist.length > 0) {
          promotedId = waitlist[0];
          
          tUpdate.$pull['data.waitlistedPlayerIds'] = { $in: [userId, promotedId] };
          
          if (isPaid) {
            tUpdate.$addToSet['data.pendingPaymentPlayerIds'] = promotedId;
            tUpdate.$set[`data.pendingPaymentTimestamps.${promotedId}`] = Date.now();
          } else {
            tUpdate.$addToSet['data.registeredPlayerIds'] = promotedId;
          }
          tUpdate.$unset = tUpdate.$unset || {};
          tUpdate.$unset[`data.playerStatuses.${promotedId}`] = "";
        }
      }

      const updatedTournament = await Tournament.findOneAndUpdate(
        { id: tid },
        tUpdate,
        { new: true }
      );

      // 4. Refund Current User
      let updatedUser = null;
      if (refundAmount > 0) {
        const historyEntry = {
          id: `refund-${Date.now()}`,
          amount: refundAmount,
          type: 'credit',
          description: `Refund for ${tData.title}${cancellationCharge > 0 ? ` (₹${cancellationCharge} cancellation fee deducted)` : ''}`,
          date: new Date().toISOString(),
          refundMeta: { tournamentId: tid, entryFee, cancellationPercent, cancellationCharge }
        };

        updatedUser = await Player.findOneAndUpdate(
          { id: userId },
          {
            $inc: { 'data.credits': refundAmount },
            $pull: { 'data.registeredTournamentIds': tid },
            $push: { 'data.walletHistory': { $each: [historyEntry], $position: 0 } },
            $set: { lastUpdated: new Date() }
          },
          { new: true }
        );
      } else {
        // Just remove from registeredTournamentIds
        updatedUser = await Player.findOneAndUpdate(
          { id: userId },
          {
            $pull: { 'data.registeredTournamentIds': tid },
            $set: { lastUpdated: new Date() }
          },
          { new: true }
        );
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
      const doc = await Tournament.findOne({ id: tid });
      if (!doc || !doc.data) return res.status(404).json({ error: 'Tournament not found' });
      
      const tData = doc.data;
      if (action === 'accept') {
        tData.interestedPlayerIds = (tData.interestedPlayerIds || []).filter(id => id !== pid);
        tData.registeredPlayerIds = [...(tData.registeredPlayerIds || []), pid];
      } else if (action === 'reject') {
        tData.interestedPlayerIds = (tData.interestedPlayerIds || []).filter(id => id !== pid);
      }
      
      doc.lastUpdated = new Date();
      doc.markModified('data');
      await doc.save();

      if (io) io.emit('entity_updated', { entity: 'tournaments', data: doc.data, source: 'api', timestamp: Date.now() });
      res.json({ success: true, tournament: doc.data });
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
      tData.pendingPaymentPlayerIds = (tData.pendingPaymentPlayerIds || []).filter(id => id !== pid);
      if (tData.pendingPaymentTimestamps) delete tData.pendingPaymentTimestamps[pid];
      
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
      
      if (registered.includes(userId)) return res.status(400).json({ success: false, message: 'Already registered' });
      if (waitlisted.includes(userId)) return res.status(400).json({ success: false, message: 'Already on waitlist' });
      
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

  return router;
}
