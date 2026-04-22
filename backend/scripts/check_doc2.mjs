import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkDoc2() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69c97d2c3af8d8ce62333d55') });
  const players = doc.data?.players || [];
  console.log(`Doc 2 Total Players: ${players.length}`);
  players.forEach((p, i) => {
    console.log(`[${i}] ID: ${p.id}, Name: ${p.name}, Role: ${p.role}`);
  });
  
  await mongoose.disconnect();
}

checkDoc2();
