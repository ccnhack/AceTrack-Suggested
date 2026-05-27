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
  const exact = await SupportTicket.findOne({ id: "2899313" });
  if (exact) {
      console.log("Found Exact:", JSON.stringify(exact.data.lastReadBy, null, 2));
      console.log("Status:", exact.data.status);
      console.log("Messages length:", exact.data.messages?.length);
  } else {
      console.log("Not found exact by id");
  }
  
  const exact2 = await SupportTicket.findOne({ id: 2899313 });
  if (exact2) {
      console.log("Found Exact Numeric:", JSON.stringify(exact2.data.lastReadBy, null, 2));
  } else {
      console.log("Not found exact numeric by id");
  }
  
  // Just dump all IDs
  const docs = await SupportTicket.find({}).select('id').limit(100);
  console.log("Existing IDs:");
  console.dir(docs.map(d => d.id));
  mongoose.disconnect();
}
check();
