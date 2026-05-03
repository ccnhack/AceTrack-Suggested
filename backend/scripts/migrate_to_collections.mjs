import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env from the backend directory
dotenv.config({ path: path.join(__dirname, '../.env') });

// Import models
import { 
  AppState, 
  Player, 
  Tournament, 
  Match, 
  MatchVideo, 
  SupportTicket, 
  Evaluation, 
  Matchmaking, 
  ChatbotThread 
} from '../models/index.mjs';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("❌ MONGODB_URI is not set in backend/.env");
  process.exit(1);
}

async function migrateData() {
  try {
    console.log(`📡 Connecting to MongoDB...`);
    await mongoose.connect(MONGODB_URI);
    console.log(`✅ Connected successfully.`);

    console.log(`\n🔍 Finding master AppState document...`);
    const appState = await AppState.findOne().sort({ lastUpdated: -1 }).lean();

    if (!appState || !appState.data) {
      console.error(`❌ No AppState data found.`);
      process.exit(1);
    }

    const { 
      players = [], 
      tournaments = [], 
      matches = [], 
      matchVideos = [], 
      supportTickets = [], 
      evaluations = [], 
      matchmaking = [], 
      chatbotMessages = {} 
    } = appState.data;

    console.log(`\n📦 Discovered in AppState blob:`);
    console.log(` - Players: ${players.length}`);
    console.log(` - Tournaments: ${tournaments.length}`);
    console.log(` - Matches: ${matches.length}`);
    console.log(` - MatchVideos: ${matchVideos.length}`);
    console.log(` - SupportTickets: ${supportTickets.length}`);
    console.log(` - Evaluations: ${evaluations.length}`);
    console.log(` - Matchmaking: ${matchmaking.length}`);
    console.log(` - ChatbotThreads: ${Object.keys(chatbotMessages).length}`);

    console.log(`\n🚀 Starting Migration (Upsert Mode)...`);

    // Helper function to upsert array of entities
    const upsertEntities = async (Model, entities, name) => {
      if (!entities || entities.length === 0) return;
      console.log(`   Migrating ${name}...`);
      
      const bulkOps = entities.map(entity => {
        // Fallback ID if missing
        const entityId = String(entity.id || entity._id || Math.random().toString(36).substring(7));
        return {
          updateOne: {
            filter: { id: entityId },
            update: { $set: { id: entityId, data: entity, lastUpdated: new Date() } },
            upsert: true
          }
        };
      });

      if (bulkOps.length > 0) {
        const result = await Model.bulkWrite(bulkOps);
        console.log(`   ✅ ${name}: Upserted ${bulkOps.length} items. Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
      }
    };

    await upsertEntities(Player, players, 'Players');
    await upsertEntities(Tournament, tournaments, 'Tournaments');
    await upsertEntities(Match, matches, 'Matches');
    await upsertEntities(MatchVideo, matchVideos, 'MatchVideos');
    await upsertEntities(SupportTicket, supportTickets, 'SupportTickets');
    await upsertEntities(Evaluation, evaluations, 'Evaluations');
    await upsertEntities(Matchmaking, matchmaking, 'Matchmaking');

    // Handle ChatbotMessages (which is an object with userId keys)
    if (chatbotMessages && typeof chatbotMessages === 'object') {
       console.log(`   Migrating ChatbotThreads...`);
       const userIds = Object.keys(chatbotMessages);
       const bulkOps = userIds.map(userId => {
         return {
           updateOne: {
             filter: { userId: String(userId) },
             update: { $set: { userId: String(userId), data: chatbotMessages[userId], lastUpdated: new Date() } },
             upsert: true
           }
         };
       });

       if (bulkOps.length > 0) {
         const result = await ChatbotThread.bulkWrite(bulkOps);
         console.log(`   ✅ ChatbotThreads: Upserted ${bulkOps.length} items. Modified: ${result.modifiedCount}, Upserted: ${result.upsertedCount}`);
       }
    }

    console.log(`\n🎉 Phase 1 Database Migration Completed Successfully!`);
    console.log(`Note: The original AppState has NOT been deleted. This was a non-destructive read-and-copy operation.`);
    
  } catch (error) {
    console.error(`❌ Migration failed:`, error);
  } finally {
    await mongoose.disconnect();
    console.log(`🔌 Disconnected from MongoDB.`);
  }
}

migrateData();
