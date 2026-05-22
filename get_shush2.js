const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config({ path: './backend/.env' });
mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 20000 }).then(async () => {
  const { Player } = await import('./backend/models/index.mjs');
  const user = await Player.findOne({ 
    $or: [
      { id: /shush/i }, 
      { "data.username": /shush/i },
      { "data.email": /shush/i }
    ] 
  }).lean();
  console.log('User shush data:', user ? user.data : 'Not found');
  process.exit(0);
}).catch(console.error);
