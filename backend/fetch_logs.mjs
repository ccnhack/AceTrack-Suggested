import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('test'); // The default db name might be test or AceTrack
    // Let's check collections to find the audit log collection
    const collections = await db.listCollections().toArray();
    console.log("Collections:", collections.map(c => c.name).join(", "));
    
    // Assuming 'auditlogs' or similar
    const auditLogs = db.collection('auditlogs'); // or 'auditlog'
    // Actually the intent payload said "action": {"$regex": "SUPPORT.*LOGIN"}
    const logs = await db.collection('auditlogs').find({
      $or: [
        { "details.receivedIdentifier": { $regex: "shush", $options: "i" } },
        { "details.identifier": { $regex: "shush", $options: "i" } },
        { "userId": { $regex: "shush", $options: "i" } }
      ]
    }).sort({ timestamp: -1 }).limit(5).toArray();
    
    console.log("AuditLogs:");
    console.dir(logs, { depth: null });
    
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
