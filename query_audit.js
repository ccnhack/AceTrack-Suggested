const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './backend/.env' });
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const { AuditLog, Player } = await import('./backend/models/index.mjs');
  const logs = await AuditLog.find({ $or: [{ userId: /shush/i }, { 'details.email': /shush/i }, { 'details.name': /shush/i }] });
  console.log('Logs:', logs);
  const player = await Player.findOne({ $or: [{ id: /shush/i }, { 'data.email': /shush/i }, { 'data.username': /shush/i }, { 'data.name': /shush/i }] });
  console.log('Player:', player);
  process.exit(0);
});
