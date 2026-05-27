import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

mongoose.connect(process.env.MONGODB_URI);

const supportTicketSchema = new mongoose.Schema({
  id: String,
  data: mongoose.Schema.Types.Mixed
}, { collection: 'SupportTicket', strict: false });

const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);

async function check() {
  // Let's find ANY ticket that has 'admin' in lastReadBy or 'shubhank' in assignedTo
  const docs = await SupportTicket.find({});
  console.log(`Total tickets: ${docs.length}`);
  for (const doc of docs) {
    if (doc.data && doc.data.assignedTo === 'shubhank') {
      console.log(`Found assigned to shubhank: ID=${doc.data.id}`);
      console.log(`lastReadBy:`, JSON.stringify(doc.data.lastReadBy));
      console.log(`status:`, doc.data.status);
      console.log(`latest message timestamp:`, doc.data.messages?.[doc.data.messages.length - 1]?.timestamp);
      console.log(`latest message sender:`, doc.data.messages?.[doc.data.messages.length - 1]?.senderId);
      console.log(`latest message status:`, doc.data.messages?.[doc.data.messages.length - 1]?.status);
    }
  }
  mongoose.disconnect();
}
check();
