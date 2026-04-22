import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkAuditLogs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    
    console.log("Searching for recent ticket-related audit logs...");
    const logs = await db.collection('auditlogs').find({ 
      $or: [
        { action: /TICKET/i },
        { details: /ticket/i }
      ]
    }).sort({ timestamp: -1 }).limit(50).toArray();
    
    logs.forEach(log => {
      console.log(`[${log.timestamp}] User: ${log.userId} | Action: ${log.action} | Details: ${JSON.stringify(log.details)}`);
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

checkAuditLogs();
