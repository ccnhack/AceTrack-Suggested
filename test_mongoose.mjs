import mongoose from 'mongoose';

const SupportTicketDataSchema = new mongoose.Schema({
  userId: String,
  assignedTo: String,
  status: String,
  rating: Number,
  ratingFeedback: String,
}, { _id: false, strict: false });

const SupportTicketSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  data: { type: SupportTicketDataSchema, required: true },
  lastUpdated: { type: Date, default: Date.now, index: true }
}, { minimize: false, strict: false });

const SupportTicket = mongoose.model('SupportTicket2', SupportTicketSchema);

async function test() {
  await mongoose.connect('mongodb://localhost:27017/test_local').catch(e => console.log('no mongo'));
  await SupportTicket.deleteMany({});
  const ticketDoc = new SupportTicket({
    id: 't1',
    data: { userId: 'u1', status: 'Closed' }
  });
  await ticketDoc.save();
  
  const fetched = await SupportTicket.findOne({ id: 't1' });
  const ticket = fetched.data;
  ticket.rating = 5;
  ticket.ratingFeedback = 'Good';
  
  fetched.data = ticket;
  fetched.markModified('data');
  await fetched.save();
  
  const jsonOutput = JSON.stringify(ticket);
  console.log("ticket JSON:", jsonOutput);
  
  const final = await SupportTicket.findOne({ id: 't1' }).lean();
  console.log("final data lean:", final.data);
  process.exit(0);
}
test();
