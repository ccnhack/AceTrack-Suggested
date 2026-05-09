import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config({path: './.env'});

const PlayerSchema = new mongoose.Schema({}, { strict: false });
const Player = mongoose.models.Player || mongoose.model('Player', PlayerSchema, 'players');

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  const userDoc = await Player.findOne({ id: 'sup_do8ux1cc' }).lean();
  console.log("data.password length:", userDoc.data.password ? userDoc.data.password.length : "NO PASSWORD");
  mongoose.disconnect();
}
test();
