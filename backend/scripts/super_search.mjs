import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function superSearch() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collections = await db.listCollections().toArray();
  
  for (const coll of collections) {
    const collection = db.collection(coll.name);
    const docs = await collection.find({}).toArray();
    docs.forEach((doc, i) => {
      const json = JSON.stringify(doc);
      if (json.includes('sup_')) {
        console.log(`[MATCH] Coll: ${coll.name}, ID: ${doc._id}`);
        // If it's appstates, find the player
        if (coll.name === 'appstates') {
          const players = doc.data?.players || [];
          players.forEach(p => {
            if (String(p.id).includes('sup_')) console.log(`  - Player ID: ${p.id}, Role: ${p.role}`);
          });
        }
      }
    });
  }
  
  await mongoose.disconnect();
}

superSearch();
