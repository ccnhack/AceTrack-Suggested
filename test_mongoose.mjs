import mongoose from 'mongoose';
import { Player } from './backend/models/index.mjs';
async function run() {
  await mongoose.connect('mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/acetrack_db?retryWrites=true&w=majority&appName=Cluster0');
  const players = await Player.find({ "data.name": { "$regex": "shubhank", "$options": "i" } }).limit(100).lean();
  console.log("Found players:", players.length);
  for (const p of players) {
     const pd = p.data || {};
     console.log(`[Database][Player Record] ID:${p.id} Name:${pd.name || pd.firstName || 'N/A'} Role:${p.role || pd.role || 'N/A'} Designation:${pd.designation || 'N/A'} Account:${pd.supportStatus || 'active'} Session:${pd.isLive ? 'online' : 'offline'}`);
  }
  process.exit(0);
}
run();
