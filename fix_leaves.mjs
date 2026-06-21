import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = await mongoose.model('Player', new mongoose.Schema({}, { strict: false, collection: 'players' })).find({ 'data.shortLeaves': { $exists: true } });
  
  for (const p of players) {
    let modified = false;
    const leaves = p.get('data.shortLeaves');
    if (!leaves) continue;
    
    for (const l of leaves) {
      if (l.actualReturnTime && l.actualReturnTime.includes(':')) {
        const [h, m] = l.actualReturnTime.split(':').map(Number);
        if (h < 18 && l.date === '2026-06-21') {
          const dateObj = new Date();
          dateObj.setUTCHours(h);
          dateObj.setUTCMinutes(m);
          dateObj.setTime(dateObj.getTime() + 5.5 * 3600 * 1000);
          l.actualReturnTime = `${String(dateObj.getUTCHours()).padStart(2, '0')}:${String(dateObj.getUTCMinutes()).padStart(2, '0')}`;
          modified = true;
          console.log(`Updated leave for ${p.get('data.name')} to ${l.actualReturnTime}`);
        }
      }
    }
    
    if (modified) {
      p.set('data.shortLeaves', leaves);
      await p.save();
    }
  }
  process.exit(0);
}
fix();
