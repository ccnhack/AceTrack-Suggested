import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function checkShush() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const doc = await collection.findOne({}, { sort: { lastUpdated: -1 } });
  const players = doc.data?.players || [];
  
  // Find all players with email hackerisback1717 or username shush or role support
  const matches = players.filter(p => 
    p.email?.toLowerCase().includes('hackerisback') || 
    p.username === 'shush' || 
    p.role === 'support'
  );
  
  console.log(`Found ${matches.length} matching players:`);
  matches.forEach(p => {
    console.log(`  ID: ${p.id}`);
    console.log(`  Name: ${p.name}`);
    console.log(`  Email: ${p.email}`);
    console.log(`  Username: ${p.username}`);
    console.log(`  Role: ${p.role}`);
    console.log(`  Password: ${p.password}`);
    console.log(`  SupportStatus: ${p.supportStatus}`);
    console.log(`  ---`);
  });
  
  await mongoose.disconnect();
}

checkShush();
