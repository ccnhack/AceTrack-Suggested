import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  let playerDoc = await Player.findOne({ id: "sup_mpjv2sny" }).select('+data.password');
  let user = playerDoc.data;
  user.supportStatus = 'terminated';
  user.lastForceLogoutAt = Date.now();
  user.activeSessions = [];
  
  playerDoc.data = user;
  playerDoc.lastUpdated = new Date();
  playerDoc.markModified('data');
  await playerDoc.save();
  
  console.log("A K is now terminated");
  process.exit(0);
}).catch(console.error);
