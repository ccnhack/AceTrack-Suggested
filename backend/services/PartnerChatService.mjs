/**
 * ═══════════════════════════════════════════════════════════════
 * 💬 PartnerChatService.mjs (v2.6.772)
 * Extracted from routes/tournaments.mjs — Monolith Decomposition Phase 1A
 * 
 * Handles doubles partner chat logic: fetching messages and sending messages.
 * ═══════════════════════════════════════════════════════════════
 */
import { Tournament, Player, PartnerChatMessage } from '../models/index.mjs';

function toLower(id) { return String(id).toLowerCase(); }

// ─────────────────────────────────────────────────────────────
// getPartnerChat
// ─────────────────────────────────────────────────────────────

export async function getPartnerChat(tid, userId) {
  const lowerUserId = toLower(userId);

  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found.' };

  const tData = tournamentDoc.data || {};
  const teams = tData.doublesTeams || [];

  const myTeam = teams.find(t =>
    toLower(t.player1Id) === lowerUserId || toLower(t.player2Id) === lowerUserId
  );

  if (!myTeam || !myTeam.player1Id || !myTeam.player2Id) {
    return { status: 403, success: false, message: 'You do not have a partner in this tournament.' };
  }

  const partnerId = toLower(myTeam.player1Id) === lowerUserId
    ? toLower(myTeam.player2Id)
    : toLower(myTeam.player1Id);

  const messages = await PartnerChatMessage.find({
    tournamentId: tid,
    $or: [
      { senderId: lowerUserId, receiverId: partnerId },
      { senderId: partnerId, receiverId: lowerUserId }
    ]
  }).sort({ timestamp: 1 }).limit(200).lean();

  return { status: 200, success: true, messages, partnerId };
}

// ─────────────────────────────────────────────────────────────
// sendPartnerMessage
// ─────────────────────────────────────────────────────────────

export async function sendPartnerMessage(tid, userId, content, io) {
  const lowerUserId = toLower(userId);

  if (!content?.trim()) {
    return { status: 400, success: false, message: 'Message content is required.' };
  }

  const tournamentDoc = await Tournament.findOne({ id: tid });
  if (!tournamentDoc) return { status: 404, success: false, message: 'Tournament not found.' };

  const tData = tournamentDoc.data || {};

  // Check tournament date hasn't elapsed (buffer: +1 day)
  if (tData.date) {
    const tournamentDate = new Date(tData.date);
    const bufferDate = new Date(tournamentDate);
    bufferDate.setDate(bufferDate.getDate() + 1);
    if (new Date() > bufferDate) {
      return { status: 403, success: false, message: 'Chat is no longer available for past tournaments.' };
    }
  }

  const teams = tData.doublesTeams || [];
  const myTeam = teams.find(t =>
    toLower(t.player1Id) === lowerUserId || toLower(t.player2Id) === lowerUserId
  );

  if (!myTeam || !myTeam.player1Id || !myTeam.player2Id) {
    return { status: 403, success: false, message: 'You do not have a partner in this tournament.' };
  }

  const partnerId = toLower(myTeam.player1Id) === lowerUserId
    ? toLower(myTeam.player2Id)
    : toLower(myTeam.player1Id);

  // Get sender name
  const senderDoc = await Player.findOne({ id: userId });
  const senderName = senderDoc?.data?.name || 'Unknown';

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

  return { status: 200, success: true, message: msg.toObject() };
}
