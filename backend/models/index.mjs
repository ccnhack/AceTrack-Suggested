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
const PlayerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  // ⚠️ [TECH DEBT] (v2.6.319): Schema.Types.Mixed provides ZERO schema validation. 
  // Any malformed data is silently accepted. Next phase: define strict subdocuments.
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
PlayerSchema.index({ "data.email": 1 });
PlayerSchema.index({ "data.role": 1 });
export const Player = mongoose.model('Player', PlayerSchema);

// TOURNAMENT
const TournamentSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
export const Tournament = mongoose.model('Tournament', TournamentSchema);

// MATCH
const MatchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
MatchSchema.index({ "data.player1Id": 1 });
MatchSchema.index({ "data.player2Id": 1 });
MatchSchema.index({ "data.challengerId": 1 });
MatchSchema.index({ "data.opponentId": 1 });
MatchSchema.index({ "data.tournamentId": 1 });
export const Match = mongoose.model('Match', MatchSchema);

// MATCH VIDEO
const MatchVideoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
export const MatchVideo = mongoose.model('MatchVideo', MatchVideoSchema);

// SUPPORT TICKET
const SupportTicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
SupportTicketSchema.index({ "data.userId": 1 });
SupportTicketSchema.index({ "data.assignedTo": 1 });
SupportTicketSchema.index({ "data.status": 1 });
export const SupportTicket = mongoose.model('SupportTicket', SupportTicketSchema);

// EVALUATION
const EvaluationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
EvaluationSchema.index({ "data.playerId": 1 });
export const Evaluation = mongoose.model('Evaluation', EvaluationSchema);

// MATCHMAKING
const MatchmakingSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
export const Matchmaking = mongoose.model('Matchmaking', MatchmakingSchema);

// CHATBOT THREAD
const ChatbotThreadSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true, index: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });
export const ChatbotThread = mongoose.model('ChatbotThread', ChatbotThreadSchema);
