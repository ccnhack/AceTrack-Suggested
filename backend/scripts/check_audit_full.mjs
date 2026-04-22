import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkAuditFull() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('auditlogs');
  
  const log = await collection.findOne({ 
    $or: [
      { "data.userId": "sup_mo79kuny" },
      { "data.targetUserId": "sup_mo79kuny" },
      { "data.player.id": "sup_mo79kuny" }
    ]
  }, { sort: { timestamp: -1 } });
  
  if (log) {
    console.log('Found audit log for sup_mo79kuny:');
    console.log(JSON.stringify(log, null, 2));
  } else {
    console.log('No audit log found with that ID.');
  }
  
  await mongoose.disconnect();
}

checkAuditFull();
