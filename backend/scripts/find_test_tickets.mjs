import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function findTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const states = await db.collection('appstates').find({}).toArray();
    
    states.forEach((state, i) => {
      console.log(`State ${i} (_id: ${state._id}):`);
      if (state.data && state.data.supportTickets) {
        const tickets = state.data.supportTickets;
        console.log(`- Total Tickets: ${tickets.length}`);
        const openTestTickets = tickets.filter(t => 
          (t.subject && t.subject.includes('Automated')) || 
          (t.description && t.description.includes('E2E')) ||
          (t.subject && t.subject.includes('TEST'))
        ).filter(t => t.status !== 'closed' && t.status !== 'resolved');
        
        console.log(`- Open Automated Test Tickets: ${openTestTickets.length}`);
        openTestTickets.forEach(t => {
            console.log(`  * [${t.id}] ${t.subject} (${t.status})`);
        });
      } else {
        console.log("- No supportTickets in data");
      }
    });
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

findTickets();
