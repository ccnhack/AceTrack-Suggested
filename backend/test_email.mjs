import { sendPasswordResetEmail } from './emailService.mjs';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  console.log('Sending test email...');
  const res = await sendPasswordResetEmail('hackerisback1717@gmail.com', 'https://example.com/reset', new Date().toISOString(), 'Shush');
  console.log('Result:', res);
  process.exit(0);
}
test();
