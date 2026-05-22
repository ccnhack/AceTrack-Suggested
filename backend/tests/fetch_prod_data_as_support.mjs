import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const JWT_SECRET = process.env.JWT_SECRET;
// Sign a token as support
const token = jwt.sign(
  { id: 'sup_do8ux1cc', role: 'support', scopes: ['read:basic', 'write:tickets'] },
  JWT_SECRET,
  { expiresIn: '1h' }
);

async function run() {
  console.log("Fetching /api/data as support user...");
  const res = await fetch('https://acetrack-suggested.onrender.com/api/v1/data', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  if (!res.ok) {
    console.log("Failed:", res.status, await res.text());
    return;
  }
  
  const data = await res.json();
  console.log(`Players count: ${data.players?.length}`);
  console.log(`Tickets count: ${data.supportTickets?.length}`);
  if (data.supportTickets?.length > 0) {
    console.log("First ticket:", data.supportTickets[0].title);
  }
}
run();
