import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { AuditLog } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const logs = await AuditLog.find({}).sort({ timestamp: -1 }).lean();
  const akLogs = logs.filter(l => JSON.stringify(l).includes("mpjv2sny") || JSON.stringify(l).includes("arpitk"));
  console.log(akLogs.map(l => `${l.timestamp} - ${l.action} - ${JSON.stringify(l.details)}`));
  process.exit(0);
}).catch(console.error);
