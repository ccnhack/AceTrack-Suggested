import mongoose from 'mongoose';
import config from './config.js';
import { OrgMessage } from './backend/models/CommsModels.mjs';

async function check() {
  await mongoose.connect(config.MONGO_URI || 'mongodb+srv://acetrack:AcetracK123@cluster0.abc.mongodb.net/acetrack?retryWrites=true&w=majority');
  const msgs = await OrgMessage.find().sort({ timestamp: -1 }).limit(5);
  console.log(JSON.stringify(msgs.map(m => ({ content: m.content, replyTo: m.replyTo })), null, 2));
  process.exit(0);
}
check();
