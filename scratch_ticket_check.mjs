import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { SupportTicket } from './backend/models/index.mjs';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  const tickets = await SupportTicket.find({}).lean();
  
  tickets.forEach(t => {
     if (t.data.status !== 'Closed' && t.data.status !== 'Resolved') {
        const created = new Date(t.data.createdAt);
        const isOverdue = (Date.now() - created.getTime()) > (48 * 60 * 60 * 1000);
        if (isOverdue) {
           console.log("Overdue ticket:", t.id, t.data.status, t.data.createdAt);
        }
     }
  });

  process.exit(0);
}).catch(console.error);
