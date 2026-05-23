import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, 'backend/.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const auditSchema = new mongoose.Schema({
      userId: String,
      ipAddress: String,
      userAgent: String,
      action: String,
      details: mongoose.Schema.Types.Mixed,
      timestamp: { type: Date, default: Date.now }
  });
  const AuditLog = mongoose.model('AuditLog', auditSchema);
  
  const logs = await AuditLog.find({
     $or: [
        { "userId": { $regex: "sauan", $options: "i" } },
        { "details.identifier": { $regex: "sauan", $options: "i" } }
     ]
  }).sort({ timestamp: -1 }).limit(10).lean();
  
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}

check().catch(console.error);
