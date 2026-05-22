const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './backend/.env' });
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const { AuditLog } = await import('./backend/models/index.mjs');
  const logs = await AuditLog.find({ action: /ADMIN/i }).sort({ timestamp: -1 }).limit(10);
  console.log('Recent ADMIN logs:');
  logs.forEach(l => console.log(l.action + ' at ' + l.timestamp));
  process.exit(0);
});
