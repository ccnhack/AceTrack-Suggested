import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function findSupEverywhere() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const players = doc.data?.players || [];
    const found = players.find(p => p.id === 'sup_mo79kuny' || p.role === 'support');
    if (found) {
      console.log(`[FOUND] in Doc ${i} (${doc._id}): ID=${found.id}, Role=${found.role}, Name=${found.name}`);
    }
  });
  
  await mongoose.disconnect();
}

findSupEverywhere();
