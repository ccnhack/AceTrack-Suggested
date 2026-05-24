import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, 'backend', '.env') });

import { SupportTicket } from './backend/models/index.mjs';

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    const ticket = await SupportTicket.findOne({ "data.id": "99313" });
    if (ticket) {
      console.log(JSON.stringify(ticket.data, null, 2));
    } else {
      console.log("Ticket 99313 not found");
    }
    process.exit(0);
  });
