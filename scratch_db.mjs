import mongoose from 'mongoose';
import { Player } from './backend/models/index.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const shashank = await Player.findOne({ id: 'shashank' }).select('+data.password').lean();
  console.log('shashank:', shashank ? { id: shashank.id, hasPassword: !!shashank.data.password, role: shashank.data.role, created: shashank.data.createdAt } : 'Not found');
  
  const academy = await Player.findOne({ id: 'academy' }).select('+data.password').lean();
  console.log('academy:', academy ? { id: academy.id, hasPassword: !!academy.data.password, role: academy.data.role, created: academy.data.createdAt } : 'Not found');
  
  process.exit(0);
}
run();
