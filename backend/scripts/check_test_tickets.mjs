import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function checkTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    // Support tickets are usually in 'master_state' or a specific collection
    // Let's check 'master_state' first as it holds the app's global data
    const masterState = await db.collection('master_state').findOne({});
    
    if (masterState && masterState.supportTickets) {
      const tickets = masterState.supportTickets;
      console.log(`Total Tickets: ${tickets.length}`);
      
      const automatedTickets = tickets.filter(t => 
        (t.subject && t.subject.includes('Automated Test')) || 
        (t.description && t.description.includes('E2E'))
      );
      
      console.log(`Automated Test Tickets: ${automatedTickets.length}`);
      automatedTickets.slice(-5).forEach(t => {
        console.log(`- [${t.id}] ${t.subject} (Status: ${t.status}, Created: ${t.createdAt})`);
      });
    } else {
      console.log("No support tickets found in master_state.");
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

checkTickets();
