import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkAuditID() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  const logs = await collection.find({}).toArray();
  logs.forEach(l => {
    const json = JSON.stringify(l);
    if (json.includes('sup_mo79kuny')) {
      console.log(`- [${l.timestamp}] Action: ${l.action}`);
    }
  });
  
  await mongoose.disconnect();
}

checkAuditID();
