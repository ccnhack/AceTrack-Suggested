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
      if (l.actualReturnTime && l.actualReturnTime.includes(':') && l.date === '2026-06-21') {
        const [h, m] = l.actualReturnTime.split(':').map(Number);
        
        if (h < 18) {
          // It was saved in UTC, let's shift to IST (+5h 30m)
          const dateObj = new Date();
          dateObj.setUTCHours(h);
          dateObj.setUTCMinutes(m);
          dateObj.setTime(dateObj.getTime() + 5.5 * 3600 * 1000);
          l.actualReturnTime = `${String(dateObj.getUTCHours()).padStart(2, '0')}:${String(dateObj.getUTCMinutes()).padStart(2, '0')}`;
          modified = true;
          console.log(`Updated return time for ${p.get('data.name')} to ${l.actualReturnTime}`);
        }
        
        // Re-calculate late/early metrics using the updated actualReturnTime
        const [newH, newM] = l.actualReturnTime.split(':').map(Number);
        const [endH, endM] = l.endTime.split(':').map(Number);
        
        const returnMins = newH * 60 + newM;
        const endMins = endH * 60 + endM;
        
        if (returnMins > endMins) {
            l.isLateReturn = true;
            l.lateDurationMinutes = returnMins - endMins;
            l.isEarlyReturn = false;
            l.earlyDurationMinutes = null;
            modified = true;
            console.log(`Updated stats for ${p.get('data.name')} to LATE by ${l.lateDurationMinutes}m`);
        } else if (returnMins < endMins) {
            l.isEarlyReturn = true;
            l.earlyDurationMinutes = endMins - returnMins;
            l.isLateReturn = false;
            l.lateDurationMinutes = null;
            modified = true;
            console.log(`Updated stats for ${p.get('data.name')} to EARLY by ${l.earlyDurationMinutes}m`);
        }
      }
    }
    
    if (modified) {
      p.set('data.shortLeaves', leaves);
      p.markModified('data.shortLeaves');
      p.markModified('data');
      await p.save();
    }
  }
  process.exit(0);
}
fix();
