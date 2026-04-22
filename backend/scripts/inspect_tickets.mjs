import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function inspectTickets() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const state = await db.collection('appstates').findOne({ _id: new mongoose.Types.ObjectId('69cfab9a762f83c636e35b35') });
    
    if (state && state.data && state.data.supportTickets) {
      const tickets = state.data.supportTickets;
      console.log(`Total Tickets: ${tickets.length}`);
      
      // Look for patterns
      const samples = tickets.slice(-100);
      samples.forEach(t => {
          if (t.status !== 'closed' && t.status !== 'resolved') {
            console.log(`[${t.id}] Status: ${t.status} | Sub: ${t.subject} | Desc: ${t.description?.substring(0, 50)}`);
          }
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

inspectTickets();
