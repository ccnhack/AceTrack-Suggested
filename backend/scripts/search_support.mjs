import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function searchSupport() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const json = JSON.stringify(doc);
    if (json.includes('"role":"support"') || json.includes('"role": "support"')) {
      console.log(`[FOUND] role:"support" in Doc ${i} (ID: ${doc._id})`);
      const players = doc.data?.players || [];
      players.forEach(p => {
        if (p.role === 'support') console.log(`  - ${p.id} (${p.name})`);
      });
    }
  });
  
  await mongoose.disconnect();
}

searchSupport();
