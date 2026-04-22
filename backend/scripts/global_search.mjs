import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function globalSearch() {
  const connection = await mongoose.connect(MONGODB_URI);
  const adminDb = connection.connection.client.db('admin');
  const dbs = await adminDb.admin().listDatabases();
  
  for (const dbInfo of dbs.databases) {
    const dbName = dbInfo.name;
    const db = connection.connection.client.db(dbName);
    const collections = await db.listCollections().toArray();
    
    for (const coll of collections) {
      const collection = db.collection(coll.name);
      const docs = await collection.find({}).toArray();
      docs.forEach((doc, i) => {
        const json = JSON.stringify(doc);
        if (json.includes('sup_mo79kuny')) {
          console.log(`[FOUND] In DB: ${dbName}, Coll: ${coll.name}, Doc Index: ${i}, ID: ${doc._id}`);
        }
      });
    }
  }
  
  await mongoose.disconnect();
}

globalSearch();
