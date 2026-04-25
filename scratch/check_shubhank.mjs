import mongoose from 'mongoose';
mongoose.connect('mongodb+srv://acetrack-master:AceTrack2024%21%21@cluster0.pzzk1.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
const AppState = mongoose.model('AppState', new mongoose.Schema({}, { strict: false }));
async function run() {
  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  const players = state._doc.data.players || [];
  const shubhank = players.find(p => p.email === 'hackerisback1717@gmail.com' || p.name === 'Shubhank Shekhar');
  console.log(shubhank ? `Found Shubhank: ID=${shubhank.id}, Role=${shubhank.role}, Username=${shubhank.username}` : 'Not found');
  const saumya = players.find(p => p.username === 'saumya');
  console.log(saumya ? `Found Saumya: ID=${saumya.id}, Role=${saumya.role}` : 'Not found');
  process.exit(0);
}
run();
