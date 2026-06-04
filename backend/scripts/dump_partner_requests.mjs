import mongoose from 'mongoose';
import { AppState, Player } from '../models/index.mjs';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

async function dump() {
  await mongoose.connect(MONGODB_URI);
  const state = await AppState.findOne().sort({ lastUpdated: -1 }).lean();
  console.log("Partner Requests:", JSON.stringify(state.data.partnerRequests, null, 2));

  const p1 = await Player.findOne({ "data.username": "shashank" }).lean();
  const p2 = await Player.findOne({ "data.username": "nishant" }).lean();
  console.log("Shashank Gender:", p1?.data?.gender, "Role:", p1?.data?.role);
  console.log("Nishant Gender:", p2?.data?.gender, "Role:", p2?.data?.role);

  mongoose.connection.close();
}
dump();
