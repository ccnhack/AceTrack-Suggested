import { sendPromotionEmail } from './emailService.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log('Sending promotion email...');
  const res = await sendPromotionEmail('hackerisback1717@gmail.com', 'Shush', 'Specialist');
  console.log('Result:', res);
  process.exit(0);
}
test();
