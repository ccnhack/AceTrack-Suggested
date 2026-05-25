import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { AppState } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const latestState = await AppState.findOne().sort({ version: -1 });
  console.log(Object.keys(latestState.data));
  process.exit(0);
}).catch(console.error);
