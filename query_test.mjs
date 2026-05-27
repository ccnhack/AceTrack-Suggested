import mongoose from 'mongoose';
import { AuditLog } from './backend/models/index.mjs';

async function run() {
  await mongoose.connect('mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/AceTrack-Suggested?appName=Cluster0');
  const logs = await AuditLog.find({ 
    $or: [
      { userId: { $regex: 'nishant', $options: 'i' } },
      { 'details.name': { $regex: 'nishant', $options: 'i' } },
      { 'details.email': { $regex: 'nishant', $options: 'i' } }
    ]
  }).lean();
  console.log('Logs found:', logs.length);
  if (logs.length > 0) {
    console.log(logs.slice(0, 2));
  }
  process.exit(0);
}
run();
