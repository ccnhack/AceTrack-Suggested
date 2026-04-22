import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkParticipants() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('participants');
  
  const docs = await collection.find({}).toArray();
  console.log(`Found ${docs.length} participants.`);
  docs.forEach(d => {
    if (d.role === 'support' || d.id?.startsWith('sup_')) {
      console.log(`- ID: ${d.id}, Name: ${d.name}, Role: ${d.role}`);
    }
  });
  
  await mongoose.disconnect();
}

checkParticipants();
