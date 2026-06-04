import mongoose from 'mongoose';
import { AppState } from '../models/index.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const state = await AppState.findOne().sort({ lastUpdated: -1 });
  if (state && state.data && state.data.partnerRequests) {
    let modified = false;
    for (const req of state.data.partnerRequests) {
      if (req.id === "partner_req_1780587449146_5973") {
        req.targetGender = "Male"; // Restore strict gender
        modified = true;
      }
    }
    if (modified) {
      state.markModified('data.partnerRequests');
      state.lastUpdated = new Date();
      await state.save();
      console.log("Restored Nishant's partner request targetGender to Male");
    }
  }
  mongoose.connection.close();
}
fix();
