import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkInvites() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('supportinvites');
  
  const docs = await collection.find({}).toArray();
  console.log(`Found ${docs.length} support invites:`);
  docs.forEach(d => console.log(`- Email: ${d.email}, Status: ${d.status}`));
  
  await mongoose.disconnect();
}

checkInvites();
