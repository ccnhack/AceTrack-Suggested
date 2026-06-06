import mongoose from 'mongoose';
import { Player, SupportTicket } from './backend/models/index.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  try {
    console.log('Connecting to DB...');
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('Connected!');
    
    // Find "shush support employee" or any support role user
    const supportUsers = await Player.find({ 'data.role': 'support' });
    console.log(`Found ${supportUsers.length} support users.`);
    
    for (const user of supportUsers) {
      console.log(`\n--- User: ${user.data.name} (ID: ${user.id}) ---`);
      
      const tickets = await SupportTicket.find({ 'data.userId': user.id });
      console.log(`Tickets created by this user: ${tickets.length}`);
      tickets.forEach(t => console.log(`  - [ID: ${t.id}] Status: ${t.data.status} | Title: ${t.data.title}`));
    }
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}
run();
