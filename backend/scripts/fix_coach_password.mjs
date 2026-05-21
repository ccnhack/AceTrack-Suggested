import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) { console.error('No MONGODB_URI'); process.exit(1); }

await mongoose.connect(MONGODB_URI);
console.log('✅ Connected to MongoDB');

const db = mongoose.connection.db;
const playersCol = db.collection('players');

// Find coach_1
const user = await playersCol.findOne({ id: 'coach_1' });
if (!user) {
  console.log('❌ coach_1 not found!');
} else {
  console.log(`🔍 Found user: ${user.id} (${user.data?.name || user.data?.username})`);
  
  const hashedPassword = await bcrypt.hash('password', 10);
  const result = await playersCol.updateOne(
    { id: 'coach_1' },
    { $set: { "data.password": hashedPassword, lastUpdated: new Date() } }
  );
  
  console.log(`✅ Updated coach_1 password. Modified count: ${result.modifiedCount}`);
}

await mongoose.disconnect();
console.log('Done.');
