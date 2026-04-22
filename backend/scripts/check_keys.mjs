import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkKeys() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69b9190b1255554ffb1b660f') });
  console.log('Keys in Doc 0 data:');
  console.log(Object.keys(doc.data || {}));
  
  if (doc.data.supportTickets) {
    console.log(`Found ${doc.data.supportTickets.length} support tickets.`);
  }
  
  await mongoose.disconnect();
}

checkKeys();
