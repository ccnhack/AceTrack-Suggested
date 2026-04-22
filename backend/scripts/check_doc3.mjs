import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkDoc3() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69cfab9a762f83c636e35b35') });
  const players = doc.data?.players || [];
  const supports = players.filter(p => p.role === 'support');
  console.log(`Doc 3 Total Players: ${players.length}, Support Count: ${supports.length}`);
  supports.forEach(s => console.log(`  - ID: ${s.id}, Name: ${s.name}`));
  
  await mongoose.disconnect();
}

checkDoc3();
