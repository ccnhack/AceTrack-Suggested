import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { Player } from './models/index.mjs';

dotenv.config({ path: './.env' });

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shush = await Player.findOne({ id: 'sup_do8ux1cc' }).select('+data.password');
  
  if (!shush) {
    console.log("Shush not found");
    process.exit(1);
  }

  if (!shush.data.password) {
    console.log("No password found for shush, resetting to default testing password");
    const hashed = bcrypt.hashSync("passwrod12678\\", 10);
    await Player.updateOne({ id: 'sup_do8ux1cc' }, { $set: { "data.password": hashed } });
    console.log("Password restored for shush!");
  } else {
    console.log("Password is ALREADY set for shush, replacing with known good hash anyway just to be sure");
    const hashed = bcrypt.hashSync("passwrod12678\\", 10);
    await Player.updateOne({ id: 'sup_do8ux1cc' }, { $set: { "data.password": hashed } });
    console.log("Password reset for shush to passwrod12678\\");
  }
  
  process.exit(0);
}
fix();
