import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkPlayerCounts() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const count = doc.data?.players?.length || 0;
    console.log(`Doc [${i}] ID: ${doc._id}, Player Count: ${count}`);
  });
  
  await mongoose.disconnect();
}

checkPlayerCounts();
