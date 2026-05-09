import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({path: './.env'});

const AuditSchema = new mongoose.Schema({}, { strict: false });
const Audit = mongoose.models.Audit || mongoose.model('Audit', AuditSchema, 'audit_logs');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const logs = await Audit.find({ action: { $regex: /LOGIN/ } }).sort({ timestamp: -1 }).limit(10).lean();
  logs.forEach(l => {
     console.log(l.timestamp, l.action, l.details);
  });
  mongoose.disconnect();
}
test();
