import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkAudit() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  // Find logs related to sup_mo79kuny or support role
  const logs = await collection.find({ 
    $or: [
      { "data.userId": "sup_mo79kuny" },
      { "data.targetUserId": "sup_mo79kuny" },
      { "data.role": "support" },
      { action: /DELETE/i }
    ]
  }).sort({ timestamp: -1 }).limit(100).toArray();
  
  console.log(`Found ${logs.length} relevant audit logs:`);
  logs.forEach(l => {
    console.log(`- [${l.timestamp}] Action: ${l.action}, Data: ${JSON.stringify(l.data)}`);
  });
  
  await mongoose.disconnect();
}

checkAudit();
