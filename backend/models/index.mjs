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

export const SupportPasswordReset = mongoose.model('SupportPasswordReset', SupportPasswordResetSchema);
