import mongoose from 'mongoose';
import { Player } from '../models/index.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const p = await Player.findOne({ id: "shashank" }).lean();
  console.log("Shashank:", JSON.stringify(p.data, null, 2));
  console.log("Last Updated:", p.lastUpdated);
  mongoose.connection.close();
}
check();
