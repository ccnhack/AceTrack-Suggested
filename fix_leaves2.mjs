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
        const [endH, endM] = l.endTime.split(':').map(Number);
        
        const returnMins = h * 60 + m;
        const endMins = endH * 60 + endM;
        
        if (returnMins > endMins) {
            l.isLateReturn = true;
            l.lateDurationMinutes = returnMins - endMins;
            l.isEarlyReturn = false;
            l.earlyDurationMinutes = null;
            modified = true;
            console.log(`Updated late stats for ${p.get('data.name')} to late by ${l.lateDurationMinutes}m`);
        } else if (returnMins < endMins) {
            l.isEarlyReturn = true;
            l.earlyDurationMinutes = endMins - returnMins;
            l.isLateReturn = false;
            l.lateDurationMinutes = null;
            modified = true;
            console.log(`Updated early stats for ${p.get('data.name')} to early by ${l.earlyDurationMinutes}m`);
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
