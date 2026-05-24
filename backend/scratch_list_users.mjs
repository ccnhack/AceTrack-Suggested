import mongoose from 'mongoose';
import { Player } from './models/index.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './.env' });

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);

    const players = await Player.find(
      { 
        id: { $ne: 'admin' }, 
        "data.role": { $ne: 'admin' }
      }
    ).lean();

    const output = players.map(p => {
      const data = p.data || {};
      return `- ID: ${p.id} | Name: ${data.name || 'N/A'} | Email: ${data.email || 'N/A'} | Role: ${data.role || 'user'}`;
    });

    console.log(output.join('\n'));
    process.exit(0);
  } catch (error) {
    console.error("Error listing players:", error);
    process.exit(1);
  }
}

run();
