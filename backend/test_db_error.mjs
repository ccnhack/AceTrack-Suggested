import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const auditLogs = await mongoose.connection.db.collection('audit_logs')
    .find()
    .sort({ _id: -1 })
    .limit(10)
    .toArray();
    
  console.log("Recent Logs:");
  auditLogs.forEach(l => {
    if (l.action.includes('EMAIL') || l.action.includes('RESET')) {
      console.log(`Action: ${l.action} | Time: ${l.timestamp || l.createdAt}`);
      console.log(`Details: ${JSON.stringify(l.details)}`);
      console.log("---");
    }
  });
  
  await mongoose.disconnect();
}
check();
