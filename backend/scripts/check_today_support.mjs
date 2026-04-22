import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkTodaySupport() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  
  const logs = await collection.find({ 
    timestamp: { $gte: startOfToday } 
  }).toArray();
  
  logs.forEach(l => {
    const json = JSON.stringify(l);
    if (json.includes('"support"')) {
      console.log(`- [${l.timestamp}] Action: ${l.action}`);
    }
  });
  
  await mongoose.disconnect();
}

checkTodaySupport();
