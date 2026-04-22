import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function listCollections() {
  try {
    if (!process.env.MONGODB_URI) {
      console.error("MONGODB_URI is not defined");
      process.exit(1);
    }
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name));
    
    for (const col of collections) {
        const count = await db.collection(col.name).countDocuments();
        console.log(`- ${col.name}: ${count} docs`);
        if (col.name === 'master_state') {
            const state = await db.collection('master_state').findOne({});
            if (state) {
                console.log("Keys in master_state document:", Object.keys(state));
                if (state.data) {
                    console.log("Keys in master_state.data:", Object.keys(state.data));
                    if (state.data.supportTickets) {
                        console.log(`- supportTickets: ${state.data.supportTickets.length}`);
                    }
                }
            }
        }
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error("Error:", error);
  }
}

listCollections();
