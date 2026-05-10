import mongoose from 'mongoose';
import { OrgMessage } from './backend/models/CommsModels.mjs';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });

async function check() {
  await mongoose.connect(process.env.MONGODB_URI);
  const msgs = await OrgMessage.find().sort({ timestamp: -1 }).limit(5);
  console.log(JSON.stringify(msgs, null, 2));
  process.exit(0);
}
check();
