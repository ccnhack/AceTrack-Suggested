import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkUppercaseFull() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('AppState');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const json = JSON.stringify(doc);
    if (json.includes('sup_')) {
      console.log(`[MATCH] AppState (uppercase) Doc ${i} (${doc._id})`);
    }
  });
  
  await mongoose.disconnect();
}

checkUppercaseFull();
