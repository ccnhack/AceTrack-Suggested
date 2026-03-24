/**
 * 🗄️ Database Migration Framework
 * SE Fix: Versioned schema migrations instead of ad-hoc changes
 */

import mongoose from 'mongoose';

const MigrationSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  appliedAt: { type: Date, default: Date.now },
  version: Number,
});

const Migration = mongoose.model('Migration', MigrationSchema);

/**
 * List of migrations in order
 * Each migration has a name and an up() function
 */
const migrations = [
  {
    name: '001_add_indexes',
    version: 1,
    up: async () => {
      // Add indexes to AppState
      const AppState = mongoose.model('AppState');
      await AppState.collection.createIndex({ lastUpdated: -1 });
      console.log('✅ Migration 001: Added lastUpdated index');
    }
  },
  {
    name: '002_add_audit_log_collection',
    version: 2,
    up: async () => {
      // AuditLog collection is created automatically by the schema
      console.log('✅ Migration 002: AuditLog collection ready');
    }
  },
  {
    name: '003_add_tournament_fields',
    version: 3,
    up: async () => {
      // Add new fields to existing tournament data
      // waitlistedPlayerIds, refundPolicy, sponsorName, staffIds, courts
      const AppState = mongoose.model('AppState');
      const state = await AppState.findOne().sort({ lastUpdated: -1 });
      if (state && state.data && state.data.tournaments) {
        const updated = state.data.tournaments.map(t => ({
          ...t,
          waitlistedPlayerIds: t.waitlistedPlayerIds || [],
          refundPolicy: t.refundPolicy || null,
          sponsorName: t.sponsorName || '',
          sponsorLogoUrl: t.sponsorLogoUrl || '',
          staffIds: t.staffIds || [],
          courts: t.courts || [],
          city: t.city || '',
        }));
        await AppState.findOneAndUpdate({}, { $set: { 'data.tournaments': updated } });
        console.log(`✅ Migration 003: Updated ${updated.length} tournaments with new fields`);
      }
    }
  },
  {
    name: '004_add_player_fields',
    version: 4,
    up: async () => {
      // Add referral, coach notes, etc. to players
      const AppState = mongoose.model('AppState');
      const state = await AppState.findOne().sort({ lastUpdated: -1 });
      if (state && state.data && state.data.players) {
        const updated = state.data.players.map(p => ({
          ...p,
          referralCode: p.referralCode || '',
          referredBy: p.referredBy || null,
          referralCount: p.referralCount || 0,
          referralHistory: p.referralHistory || [],
          coachNotes: p.coachNotes || [],
          walletHistory: p.walletHistory || [],
          city: p.city || '',
        }));
        await AppState.findOneAndUpdate({}, { $set: { 'data.players': updated } });
        console.log(`✅ Migration 004: Updated ${updated.length} players with new fields`);
      }
    }
  },
  {
    name: '005_add_match_multiset',
    version: 5,
    up: async () => {
      // Add multi-set support to matches
      const AppState = mongoose.model('AppState');
      const state = await AppState.findOne().sort({ lastUpdated: -1 });
      if (state && state.data && state.data.matches) {
        const updated = state.data.matches.map(m => ({
          ...m,
          sets: m.sets || [{ score1: m.score1 || 0, score2: m.score2 || 0 }],
          bestOf: m.bestOf || 3,
          sport: m.sport || 'badminton',
          court: m.court || null,
          coachNotes: m.coachNotes || [],
          bookmarks: m.bookmarks || [],
        }));
        await AppState.findOneAndUpdate({}, { $set: { 'data.matches': updated } });
        console.log(`✅ Migration 005: Updated ${updated.length} matches with multi-set support`);
      }
    }
  },
];

/**
 * Run pending migrations
 */
export const runMigrations = async () => {
  console.log('🗄️ Running database migrations...');
  
  for (const migration of migrations) {
    const existing = await Migration.findOne({ name: migration.name });
    if (existing) {
      continue; // Already applied
    }
    
    try {
      console.log(`⏳ Applying migration: ${migration.name}`);
      await migration.up();
      await Migration.create({ name: migration.name, version: migration.version });
      console.log(`✅ Applied: ${migration.name}`);
    } catch (error) {
      console.error(`❌ Migration failed: ${migration.name}`, error);
      throw error; // Stop on failure
    }
  }
  
  console.log('🗄️ All migrations complete');
};

export default { runMigrations };
