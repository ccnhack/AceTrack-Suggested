import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function fixAdmin() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const targetId = 'admin';
  const newEmail = 'admin@acetrack.com';
  const newPassword = 'Password@123';
  
  console.log(`Searching for all appstates documents to fix admin account...`);
  
  const docs = await collection.find({}).toArray();
  let totalFixed = 0;
  
  for (const doc of docs) {
    if (!doc.data || !doc.data.players) continue;
    
    let changed = false;
    const updatedPlayers = doc.data.players.map(p => {
      if (p.id === targetId) {
        console.log(`Fixing admin in doc ${doc._id}:`);
        console.log(`  - Old Email: ${p.email}`);
        console.log(`  - New Email: ${newEmail}`);
        p.email = newEmail;
        p.password = newPassword;
        changed = true;
      }
      return p;
    });
    
    if (changed) {
      await collection.updateOne(
        { _id: doc._id },
        { $set: { "data.players": updatedPlayers, lastUpdated: new Date() } }
      );
      totalFixed++;
      console.log(`✅ Document ${doc._id} updated successfully.`);
    }
  }
  
  console.log(`\nOperation finished. Total documents updated: ${totalFixed}`);
  await mongoose.disconnect();
}

fixAdmin();
