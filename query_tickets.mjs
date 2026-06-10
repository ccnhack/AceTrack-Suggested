import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve('backend/.env') });

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set!");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
  });
  console.log("Connected to MongoDB.");
  
  const { SupportTicket } = await import('./backend/models/index.mjs');
  
  const tickets = await SupportTicket.find({ "data.feedback": { $exists: true, $ne: null } }).lean();
  
  console.log(`Found ${tickets.length} tickets with feedback:`);
  tickets.forEach(t => {
    console.log(`- Ticket ID: ${t.id}, Assignee: ${t.data.assignedTo}, Feedback: ${t.data.feedback.rating} stars, Comment: ${t.data.feedback.comment}`);
  });
  
  process.exit(0);
}
run().catch(console.error);
