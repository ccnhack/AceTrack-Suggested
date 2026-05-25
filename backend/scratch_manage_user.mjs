import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player, AppState } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const playerDoc = await Player.findOne({ id: "sup_mpjv2sny" });
  if (!playerDoc) { console.log("Not found"); process.exit(0); }
  
  const user = playerDoc.data;
  console.log("Current status:", user.supportStatus);
  
  user.supportStatus = 'suspended';
  playerDoc.data = user;
  playerDoc.markModified('data');
  await playerDoc.save();
  
  console.log("Updated status to suspended in DB.");
  
  process.exit(0);
}).catch(console.error);
