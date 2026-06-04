import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { Player } from '../models/index.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function forceResetPassword() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Hash the requested password
  const tempPassword = 'password';
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // Exact usernames for the affected regular users
  const targetUsernames = ['nishant', 'shashank'];

  const players = await Player.find({
    id: { $in: targetUsernames }
  }).select('+data.password');

  for (const player of players) {
    console.log(`Resetting profile for: ${player.data.name} (id: ${player.id})`);
    
    // Force the password
    player.data.password = hashedPassword;
    
    // Ensure they are normal users, not support
    player.data.role = 'user';
    
    player.markModified('data');
    await player.save();
    console.log(`Successfully reset password to 'password' and confirmed role as 'user' for ${player.id}.`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

forceResetPassword().catch(console.error);
