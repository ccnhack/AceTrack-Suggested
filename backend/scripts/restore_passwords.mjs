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

async function restorePasswords() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB.");

  // Hash a temporary password
  const tempPassword = 'password';
  const hashedPassword = await bcrypt.hash(tempPassword, 10);

  // Find Nishant and Shashank
  const players = await Player.find({
    $or: [
      { 'data.name': { $regex: /nishant/i } },
      { 'data.username': { $regex: /nishant/i } },
      { 'data.name': { $regex: /shashank/i } },
      { 'data.username': { $regex: /shashank/i } }
    ]
  }).select('+data.password');

  for (const player of players) {
    if (!player.data.password) {
      console.log(`Restoring password for: ${player.data.name} (id: ${player.id})`);
      player.data.password = hashedPassword;
      player.markModified('data');
      await player.save();
      console.log(`Password restored to 'Password@123' for ${player.data.name}.`);
    } else {
      console.log(`Password already exists for ${player.data.name}, skipping.`);
    }
  }

  await mongoose.disconnect();
  console.log("Done.");
}

restorePasswords().catch(console.error);
