import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// The URI from .env is named MONGODB_URI
const uri = process.env.MONGODB_URI;

async function run() {
  try {
    await mongoose.connect(uri);
    const Player = mongoose.connection.collection('players');
    
    // Find all support users
    const supportUsers = await Player.find({ "data.role": "support" }).toArray();
    console.log(`Found ${supportUsers.length} support users.`);
    
    supportUsers.forEach(u => {
      console.log(`Support User: ${u.data.email || u.data.username} | ID: ${u.data.id} | SupportLevel: ${u.data.supportLevel}`);
    });
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}
run();
