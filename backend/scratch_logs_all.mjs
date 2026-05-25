import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();
import { AuditLog } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const logs = await AuditLog.find({
    $or: [
      { action: { $regex: /suspend|terminat/i } },
      { details: { $regex: /sup_mpjv2sny|A K|arpitk/i } },
      { entityId: "sup_mpjv2sny" }
    ]
  }).sort({ timestamp: -1 }).limit(20).lean();
  console.log(JSON.stringify(logs, null, 2));
  process.exit(0);
}).catch(console.error);
