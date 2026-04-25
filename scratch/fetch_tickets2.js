import mongoose from 'mongoose';
mongoose.connect('mongodb+srv://acetrack:7xY1HnN2Y1HnN2@acetrack-master.t687a.mongodb.net/acetrack?retryWrites=true&w=majority')
  .then(async () => {
    const AppState = mongoose.model('AppState', new mongoose.Schema({}, { strict: false }));
    const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
    const players = state.data.players || [];
    
    const shubhank = players.find(p => p.email === 'hackerisback1717@gmail.com' || (p.name && p.name.includes('Shubhank')));
    console.log('Shubhank:', shubhank?.id, shubhank?.username, shubhank?.role);
    
    const saumya = players.find(p => p.username === 'saumya' || (p.name && p.name.includes('Saumya')));
    console.log('Saumya:', saumya?.id, saumya?.username, saumya?.role);
    
    process.exit(0);
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
