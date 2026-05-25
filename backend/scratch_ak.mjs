import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config(); // Reads from backend/.env because of cwd
import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const ak = await Player.find({ "data.name": /A K/i }).lean();
  console.log(JSON.stringify(ak, null, 2));
  process.exit(0);
}).catch(console.error);
