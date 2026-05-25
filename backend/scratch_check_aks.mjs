import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const aks = await Player.find({ "data.name": /A K/i }).lean();
  console.log(`Found ${aks.length} users`);
  aks.forEach(ak => console.log(ak.id, ak.data.name, ak.data.email, ak.data.supportStatus));
  process.exit(0);
}).catch(console.error);
