import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function checkLogs() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected");
  const db = mongoose.connection.db;
  const logs = await db.collection('auditlogs').find({
    action: "DEBUG_NETWORK_SNIFFER",
    "details.url": { $regex: /slack/i }
  }).sort({ timestamp: -1 }).limit(5).toArray();

  console.log(JSON.stringify(logs, null, 2));

  const errors = await db.collection('auditlogs').find({
    "details.url": { $regex: /slack/i },
    action: { $regex: /error/i }
  }).sort({ timestamp: -1 }).limit(5).toArray();

  console.log("ERRORS:", JSON.stringify(errors, null, 2));

  process.exit(0);
}

checkLogs().catch(console.error);
