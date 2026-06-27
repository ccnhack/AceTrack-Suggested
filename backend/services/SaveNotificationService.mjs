import crypto from 'crypto';
import { CoachInvite } from '../models/index.mjs';

export async function processNotificationHooks(deps, { req, changedKeys, currentData, newMasterData }) {
    const { addInAppNotification, sendPushNotification, sendCoachInviteEmail, logAudit } = deps;
    try {
// ═══════════════════════════════════════════════════════════════
// 🔔 NOTIFICATION HOOKS (v2.6.84)
// ═══════════════════════════════════════════════════════════════
  // 1. Match Events (Challenges, Court Start, Score Reported)
  if (changedKeys.includes('matches')) {
    const incomingMatches = req.body.matches || [];
    const existingMatches = currentData.matches || [];

    for (const match of incomingMatches) {
      const existing = existingMatches.find(em => em.id === match.id);
      const isNew = !existing;

      // 1a. New Match Challenges
      if (isNew && (match.status === 'scheduled' || match.status === 'Pending')) {
        const opponentId = match.player2Id || match.opponentId;
        const challengerId = match.player1Id || match.challengerId;
        const opponent = newMasterData.players.find(p => p.id === opponentId);
        const challenger = newMasterData.players.find(p => p.id === challengerId);
        if (opponent) {
          const t = "New Match Challenge! 🎾";
          const b = `${challenger?.name || 'Someone'} challenged you to a match.`;
          addInAppNotification(opponent, t, b, { matchId: match.id, type: 'MATCH_CHALLENGE' });
          if (opponent.pushTokens?.length > 0) sendPushNotification(opponent.pushTokens, t, b, { matchId: match.id, type: 'MATCH_CHALLENGE' });
        }
      }

      // 1b. Match Starting (Court Assignment)
      if (existing && existing.status !== 'In Progress' && match.status === 'In Progress') {
        const p1 = newMasterData.players.find(p => p.id === match.player1Id);
        const p2 = newMasterData.players.find(p => p.id === match.player2Id);
        const courtText = match.courtNumber ? ` on Court ${match.courtNumber}` : '';
        const t = "Match Starting! 🎾";
        const b = `Your match is starting now${courtText}. Please proceed to the court!`;
        [p1, p2].forEach(p => {
          if (p) {
            addInAppNotification(p, t, b, { matchId: match.id, type: 'MATCH_START' });
            if (p.pushTokens?.length > 0) sendPushNotification(p.pushTokens, t, b, { matchId: match.id, type: 'MATCH_START' });
          }
        });
      }

      // 1c. Match Completed / Score Reported
      if (existing && existing.status !== 'Completed' && match.status === 'Completed') {
        const p1 = newMasterData.players.find(p => p.id === match.player1Id);
        const p2 = newMasterData.players.find(p => p.id === match.player2Id);
        const winner = newMasterData.players.find(p => p.id === match.winnerId);
        const scoreText = match.resultText || 'Score submitted';
        [p1, p2].forEach(p => {
          if (p) {
            const isWinner = p.id === match.winnerId;
            const t = isWinner ? "Match Won! 🏆" : "Match Complete 🎾";
            const b = isWinner ? `Congratulations! You won (${scoreText}).` : `Match result: ${scoreText}. ${winner?.name || 'Opponent'} wins.`;
            addInAppNotification(p, t, b, { matchId: match.id, type: 'MATCH_COMPLETED' });
            if (p.pushTokens?.length > 0) sendPushNotification(p.pushTokens, t, b, { matchId: match.id, type: 'MATCH_COMPLETED' });
          }
        });

        // 1d. Alert Organizer & Coach
        if (match.tournamentId) {
           const tournament = newMasterData.tournaments?.find(t => t.id === match.tournamentId);
           if (tournament) {
             const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
             const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
             const tOrganizers = "Match Completed 📋";
             const bOrganizers = `${p1?.name || 'P1'} vs ${p2?.name || 'P2'} has concluded (${scoreText}).`;
             [organizer, coach].forEach(staff => {
               if (staff) {
                 addInAppNotification(staff, tOrganizers, bOrganizers, { matchId: match.id, type: 'ORG_MATCH_COMPLETED' });
                 if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, tOrganizers, bOrganizers, { matchId: match.id, type: 'ORG_MATCH_COMPLETED' });
               }
             });
           }
        }
      }
    }
  }

  // 2. Video Approvals & Uploads
  if (changedKeys.includes('matchVideos')) {
    const incomingVideos = req.body.matchVideos || [];
    const existingVideos = currentData.matchVideos || [];
    
    for (const video of incomingVideos) {
      const existing = existingVideos.find(ev => ev.id === video.id);
      const isNew = !existing;
      const justApproved = video.adminStatus === 'Active' && (!existing || existing.adminStatus !== 'Active');
      
      if (isNew && video.adminStatus === 'Pending') {
        // Alert Admins of new video upload requiring approval
        const admins = newMasterData.players.filter(p => p.role === 'admin' || p.data?.role === 'admin');
        admins.forEach(admin => {
          const t = "New Video Upload 🎥";
          const b = "A new match recording is pending admin review.";
          addInAppNotification(admin, t, b, { videoId: video.id, type: 'ADMIN_VIDEO_REVIEW' });
          if (admin.pushTokens?.length > 0) sendPushNotification(admin.pushTokens, t, b, { videoId: video.id, type: 'ADMIN_VIDEO_REVIEW' });
        });
      }

      if (justApproved && video.playerIds) {
        video.playerIds.forEach(pId => {
          const player = newMasterData.players.find(p => p.id === pId);
          if (player) {
            const title = "New Match Recording! 🎥";
            const body = "A recording of your recent match is now available to view.";
            
            addInAppNotification(player, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
            
            if (player.pushTokens?.length > 0) {
              sendPushNotification(player.pushTokens, title, body, { videoId: video.id, type: 'VIDEO_AVAILABLE' });
            }
          }
        });
      }
    }
  }

  // 3. Support Ticket Replies & Auto-Assignment
  if (changedKeys.includes('supportTickets')) {
    const incomingTickets = req.body.supportTickets || [];
    const existingTickets = currentData.supportTickets || [];
    
    // 🛡️ [DATA VALIDATION] (v2.6.171)
    // Guard against "Ghost Tickets" by rejecting malformed payloads
    // 🛡️ [PRODUCTION HARDENING] (v2.6.319): Response already sent above — log only, don't send another response
    const invalidTickets = incomingTickets.filter(t => !t.title || t.title === 'undefined' || !t.description || t.description === 'undefined');
    if (invalidTickets.length > 0) {
      console.warn(`🛡️ [GUARD] Detected ${invalidTickets.length} malformed tickets in post-save notification hook. Skipping ticket notifications.`);
    }

    for (let i = 0; i < incomingTickets.length; i++) {
      const ticket = incomingTickets[i];
      const existing = existingTickets.find(et => et.id === ticket.id);
      const isNew = !existing;
      const newMessages = (ticket.messages || []).slice(existing ? existing.messages.length : 0);
      
      if (isNew) {
         logAudit(req, 'TICKET_CREATED', ['supportTickets'], { ticketId: ticket.id, type: ticket.type, title: ticket.title });
         // 🛡️ [STAFF_TICKET_NOTIFICATION_SCOPE] (v2.6.345): Staff tickets notify admin only
         const creatorPlayer = newMasterData.players.find(p =>
           String(p.id).toLowerCase() === String(ticket.userId || '').toLowerCase()
         );
         const isStaffTicket = creatorPlayer && creatorPlayer.role === 'support';
         const staffList = newMasterData.players.filter(p =>
           isStaffTicket
             ? (p.role === 'admin' || p.data?.role === 'admin') // Staff tickets: admin only
             : (p.role === 'admin' || p.role === 'support' || p.data?.role === 'admin' || p.data?.role === 'support')
         );
         staffList.forEach(staff => {
           const t = "New Support Ticket 🎫";
           const b = `A user opened a new support ticket: "${ticket.title}"`;
           addInAppNotification(staff, t, b, { ticketId: ticket.id, type: 'ADMIN_NEW_TICKET' });
           if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, t, b, { ticketId: ticket.id, type: 'ADMIN_NEW_TICKET' });
         });
      }
      for (const msg of newMessages) {
        // 🛡️ [NOTIFY] v2.6.96: Harden identity comparison 
        if (String(msg.senderId) !== String(ticket.userId)) {
          const user = newMasterData.players.find(p => String(p.id) === String(ticket.userId));
          if (user && user.pushTokens?.length > 0) {
            sendPushNotification(
              user.pushTokens, 
              "Support Ticket Reply ✉️", 
              `New reply regarding your ticket: "${ticket.title}"`,
              { ticketId: ticket.id, type: 'SUPPORT_REPLY' }
            );
          }
          break; // Only notify once per sync batch
        }
      }
    }
  }

  // 4. Tournament Events (v2.6.500 — Comprehensive)
  if (changedKeys.includes('tournaments')) {
    const incomingTournaments = req.body.tournaments || [];
    const existingTournaments = currentData.tournaments || [];

    for (const tournament of incomingTournaments) {
      const existing = existingTournaments.find(et => et.id === tournament.id);
      const allPlayerIds = [...new Set([...(tournament.registeredPlayerIds || []), ...(tournament.pendingPaymentPlayerIds || [])])].filter(Boolean);

      const notifyAllPlayers = (title, body, dataPayload) => {
        for (const pid of allPlayerIds) {
          const player = newMasterData.players.find(p => String(p.id) === String(pid));
          if (player) {
            addInAppNotification(player, title, body, dataPayload);
            if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, title, body, dataPayload);
          }
        }
      };

      // 4a. New Registrations (pending → registered payment confirmed)
      const incomingRegIds = tournament.registeredPlayerIds || [];
      const existingRegIds = existing ? (existing.registeredPlayerIds || []) : [];
      const newRegIds = incomingRegIds.filter(id => !existingRegIds.includes(id));
      for (const playerId of newRegIds) {
        const player = newMasterData.players.find(p => p.id === playerId);
        if (player) {
          const t = "Registration Confirmed! 🏆";
          const b = `You're officially registered for ${tournament.title}. Good luck!`;
          addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
          if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_REGISTRATION' });
          
          // Alert Organizer & Coach
          const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
          const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
          const oT = "New Player Registered 🎫";
          const oB = `${player.name} has registered for ${tournament.title}.`;
          [organizer, coach].forEach(staff => {
            if (staff) {
              addInAppNotification(staff, oT, oB, { tournamentId: tournament.id, type: 'ORG_NEW_REGISTRATION' });
              if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'ORG_NEW_REGISTRATION' });
            }
          });
        }
      }

      // 4b. Waitlist / Pending Additions
      const incomingWaitlistIds = tournament.waitlistedPlayerIds || [];
      const existingWaitlistIds = existing ? (existing.waitlistedPlayerIds || []) : [];
      const newWaitlistIds = incomingWaitlistIds.filter(id => !existingWaitlistIds.includes(id));
      if (newWaitlistIds.length > 0) {
        const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
        const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
        const oT = "New Waitlist Entry ⏳";
        const oB = `${newWaitlistIds.length} player(s) joined the waitlist for ${tournament.title}.`;
        [organizer, coach].forEach(staff => {
          if (staff) {
            addInAppNotification(staff, oT, oB, { tournamentId: tournament.id, type: 'ORG_WAITLIST_ENTRY' });
            if (staff.pushTokens?.length > 0) sendPushNotification(staff.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'ORG_WAITLIST_ENTRY' });
          }
        });
      }

      // 4c. Check-In Confirmation
      const incomingStatuses = tournament.playerStatuses || {};
      const existingStatuses = existing ? (existing.playerStatuses || {}) : {};
      for (const [playerId, status] of Object.entries(incomingStatuses)) {
        if (status === 'Checked-In' && existingStatuses[playerId] !== 'Checked-In') {
          const player = newMasterData.players.find(p => String(p.id) === String(playerId));
          if (player) {
            const t = "Check-In Confirmed! ✅";
            const b = `You have successfully checked in for ${tournament.title}.`;
            addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_CHECKIN' });
            if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_CHECKIN' });
            
            // Alert Coach
            const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
            if (coach) {
              const oT = "Player Checked-In ✅";
              const oB = `${player.name} has checked in for ${tournament.title}.`;
              addInAppNotification(coach, oT, oB, { tournamentId: tournament.id, type: 'COACH_PLAYER_CHECKIN' });
              if (coach.pushTokens?.length > 0) sendPushNotification(coach.pushTokens, oT, oB, { tournamentId: tournament.id, type: 'COACH_PLAYER_CHECKIN' });
            }
          }
        }

        // 4d. Player Denied
        if (status === 'Denied' && existingStatuses[playerId] !== 'Denied') {
          const player = newMasterData.players.find(p => String(p.id) === String(playerId));
          if (player) {
            const t = "Registration Denied ❌";
            const b = `Your registration for ${tournament.title} was not approved by the organizer.`;
            addInAppNotification(player, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_DENIED' });
            if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { tournamentId: tournament.id, type: 'TOURNAMENT_DENIED' });
          }
        }
      }

      // 4e. Tournament Started
      if (existing && !existing.tournamentStarted && tournament.tournamentStarted) {
        notifyAllPlayers(
          "Tournament Started! 🏁",
          `${tournament.title} has officially started. Check the bracket for your match assignments!`,
          { tournamentId: tournament.id, type: 'TOURNAMENT_STARTED' }
        );
      }

      // 4e. Tournament Concluded
      if (existing && !existing.tournamentConcluded && tournament.tournamentConcluded) {
        notifyAllPlayers(
          "Tournament Concluded! 🏆",
          `${tournament.title} has ended. Check the leaderboard for final results.`,
          { tournamentId: tournament.id, type: 'TOURNAMENT_CONCLUDED' }
        );
      }

      // 4f. Tournament Rescheduled (date or time changed)
      if (existing && (existing.date !== tournament.date || existing.time !== tournament.time)) {
        const changeText = existing.date !== tournament.date ? `New date: ${tournament.date}` : `New time: ${tournament.time}`;
        notifyAllPlayers(
          "Tournament Rescheduled 📅",
          `${tournament.title} has been rescheduled. ${changeText}.`,
          { tournamentId: tournament.id, type: 'TOURNAMENT_RESCHEDULED' }
        );
      }

      // 4g. Coach Assigned
      if (existing && !existing.assignedCoachId && tournament.assignedCoachId) {
        const coach = newMasterData.players.find(p => p.id === tournament.assignedCoachId);
        if (coach) {
          let isAvailable = true;
          if (tournament.date && tournament.time) {
            const d = new Date(tournament.date);
            if (!isNaN(d.getTime())) {
              const tDayOfWeek = d.getDay();
              const parts = tournament.time.split(' ');
              let tTime24 = '';
              if (parts.length === 2) {
                let [hours, minutes] = parts[0].split(':');
                if (hours === '12') hours = '00';
                if (parts[1].toUpperCase() === 'PM') hours = (parseInt(hours, 10) + 12).toString();
                hours = hours.toString().padStart(2, '0');
                tTime24 = `${hours}:${minutes}`;
              } else {
                tTime24 = tournament.time;
              }

              const avail = coach.availability || [];
              isAvailable = avail.some(slot => slot.dayOfWeek === tDayOfWeek && tTime24 >= slot.startTime && tTime24 < slot.endTime);
            }
          }

          if (isAvailable) {
            const t = "Tournament Assignment 🎓";
            const b = `You have been assigned as coach for ${tournament.title}.`;
            addInAppNotification(coach, t, b, { tournamentId: tournament.id, type: 'COACH_ASSIGNED' });
            if (coach.pushTokens?.length > 0) sendPushNotification(coach.pushTokens, t, b, { tournamentId: tournament.id, type: 'COACH_ASSIGNED' });
          } else {
            console.log(`🛑 [NOTIFY_GUARD] Skipping Coach Assignment notification for ${coach.id} - Coach is unavailable.`);
          }
        }
      }
      // 4h. Coach Invitation Dispatch (Off-Platform Invites)
      if (tournament.coachStatus === 'Pending Coach Registration' && tournament.invitedCoachDetails) {
        const inviteEmail = tournament.invitedCoachDetails.email?.toLowerCase().trim();
        if (inviteEmail) {
          // Check if invite already exists
          CoachInvite.findOne({ tournamentId: tournament.id, email: inviteEmail }).then(async existingInvite => {
            if (!existingInvite) {
              console.log(`[INVITE] Generating secure coach invite for ${inviteEmail} (Tournament: ${tournament.id})`);
              const token = crypto.randomBytes(24).toString('hex');
              // Expire in 48 hours as per admin config
              const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); 
              
              const organizer = newMasterData.players.find(p => p.id === tournament.creatorId);
              const academyName = organizer?.name || organizer?.username || 'An Academy';

              await CoachInvite.create({
                email: inviteEmail,
                name: tournament.invitedCoachDetails.name || '',
                phone: tournament.invitedCoachDetails.phone || '',
                academyId: tournament.creatorId || 'unknown',
                tournamentId: tournament.id,
                token,
                expiresAt
              });

              const inviteLink = `https://acetrack-suggested.onrender.com/signup?invite_token=${token}`;
              
              // Fire off email dispatch in background
              if (sendCoachInviteEmail) {
                 sendCoachInviteEmail(inviteEmail, tournament.invitedCoachDetails.name, academyName, tournament.title, inviteLink, expiresAt)
                   .then(res => console.log(`[INVITE] Email dispatch result for ${inviteEmail}:`, res))
                   .catch(err => console.error(`[INVITE] Email dispatch failed for ${inviteEmail}:`, err));
              }
            }
          }).catch(err => console.error("[INVITE] Error checking coach invites:", err));
        }
      }
    }
  }

  // 4h. Evaluations Available
  if (changedKeys.includes('evaluations')) {
    const incomingEvals = req.body.evaluations || [];
    const existingEvals = currentData.evaluations || [];
    const newEvals = incomingEvals.filter(e => e && !existingEvals.some(ee => ee.id === e.id));
    for (const ev of newEvals) {
      const player = newMasterData.players.find(p => String(p.id) === String(ev.playerId));
      if (player) {
        const t = "New Evaluation! 📋";
        const b = `A coach has submitted a performance evaluation for you. Check your profile for details.`;
        addInAppNotification(player, t, b, { evaluationId: ev.id, type: 'EVALUATION_AVAILABLE' });
        if (player.pushTokens?.length > 0) sendPushNotification(player.pushTokens, t, b, { evaluationId: ev.id, type: 'EVALUATION_AVAILABLE' });
      }
    }
  }

  // 5. Waitlist Promotions (New in v2.6.97)
  if (newMasterData.tournaments && Array.isArray(newMasterData.tournaments)) {
    for (const tournament of newMasterData.tournaments) {
      if (tournament && tournament._justPromotedIds && tournament._justPromotedIds.length > 0) {
        console.log(`📡 [NOTIFY_DEBUG] Dispatching promotion notifications for ${tournament._justPromotedIds.length} players in ${tournament.title}`);
        for (const playerId of tournament._justPromotedIds) {
          const player = newMasterData.players.find(p => String(p.id) === String(playerId));
          if (player) {
            const title = "Off the Waitlist! 🎾";
            const body = `A slot opened up in ${tournament.title}. Pay now to secure your spot!`;
            
            // 🛡️ [NOTIFY_DEBUG] In-app notification already persisted before save
            
            if (player.pushTokens?.length > 0) {
              sendPushNotification(player.pushTokens, title, body, { tournamentId: tournament.id, type: 'TOURNAMENT_PROMOTION' });
            }
          }
        }
        delete tournament._justPromotedIds; // Cleanup temporary field
      }
    }
  }

  // 6. Matchmaking Challenges (New in v2.6.92)
  if (changedKeys.includes('matchmaking')) {
    const incomingMatchmaking = req.body.matchmaking || [];
    const existingMatchmaking = currentData.matchmaking || [];
    
    console.log(`[NOTIFY_DEBUG] Auditing ${incomingMatchmaking.length} matchmaking requests for notifications`);
    
    for (const mm of incomingMatchmaking) {
      const existing = existingMatchmaking.find(emm => emm.id === mm.id);
      const isNewItem = !existing;
      const statusChanged = existing && mm.status !== existing.status;
      const slotChanged = existing && (mm.proposedDate !== existing.proposedDate || mm.proposedTime !== existing.proposedTime);
      
      if (isNewItem || statusChanged || slotChanged) {
        // Determine recipient
        let recipientId = null;
        let title = "";
        let body = "";
        
        if (isNewItem && mm.status === 'Pending') {
          recipientId = mm.receiverId;
          title = "New Match Challenge! 🎾";
          body = `${mm.senderName || 'Someone'} challenged you to a match on ${mm.proposedDate} at ${mm.proposedTime}.`;
        } else if (statusChanged || slotChanged) {
          // Notify the other party
          recipientId = (mm.lastUpdatedBy === mm.senderId) ? mm.receiverId : mm.senderId;
          
          if (mm.status === 'Countered') {
            title = "Counter Proposal Received! 🔄";
            body = `${mm.lastUpdatedByName || 'The opponent'} suggested a new time: ${mm.proposedDate} at ${mm.proposedTime}.`;
          } else if (mm.status === 'Accepted') {
            title = "Match Accepted! ✅";
            body = `Your match for ${mm.proposedDate} at ${mm.proposedTime} has been confirmed.`;
          } else if (mm.status === 'Declined') {
            title = "Challenge Declined ❌";
            body = `The match challenge for ${mm.proposedDate} has been declined.`;
          }
        }
        
        if (recipientId) {
          const recipient = newMasterData.players.find(p => p.id === recipientId);
          if (recipient) {
            console.log(`[NOTIFY_DEBUG] Triggering matchmaking notify for ${recipientId}: ${title}`);
            addInAppNotification(recipient, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
            
            if (recipient.pushTokens?.length > 0) {
              sendPushNotification(recipient.pushTokens, title, body, { mmId: mm.id, type: 'MATCHMAKING_UPDATE' });
            } else {
              console.warn(`[NOTIFY_DEBUG] No push tokens found for recipient ${recipientId}`);
            }
          } else {
            console.warn(`[NOTIFY_DEBUG] Recipient ${recipientId} not found in player master list`);
          }
        }
      }
    }
  }

    } catch (notifErr) {
        console.error("❌ Notification Hook Error:", notifErr);
    }
}
