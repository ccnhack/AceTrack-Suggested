import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

export async function cleanupTestData() {
  if (!process.env.MONGODB_URI) return;
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' });
  
  // Clean up users
  const phones = ['9999999999', '8888888888', '7777777777', 'admin_phone'];
  const db = mongoose.connection.db;
  
  try {
    await db.collection('players').deleteMany({ "data.phone": { $in: phones } });
    await db.collection('appstates').updateMany({}, { 
      $pull: { 
        "data.players": { phone: { $in: phones } },
        "data.tournaments": { title: { $regex: /Detox|Maestro|Test Tournament/i } }
      } 
    });
    console.log('Cleanup successful');
  } catch(e) {
    console.error('Cleanup failed', e);
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  cleanupTestData();
}
