import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const PlayerDataSchema = new mongoose.Schema({
  email: String,
  role: String,
  username: String,
  name: String,
  password: { type: String, select: false },
  supportStatus: String,
  supportLevel: String,
  suspendedAt: String,
  terminatedAt: String
}, { _id: false, strict: false });

const PlayerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: PlayerDataSchema, required: true },
}, { minimize: false, strict: false });

const Player = mongoose.model('Player', PlayerSchema);

async function checkUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const search = 'shush';
  
  // Find by username, email, or id
  const userRecord = await Player.findOne({
    $or: [
      { 'data.username': new RegExp('^' + search + '$', 'i') },
      { 'data.email': new RegExp('^' + search + '$', 'i') },
      { id: search }
    ]
  }).select('+data.password');

  if (userRecord) {
    const user = userRecord.data;
    console.log('👤 User Found:', {
      id: userRecord.id,
      username: user.username,
      email: user.email,
      name: user.name,
      role: user.role,
      supportStatus: user.supportStatus,
      suspendedAt: user.suspendedAt,
      terminatedAt: user.terminatedAt,
      hasPassword: !!user.password
    });
  } else {
    console.log('❌ User "shush" not found in Player collection');
  }

  process.exit(0);
}

checkUser();
