import mongoose from 'mongoose';
import { Player } from '../models/index.mjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  await Player.updateOne(
    { id: "shashank" },
    { 
      $set: { 
        "data.gender": "Male",
        lastUpdated: new Date()
      } 
    }
  );
  
  console.log("Updated Shashank gender to Male and bumped lastUpdated");
  mongoose.connection.close();
}
fix();
