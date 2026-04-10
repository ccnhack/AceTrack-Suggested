import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

const AuditLogSchema = new mongoose.Schema({
  userId: String,
  action: String,
  changedCollections: [String],
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

async function dumpAuditLogs() {
  try {
    console.log('📡 Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected.');

    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(50).lean();
    console.log(`📊 Last 50 Audit Logs:`);
    logs.forEach(log => {
      console.log(`[${log.timestamp.toISOString()}] ${log.userId} - ${log.action} - ${JSON.stringify(log.details)}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

dumpAuditLogs();
