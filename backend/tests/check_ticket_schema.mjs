import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function run() {
  try {
    await mongoose.connect(uri);
    const SupportTicket = mongoose.connection.collection('supporttickets');
    
    const ticket = await SupportTicket.findOne({});
    console.log(JSON.stringify(ticket, null, 2));
  } catch (e) {
    console.error(e);
  } finally {
    await mongoose.disconnect();
  }
}
run();
