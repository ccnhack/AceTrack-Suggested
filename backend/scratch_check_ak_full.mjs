import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const ak = await Player.findOne({ "data.name": "A K" }).lean();
  console.log("A K supportLevel:", ak.data.supportLevel);
  console.log("A K supportStatus:", ak.data.supportStatus);
  process.exit(0);
}).catch(console.error);
