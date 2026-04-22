import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function cleanup() {
  try {
    if (!uri) throw new Error("MONGODB_URI is not defined in environment.");
    console.log("Connecting to MongoDB...");
    await mongoose.connect(uri);
    console.log("Connected.");

    const db = mongoose.connection.db;
    const collection = db.collection('appstates');

    const docs = await collection.find().toArray();
    console.log(`Scanning ${docs.length} documents in appstates...`);

    for (const doc of docs) {
      if (!doc.data || !doc.data.supportTickets) continue;

      const tickets = doc.data.supportTickets;
      const initialCount = tickets.length;

      const filteredTickets = tickets.filter(t => {
        const isGhost = !t.title || t.title === 'undefined' || !t.description || t.description === 'undefined';
        return !isGhost;
      });

      const removedCount = initialCount - filteredTickets.length;
      if (removedCount > 0) {
        console.log(`Document ${doc._id}: Found ${removedCount} ghost tickets. Updating and bumping timestamp...`);
        await collection.updateOne(
          { _id: doc._id },
          { 
            $set: { 
              "data.supportTickets": filteredTickets,
              "lastUpdated": new Date().toISOString(),
              "version": (doc.version || 0) + 1
            } 
          }
        );
        console.log(`Document ${doc._id}: Cleanup complete.`);
      } else {
        console.log(`Document ${doc._id}: No ghost tickets found.`);
      }
    }

    console.log("Bulk cleanup sequence finalized.");

  } catch (err) {
    console.error("Cleanup failed:", err.message);
  } finally {
    await mongoose.disconnect();
  }
}

cleanup();
