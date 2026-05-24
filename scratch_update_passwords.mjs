import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { Player } from './backend/models/index.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");

    const hashedPassword = await bcrypt.hash('password', 10);
    console.log("Generated hash for 'password'.");

    const result = await Player.updateMany(
      { 
        id: { $ne: 'admin' }, 
        "data.role": { $ne: 'admin' }
      },
      { 
        $set: { "data.password": hashedPassword } 
      }
    );

    console.log(`Successfully updated passwords for ${result.modifiedCount} players.`);
    process.exit(0);
  } catch (error) {
    console.error("Error updating passwords:", error);
    process.exit(1);
  }
}

run();
