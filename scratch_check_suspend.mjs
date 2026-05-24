import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { AppState, Player, AuditLog } from './backend/models/index.mjs';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const ak = await Player.findOne({ "data.name": "A K" });
  if (ak) {
     console.log("Found A K. ID:", ak.id, "Status:", ak.data.supportStatus);
  } else {
     console.log("Not found in Player.");
  }
  
  const logs = await AuditLog.find({ "details.targetUserId": { $exists: true } }).sort({ timestamp: -1 }).limit(10);
  console.log("Recent Admin Actions:");
  logs.forEach(l => console.log(l.action, l.details, l.timestamp));

  process.exit(0);
}).catch(console.error);
