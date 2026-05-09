import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({path: './.env'});

const PlayerSchema = new mongoose.Schema({}, { strict: false });
const Player = mongoose.models.Player || mongoose.model('Player', PlayerSchema, 'players');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const searchReg = new RegExp('^shush$', 'i');
  const userDoc = await Player.findOne({
    $or: [
      { "data.email": searchReg },
      { id: searchReg },
      { "data.username": searchReg }
    ]
  }).lean();
  console.log("userDoc:", userDoc ? userDoc.id : "null");
  mongoose.disconnect();
}
test();
