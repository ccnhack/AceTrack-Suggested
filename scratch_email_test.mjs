import { sendTerminationEmail } from './backend/emailService.mjs';
import mongoose from 'mongoose';

async function test() {
  try {
    const res = await sendTerminationEmail(null, 'A K');
    console.log("Success:", res);
  } catch(e) {
    console.log("Error:", e.message);
  }
}
test();
