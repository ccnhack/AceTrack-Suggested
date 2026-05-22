import mongoose from 'mongoose';
import * as models from '../models/index.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/acetrack');
  const supportUserDoc = await models.Player.findOne({ "data.role": "support" }).lean();
  if (supportUserDoc) {
    console.log("Found support user:", supportUserDoc.data.email || supportUserDoc.data.username);
  } else {
    console.log("No support user found.");
  }
  process.exit(0);
}
run();
