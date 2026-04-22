import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkAceTrackDb() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('acetrack');
  const collections = await db.listCollections().toArray();
  console.log('Collections in acetrack:');
  collections.forEach(c => console.log(`- ${c.name}`));
  
  for (const coll of collections) {
    const collection = db.collection(coll.name);
    const docs = await collection.find({}).toArray();
    console.log(`Coll: ${coll.name}, Doc Count: ${docs.length}`);
    docs.forEach(doc => {
      const players = doc.data?.players || [];
      const supports = players.filter(p => p.role === 'support');
      if (supports.length > 0) {
        console.log(`[FOUND SUPPORT] in doc ${doc._id}`);
        supports.forEach(s => console.log(`  - ID: ${s.id}, Name: ${s.name}, Role: ${s.role}`));
      }
    });
  }
  
  await mongoose.disconnect();
}

checkAceTrackDb();
