import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function cleanupAndVerify() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collection = db.collection('appstates');

    const docId = new mongoose.Types.ObjectId("69b9190b1255554ffb1b660f");
    const doc = await collection.findOne({ _id: docId });
    
    if (!doc) {
      console.log("Doc not found.");
      return;
    }

    const tickets = doc.data.supportTickets || [];
    console.log(`Initial count in ${docId}: ${tickets.length}`);

    const filtered = tickets.filter(t => {
       return t.title && t.title !== 'undefined' && t.description && t.description !== 'undefined';
    });

    console.log(`Filtered count: ${filtered.length}`);

    if (filtered.length !== tickets.length) {
      await collection.updateOne(
        { _id: docId },
        { 
          $set: { 
            "data.supportTickets": filtered,
            "lastUpdated": new Date().toISOString(),
            "version": (doc.version || 0) + 500 // Jump version to win any race
          } 
        }
      );
      console.log("Update sent.");
      
      const docAfter = await collection.findOne({ _id: docId });
      console.log(`Verified count immediately after: ${docAfter.data.supportTickets.length}`);
    } else {
      console.log("No changes needed.");
    }

  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

cleanupAndVerify();
