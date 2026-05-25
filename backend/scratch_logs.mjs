import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config(); // Reads from backend/.env because of cwd
import { AuditLog } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const logs = await AuditLog.find({ "details.targetUserId": "sup_mpjv2sny" }).sort({ timestamp: -1 }).limit(10).lean();
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}).catch(console.error);
