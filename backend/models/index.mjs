/**
 * MODELS: Mongoose Schema Definitions
 * Extracted from server.mjs (v2.6.315 Phase 1 Modularization)
 * 
 * These are the core database schemas used throughout the AceTrack backend.
 */
import mongoose from 'mongoose';

// ═══════════════════════════════════════════════════════════════
// 📊 AppState — Single-document global state store
// ═══════════════════════════════════════════════════════════════
const AppStateSchema = new mongoose.Schema({
  data: mongoose.Schema.Types.Mixed,
  version: { type: Number, default: 1 },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false });

export const AppState = mongoose.model('AppState', AppStateSchema);

// ═══════════════════════════════════════════════════════════════
// 📊 AuditLog — Security and data change audit trail (TTL: 30 days)
// ═══════════════════════════════════════════════════════════════
const AuditLogSchema = new mongoose.Schema({
  userId: { type: String, index: true },
  action: { type: String, index: true },
  changedCollections: [String],
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now, index: true },
  createdAt: { type: Date, default: Date.now, index: { expires: '30d' } }
});
AuditLogSchema.index({ timestamp: -1 });

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// ═══════════════════════════════════════════════════════════════
// 📊 SecuritySummary — Aggregated security event tracking
// ═══════════════════════════════════════════════════════════════
const SecuritySummarySchema = new mongoose.Schema({
  ipAddress: String,
  userId: String,
  actor: String,
  events: [{
    timestamp: { type: Date, default: Date.now },
    action: String,
    url: String,
    method: String,
    details: mongoose.Schema.Types.Mixed
  }],
  isSummarized: { type: Boolean, default: false },
  firstEventAt: { type: Date, default: Date.now },
  lastEventAt: { type: Date, default: Date.now },
  lastAlertedAt: { type: Date, default: null }
});
// 🛡️ [PRODUCTION HARDENING] (v2.6.319): Auto-expire after 30 days
SecuritySummarySchema.index({ lastEventAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

export const SecuritySummary = mongoose.model('SecuritySummary', SecuritySummarySchema);

// ═══════════════════════════════════════════════════════════════
// 🎫 SUPPORT INVITE SCHEMA (v2.6.122)
// Isolated collection to prevent invite tokens/IPs from leaking to mobile clients
// ═══════════════════════════════════════════════════════════════
const SupportInviteSchema = new mongoose.Schema({
  email: { type: String, required: true },
  firstName: { type: String, default: '' },
  lastName: { type: String, default: '' },
  supportLevel: { type: String },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Pending', 'Clicked', 'Used', 'Expired', 'Retired'], default: 'Pending' },
  clicks: [{
    action: { type: String, default: 'link_click' }, // link_click, form_view, step_1, step_2, step_3, form_submit, admin_retired
    ip: String,
    userAgent: String,
    city: String,
    region: String,
    country: String,
    isp: String,
    lat: Number,
    lon: Number,
    timezone: String,
    botType: String, // 'Google', 'WhatsApp', 'Telegram', etc.
    timestamp: { type: Date, default: Date.now }
  }],
  emailResends: [{
    timestamp: { type: Date, default: Date.now }
  }],
  expiresAt: { type: Date, required: true },
  retiredAt: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

export const SupportInvite = mongoose.model('SupportInvite', SupportInviteSchema);

// ═══════════════════════════════════════════════════════════════
// 🎫 COACH INVITE SCHEMA (v2.6.400)
// Secure cryptographic invites for off-platform coaches
// ═══════════════════════════════════════════════════════════════
const CoachInviteSchema = new mongoose.Schema({
  email: { type: String, required: true },
  name: { type: String, default: '' },
  phone: { type: String, default: '' },
  academyId: { type: String, required: true },
  tournamentId: { type: String, required: true },
  token: { type: String, required: true, unique: true },
  status: { type: String, enum: ['Pending', 'Clicked', 'Used', 'Expired'], default: 'Pending' },
  clicks: [{
    action: { type: String, default: 'link_click' }, // link_click, form_view, form_submit
    ip: String,
    userAgent: String,
    city: String,
    region: String,
    country: String,
    isp: String,
    lat: Number,
    lon: Number,
    timezone: String,
    timestamp: { type: Date, default: Date.now }
  }],
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});

export const CoachInvite = mongoose.model('CoachInvite', CoachInviteSchema);

// ═══════════════════════════════════════════════════════════════
// 🔒 PASSWORD RESET TOKEN SCHEMA (v2.6.131)
// ═══════════════════════════════════════════════════════════════
const SupportPasswordResetSchema = new mongoose.Schema({
  email: { type: String, required: true, index: true },
  token: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
});
// 🛡️ [PRODUCTION HARDENING] (v2.6.319): Auto-delete expired tokens
SupportPasswordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SupportPasswordReset = mongoose.model('SupportPasswordReset', SupportPasswordResetSchema);

// ═══════════════════════════════════════════════════════════════
// 🔐 ADMIN MFA TOKEN SCHEMA (v2.6.319)
// ═══════════════════════════════════════════════════════════════
const AdminMFASchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  createdAt: { type: Date, default: Date.now }
});
export const AdminMFA = mongoose.model('AdminMFA', AdminMFASchema);

// ═══════════════════════════════════════════════════════════════
// 🏗️ PHASE 1 (DATABASE): DISTINCT ENTITY COLLECTIONS
// Flexible schemas to prevent data loss during migration.
// ═══════════════════════════════════════════════════════════════

// PLAYER
const PlayerDataSchema = new mongoose.Schema({
  email: String,
  role: String,
  username: String,
  name: String,
  password: { type: String, select: false },
  devices: [mongoose.Schema.Types.Mixed],
  seenAdminActionIds: [String],
  visitedAdminSubTabs: [String],
  avatarUrl: String,
  supportStatus: String,
  supportLevel: String,
  suspendedAt: String,
  terminatedAt: String
}, { _id: false, strict: false });

const PlayerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: PlayerDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
PlayerSchema.index({ "data.email": 1 });
PlayerSchema.index({ "data.role": 1 });
export const Player = mongoose.model('Player', PlayerSchema);

// TOURNAMENT
const TournamentDataSchema = new mongoose.Schema({
  title: String,
  status: String,
  registeredPlayerIds: [String]
}, { _id: false, strict: false });

const TournamentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: TournamentDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
TournamentSchema.index({ "data.status": 1 }); // 🛡️ [SCALABILITY] Query optimization
export const Tournament = mongoose.model('Tournament', TournamentSchema);

// MATCH
const MatchDataSchema = new mongoose.Schema({
  player1Id: String,
  player2Id: String,
  challengerId: String,
  opponentId: String,
  tournamentId: String,
  status: String,
  winnerId: String
}, { _id: false, strict: false });

const MatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: MatchDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
MatchSchema.index({ "data.player1Id": 1 });
MatchSchema.index({ "data.player2Id": 1 });
MatchSchema.index({ "data.challengerId": 1 });
MatchSchema.index({ "data.opponentId": 1 });
MatchSchema.index({ "data.tournamentId": 1 });
export const Match = mongoose.model('Match', MatchSchema);

// MATCH VIDEO
const MatchVideoDataSchema = new mongoose.Schema({
  matchId: String,
  playerId: String,
  url: String,
  status: String
}, { _id: false, strict: false });

const MatchVideoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: MatchVideoDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
MatchVideoSchema.index({ "data.matchId": 1 }); // 🛡️ [SCALABILITY] Query optimization
MatchVideoSchema.index({ "data.playerId": 1 });
export const MatchVideo = mongoose.model('MatchVideo', MatchVideoSchema);

// SUPPORT TICKET
const SupportTicketDataSchema = new mongoose.Schema({
  userId: String,
  assignedTo: String,
  status: String,
  subject: String,
  category: String,
  messages: [mongoose.Schema.Types.Mixed]
}, { _id: false, strict: false });

const SupportTicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: SupportTicketDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
SupportTicketSchema.index({ "data.userId": 1 });
SupportTicketSchema.index({ "data.assignedTo": 1 });
SupportTicketSchema.index({ "data.status": 1 });
export const SupportTicket = mongoose.model('SupportTicket', SupportTicketSchema);

// EVALUATION
const EvaluationDataSchema = new mongoose.Schema({
  playerId: String,
  evaluatorId: String,
  score: Number,
  comments: String
}, { _id: false, strict: false });

const EvaluationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: EvaluationDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
EvaluationSchema.index({ "data.playerId": 1 });
export const Evaluation = mongoose.model('Evaluation', EvaluationSchema);

// MATCHMAKING
const MatchmakingDataSchema = new mongoose.Schema({
  status: String,
  queue: [mongoose.Schema.Types.Mixed]
}, { _id: false, strict: false });

const MatchmakingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: MatchmakingDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
MatchmakingSchema.index({ "data.creatorId": 1 }); // 🛡️ [SCALABILITY] Query optimization
MatchmakingSchema.index({ "data.opponentId": 1 });
MatchmakingSchema.index({ "data.status": 1 });
export const Matchmaking = mongoose.model('Matchmaking', MatchmakingSchema);

// COACH BOOKING
const CoachBookingDataSchema = new mongoose.Schema({
  coachId: String,
  playerId: String,
  date: String,
  timeSlot: String,
  status: String,
  notes: String
}, { _id: false, strict: false });

const CoachBookingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: CoachBookingDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
CoachBookingSchema.index({ "data.coachId": 1 });
CoachBookingSchema.index({ "data.playerId": 1 });
export const CoachBooking = mongoose.model('CoachBooking', CoachBookingSchema);

// CHATBOT THREAD
const ChatbotThreadDataSchema = new mongoose.Schema({
  messages: [mongoose.Schema.Types.Mixed]
}, { _id: false, strict: false });

const ChatbotThreadSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  data: { type: ChatbotThreadDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
export const ChatbotThread = mongoose.model('ChatbotThread', ChatbotThreadSchema);

// PLAYER SESSION (Resolves 16MB document bloat)
const PlayerSessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  durationMs: { type: Number, required: true },
  device: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now, expires: '90d' } // Auto-delete after 90 days
});
export const PlayerSession = mongoose.model('PlayerSession', PlayerSessionSchema);

// ═══════════════════════════════════════════════════════════════
// ⏱️ RATE LIMIT SCHEMA (v2.6.530)
// Replaces rate-limit-mongo which was incompatible with express-rate-limit v7
// ═══════════════════════════════════════════════════════════════
const RateLimitSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  hits: { type: Number, default: 0 },
  expireAt: { type: Date, required: true, index: { expires: 0 } }
});
export const RateLimit = mongoose.model('RateLimit', RateLimitSchema);

// ═══════════════════════════════════════════════════════════════
// 💬 PARTNER CHAT MESSAGE (v2.6.615)
// Lightweight P2P chat for doubles partners within a tournament
// ═══════════════════════════════════════════════════════════════
const PartnerChatMessageSchema = new mongoose.Schema({
  tournamentId: { type: String, required: true, index: true },
  senderId: { type: String, required: true },
  senderName: { type: String, required: true },
  receiverId: { type: String, required: true },
  content: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now, index: { expires: '90d' } }
});
PartnerChatMessageSchema.index({ tournamentId: 1, senderId: 1, receiverId: 1 });
export const PartnerChatMessage = mongoose.model('PartnerChatMessage', PartnerChatMessageSchema);
