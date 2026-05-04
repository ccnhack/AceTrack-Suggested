import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Player } from './models/index.mjs';

dotenv.config();

async function checkUser() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const search = 'shashank';
  const user = await Player.findOne({
    $or: [
      { id: search },
      { "data.username": search },
      { "data.email": search }
    ]
  }).lean();

  if (user) {
    console.log('✅ User found:');
    console.log(JSON.stringify(user, null, 2));
  } else {
    console.log('❌ User NOT found in database.');
  }

  await mongoose.disconnect();
}

checkUser();
