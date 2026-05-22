import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Player } from './models/index.mjs';

dotenv.config({ path: './.env' });

async function findUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Try finding by username, email, or id
  const user = await Player.findOne({
    $or: [
      { id: 'shush' },
      { 'data.username': 'shush' },
      { 'data.email': 'shush' },
      { 'data.username': /shush/i },
      { 'data.name': /shush/i }
    ]
  }).lean();
  
  if (user) {
    console.log("Found user:");
    console.log("ID:", user.id);
    console.log("Username:", user.data.username);
    console.log("Email:", user.data.email);
    console.log("Name:", user.data.name);
  } else {
    console.log("Could not find any user matching 'shush'.");
    // List all users to see what's in there
    const all = await Player.find({}, 'id data.username data.name').limit(10).lean();
    console.log("Sample users:");
    console.log(all.map(u => ({ id: u.id, username: u.data?.username, name: u.data?.name })));
  }
  
  process.exit(0);
}
findUser();
