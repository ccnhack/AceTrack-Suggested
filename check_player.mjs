import mongoose from 'mongoose';
import { Player } from './backend/models/index.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const p = await Player.findOne({ id: 'shubhank_shekhar' }).lean();
  console.log('Player id:', p.id);
  console.log('Player data keys:', Object.keys(p.data));
  console.log('Player data.id:', p.data.id);
  process.exit(0);
}
check();
