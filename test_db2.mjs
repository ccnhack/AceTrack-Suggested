import mongoose from 'mongoose';
import { OrgMessage } from './backend/models/CommsModels.mjs';

async function run() {
  await mongoose.connect('mongodb+srv://acetrack:AcetracK123@cluster0.abc.mongodb.net/acetrack?retryWrites=true&w=majority').catch(() => console.log('Mocking db connection'));
  
  const msgData = {
      senderId: 'user1',
      senderName: 'Test',
      content: 'How is everything',
      replyTo: '60b9b0b9b0b9b0b9b0b9b0b9' // dummy ObjectId
  };
  
  const msg = new OrgMessage(msgData);
  let populatedMsg = msg.toObject();
  
  console.log("Before populate:", JSON.stringify(populatedMsg));
  
  // mock populate
  populatedMsg.replyTo = { content: 'saumya here', senderName: 'Admin' };
  
  console.log("After populate:", JSON.stringify(populatedMsg));
  process.exit(0);
}
run();
