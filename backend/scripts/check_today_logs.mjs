import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkTodayLogs() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  const startOfToday = new Date();
  startOfToday.setHours(0,0,0,0);
  
  const logs = await collection.find({ 
    timestamp: { $gte: startOfToday } 
  }).sort({ timestamp: -1 }).toArray();
  
  console.log(`Found ${logs.length} logs for today.`);
  logs.forEach(l => {
    console.log(`- [${l.timestamp}] Action: ${l.action}, User: ${l.data?.admin || l.data?.userId}`);
  });
  
  await mongoose.disconnect();
}

checkTodayLogs();
