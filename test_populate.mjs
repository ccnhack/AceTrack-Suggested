import mongoose from 'mongoose';
import { OrgMessage } from './backend/models/CommsModels.mjs';

async function run() {
  await mongoose.connect('mongodb+srv://acetrack:AcetracK123@cluster0.abc.mongodb.net/acetrack?retryWrites=true&w=majority').catch(() => console.log('Mocking db connection'));
  
  const msg1 = new OrgMessage({ senderId: '1', senderName: 'A', content: 'hello' });
  const msg2 = new OrgMessage({ senderId: '2', senderName: 'B', content: 'world', replyTo: msg1._id });
  
  // mock populate
  msg2.replyTo = msg1;
  
  console.log(JSON.stringify(msg2));
  process.exit(0);
}
run();
