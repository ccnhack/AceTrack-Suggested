import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function inspect() {
  try {
    await mongoose.connect(uri);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));

    for (const coll of collections) {
      const count = await db.collection(coll.name).countDocuments();
      console.log(`Collection: ${coll.name}, Count: ${count}`);
      if (coll.name.includes('state')) {
        const sample = await db.collection(coll.name).findOne();
        console.log(`Sample from ${coll.name}:`, JSON.stringify(sample, null, 2));
      }
    }

  } catch (err) {
    console.error("Inspection failed:", err);
  } finally {
    await mongoose.disconnect();
  }
}

inspect();
