import mongoose from 'mongoose';
import config from './backend/config/app.mjs';

async function fix() {
  await mongoose.connect(config.MONGODB_URI);
  const players = await mongoose.model('Player', new mongoose.Schema({}, { strict: false, collection: 'players' })).find({ 'data.shortLeaves': { $exists: true } });
  
  for (const p of players) {
    let modified = false;
    const leaves = p.get('data.shortLeaves');
    if (!leaves) continue;
    
    for (const l of leaves) {
      if (l.actualReturnTime && l.actualReturnTime.includes(':')) {
        const [h, m] = l.actualReturnTime.split(':').map(Number);
        // If hour is suspiciously low (like 14 instead of 20, we know it's UTC)
        // Wait, it's better to just check if it was from today.
        console.log(`User ${p.get('id')}, leave ${l.date}, actualReturnTime: ${l.actualReturnTime}`);
      }
    }
  }
  process.exit(0);
}
fix();
