import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), 'backend', '.env') });

async function clean() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("No MONGODB_URI found");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('acetrack');
    const appstates = db.collection('appstates');
    
    const docs = await appstates.find({ "state.seenAdminActionIds": { $exists: true } }).toArray();
    let updatedCount = 0;
    
    for (const doc of docs) {
      const ids = doc.state.seenAdminActionIds;
      if (Array.isArray(ids)) {
        // Filter out corrupted strings (length < 20 or non-alphanumeric/hyphen)
        const validIds = ids.filter(id => typeof id === 'string' && id.length > 10);
        if (validIds.length !== ids.length) {
          console.log(`Cleaning doc for user: ${doc.userId}. Removed ${ids.length - validIds.length} invalid entries.`);
          console.log(`Invalid entries were:`, ids.filter(id => !(typeof id === 'string' && id.length > 10)));
          await appstates.updateOne(
            { _id: doc._id },
            { $set: { "state.seenAdminActionIds": validIds } }
          );
          updatedCount++;
        }
      }
    }
    console.log(`Cleaned ${updatedCount} documents.`);
  } catch (e) {
    console.error(e);
  } finally {
    await client.close();
  }
}

clean();
