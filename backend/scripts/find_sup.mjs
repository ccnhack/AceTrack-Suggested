import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function findSup() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const doc = await collection.findOne({ _id: new mongoose.Types.ObjectId('69b9190b1255554ffb1b660f') });
  const players = doc.data?.players || [];
  const sup = players.find(p => p.id === 'sup_mo79kuny');
  if (sup) {
    console.log(`Found sup_mo79kuny: Role=${sup.role}, Email=${sup.email}`);
  } else {
    console.log('sup_mo79kuny NOT FOUND in Doc 0');
  }
  
  await mongoose.disconnect();
}

findSup();
