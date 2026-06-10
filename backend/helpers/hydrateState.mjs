/**
 * HYDRATE STATE HELPER (v2.6.316)
 * 
 * After the 16MB AppState defusal, heavy collections (players, tournaments, etc.)
 * are no longer stored inside the AppState document. Routes that need player/tournament
 * data must hydrate from the distinct MongoDB collections instead.
 * 
 * This helper provides centralized functions to read from the correct source.
 */
import { AppState, Player, Tournament, Match, MatchVideo, SupportTicket, Evaluation, Matchmaking, ChatbotThread } from '../models/index.mjs';

/**
 * Returns all players from the Player distinct collection.
 * Replaces `appState.data.players` everywhere.
 */
export async function getPlayers() {
  const docs = await Player.find().lean();
  return docs.map(d => d.data);
}

/**
 * Returns a single player by ID from the Player distinct collection.
 */
export async function getPlayerById(id) {
  const doc = await Player.findOne({ id: String(id) }).lean();
  return doc?.data || null;
}

/**
 * Returns all tournaments from the Tournament distinct collection.
 */
export async function getTournaments() {
  const docs = await Tournament.find().lean();
  return docs.map(d => d.data);
}

/**
 * Returns all matches from the Match distinct collection.
 */
export async function getMatches() {
  const docs = await Match.find().lean();
  return docs.map(d => d.data);
}

/**
 * Returns all support tickets from the SupportTicket distinct collection.
 */
export async function getSupportTickets() {
  const docs = await SupportTicket.find().lean();
  return docs.map(d => d.data);
}

/**
 * Hydrates a full state object directly from distinct collections.
 * 🛡️ [PHASE 2 DECOMPOSITION] (v2.6.620): AppState is now read-only backup.
 * This function no longer merges from AppState.data.
 */
export async function getFullHydratedState() {
  const [
    stateMetadata,
    playersDocs,
    tournamentsDocs,
    matchesDocs,
    videosDocs,
    ticketsDocs,
    evalsDocs,
    matchmakingDocs,
    chatbotDocs
  ] = await Promise.all([
    AppState.findOne().sort({ lastUpdated: -1 }).select('lastUpdated version _id').lean(),
    Player.find().lean(),
    Tournament.find().lean(),
    Match.find().lean(),
    MatchVideo.find().lean(),
    SupportTicket.find().lean(),
    Evaluation.find().lean(),
    Matchmaking.find().lean(),
    ChatbotThread.find().lean()
  ]);

  const chatbotMessages = {};
  chatbotDocs.forEach(doc => { chatbotMessages[doc.userId] = doc.data; });

  return {
    players: playersDocs.map(d => d.data),
    tournaments: tournamentsDocs.map(d => d.data),
    matches: matchesDocs.map(d => d.data),
    matchVideos: videosDocs.map(d => d.data),
    supportTickets: ticketsDocs.map(d => d.data),
    evaluations: evalsDocs.map(d => d.data),
    matchmaking: matchmakingDocs.map(d => d.data),
    chatbotMessages,
    _version: stateMetadata?.version || 1,
    _lastUpdated: stateMetadata?.lastUpdated || new Date(),
    _stateId: stateMetadata?._id || null
  };
}

/**
 * Updates a single player's data in the Player distinct collection.
 * Use this for targeted writes (push token registration, device tracking, etc.)
 * instead of mutating AppState.data.players.
 */
export async function updatePlayerById(id, updateFn) {
  const doc = await Player.findOne({ id: String(id) });
  if (!doc) return null;
  
  const updated = updateFn(doc.data);
  doc.data = updated;
  doc.lastUpdated = new Date();
  doc.markModified('data');
  await doc.save();
  return updated;
}
