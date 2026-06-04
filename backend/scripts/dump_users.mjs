import mongoose from 'mongoose';
import { Player } from '../models/index.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function dump() {
  await mongoose.connect(process.env.MONGODB_URI);
  const players = await Player.find({}).lean();
  players.forEach(p => {
    console.log(`ID: ${p.id}, Name: ${p.data?.name}, Username: ${p.data?.username}, Email: ${p.data?.email}, Role: ${p.data?.role}, Gender: ${p.data?.gender}`);
  });
  mongoose.connection.close();
}
dump();
