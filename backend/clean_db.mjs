import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const database = client.db('test'); // Replace with your actual DB name if different
    const appstates = database.collection('appstates');

    const cursor = appstates.find({ seenAdminActionIds: { $exists: true } });
    let updatedCount = 0;

    for await (const doc of cursor) {
      if (Array.isArray(doc.seenAdminActionIds)) {
        // Filter out corrupted IDs (e.g., single characters like 'A', 'S')
        // Assuming valid IDs are longer than, say, 10 characters (like UUIDs)
        const cleanedIds = doc.seenAdminActionIds.filter(id => typeof id === 'string' && id.length > 10);
        
        if (cleanedIds.length !== doc.seenAdminActionIds.length) {
          console.log(`Cleaning doc ${doc._id}. Old length: ${doc.seenAdminActionIds.length}, New length: ${cleanedIds.length}`);
          await appstates.updateOne(
            { _id: doc._id },
            { $set: { seenAdminActionIds: cleanedIds } }
          );
          updatedCount++;
        }
      }
    }
    console.log(`Successfully cleaned ${updatedCount} appstates documents.`);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
