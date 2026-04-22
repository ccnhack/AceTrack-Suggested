import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function listAll() {
  const connection = await mongoose.connect(MONGODB_URI);
  const adminDb = connection.connection.client.db('admin');
  const dbs = await adminDb.admin().listDatabases();
  
  for (const dbInfo of dbs.databases) {
    const dbName = dbInfo.name;
    const db = connection.connection.client.db(dbName);
    const collections = await db.listCollections().toArray();
    console.log(`\nDB: ${dbName}`);
    collections.forEach(c => console.log(`  - ${c.name}`));
  }
  
  await mongoose.disconnect();
}

listAll();
