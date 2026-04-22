import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function purgeE2ETickets() {
  try {
    if (!uri) throw new Error("MONGODB_URI is not defined in environment.");
    console.log("Connecting to MongoDB for E2E Purge...");
    await mongoose.connect(uri);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collection = db.collection('appstates');

    const docs = await collection.find().toArray();
    console.log(`Scanning ${docs.length} documents for E2E noise...`);

    for (const doc of docs) {
      if (!doc.data || !doc.data.supportTickets) continue;

      const tickets = doc.data.supportTickets;
      const initialCount = tickets.length;

      // 🛡️ v2.6.172 Aggressive E2E Purge:
      // Remove anything identified as E2E test noise
      const filteredTickets = tickets.filter(t => {
        const isE2E = 
          t.userId === 'e2e_user' || 
          t.title === 'E2E Automated Test Ticket' || 
          String(t.id).startsWith('e2e_ticket_') ||
          String(t.id).startsWith('ticket_') && (!t.title || t.title === 'undefined');
        
        return !isE2E;
      });

      const removedCount = initialCount - filteredTickets.length;
      if (removedCount > 0) {
        console.log(`Document ${doc._id}: Found ${removedCount} E2E noise tickets. Purging...`);
        await collection.updateOne(
          { _id: doc._id },
          { 
            $set: { 
              "data.supportTickets": filteredTickets,
              "lastUpdated": new Date().toISOString(),
              "version": (doc.version || 0) + 1000 // Force sync win
            } 
          }
        );
        console.log(`Document ${doc._id}: Purge complete.`);
      } else {
        console.log(`Document ${doc._id}: No E2E noise found.`);
      }
    }

    console.log("E2E Noise Purge Finalized.");

  } catch (err) {
    console.error("Purge failed:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

purgeE2ETickets();
