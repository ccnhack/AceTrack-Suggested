import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function findSupportAnywhere() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const players = doc.data?.players || [];
    players.forEach(p => {
      if (p.role === 'support' || String(p.id).startsWith('sup_')) {
        console.log(`[FOUND] in Doc ${i} (${doc._id}): ID=${p.id}, Role=${p.role}, Name=${p.name}`);
      }
    });
  });
  
  await mongoose.disconnect();
}

findSupportAnywhere();
