import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkLogId() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  const log = await collection.findOne({ _id: new mongoose.Types.ObjectId('69e6837d4ede58bc6169dd4d') });
  if (log) {
    console.log(JSON.stringify(log, null, 2));
  } else {
    console.log('Log NOT FOUND');
  }
  
  await mongoose.disconnect();
}

checkLogId();
