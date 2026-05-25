import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Player } from './backend/models/index.mjs';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const ak = await Player.findOne({ "data.name": "A K" }).lean();
  console.log(JSON.stringify(ak.data, null, 2));
  process.exit(0);
}).catch(console.error);
