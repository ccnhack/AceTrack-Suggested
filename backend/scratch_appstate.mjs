import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { AppState, Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const latestState = await AppState.findOne().sort({ version: -1 });
  const ak = latestState.data.players.find(p => String(p.id) === "sup_mpjv2sny");
  console.log("AK in AppState:", ak ? ak.supportStatus : "Not found");
  
  const p = await Player.findOne({ id: "sup_mpjv2sny" });
  console.log("AK in Player:", p ? p.data.supportStatus : "Not found");
  
  process.exit(0);
}).catch(console.error);
