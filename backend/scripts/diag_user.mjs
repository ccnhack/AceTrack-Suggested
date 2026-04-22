import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const AppStateSchema = new mongoose.Schema({
  data: Object,
  lastUpdated: Number
}, { collection: 'appstates' });

const AppState = mongoose.model('AppState', AppStateSchema);

async function checkUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  if (!state) {
    console.log('❌ No AppState found');
    process.exit(1);
  }

  const search = 'shush';
  const user = state.data.players.find(p => 
    String(p.id).toLowerCase() === search || 
    (p.username && p.username.toLowerCase() === search) ||
    (p.email && p.email.toLowerCase() === search)
  );

  if (user) {
    console.log('👤 User Found:', {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      supportStatus: user.supportStatus,
      hasPassword: !!user.password
    });
  } else {
    console.log('❌ User "shush" not found in AppState');
  }

  process.exit(0);
}

checkUser();
