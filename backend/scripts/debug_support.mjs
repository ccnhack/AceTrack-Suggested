import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function debugSupportUsers() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const players = doc.data?.players || [];
    const supports = players.filter(p => p.role === 'support');
    console.log(`Doc [${i}] ID: ${doc._id}, Support Count: ${supports.length}`);
    supports.forEach(s => {
      console.log(`  - ID: ${s.id}, Name: ${s.name}, Role: ${s.role}`);
    });
  });
  
  await mongoose.disconnect();
}

debugSupportUsers();
