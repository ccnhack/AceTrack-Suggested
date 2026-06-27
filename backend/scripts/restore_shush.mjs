import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const PlayerDataSchema = new mongoose.Schema({
  email: String,
  role: String,
  username: String,
  name: String,
  supportStatus: String,
  suspendedAt: String,
  terminatedAt: String
}, { _id: false, strict: false });

const PlayerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: PlayerDataSchema, required: true },
}, { minimize: false, strict: false });

const Player = mongoose.model('Player', PlayerSchema);

async function restoreUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const search = 'shush';
  
  const userRecord = await Player.findOne({ 'data.username': new RegExp('^' + search + '$', 'i') });

  if (userRecord) {
    console.log(`👤 Restoring user: ${userRecord.data.username}`);
    
    // Use MongoDB update operator to cleanly unset fields
    await Player.updateOne(
      { id: userRecord.id }, 
      { 
        $unset: { 
          'data.terminatedAt': 1, 
          'data.suspendedAt': 1,
          'data.lastForceLogoutAt': 1
        },
        $set: {
          'data.supportStatus': 'offline'
        }
      }
    );

    console.log('✅ User restored successfully. They should now be able to log in.');
  } else {
    console.log('❌ User not found');
  }

  process.exit(0);
}

restoreUser();
