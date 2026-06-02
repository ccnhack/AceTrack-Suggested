import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI);

const AuditLogSchema = new mongoose.Schema({}, { strict: false });
const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema, 'auditLogs');

async function test() {
  const actions = await AuditLog.distinct('action');
  console.log("Distinct Actions:", actions);
  process.exit(0);
}

test();
