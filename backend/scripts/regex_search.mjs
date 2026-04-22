import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function regexSearch() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const docs = await collection.find({}).toArray();
  docs.forEach((doc, i) => {
    const json = JSON.stringify(doc);
    if (json.match(/support/i)) {
      console.log(`[MATCH] Doc ${i} (${doc._id})`);
    }
  });
  
  await mongoose.disconnect();
}

regexSearch();
