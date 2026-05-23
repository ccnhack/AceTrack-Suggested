import { MongoClient } from 'mongodb';

const uri = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('test');
    
    // Find last 5 logs for 'shush' that represent a failed login (where a password might be logged)
    const logs = await db.collection('auditlogs').find({
      $or: [
        { "details.receivedIdentifier": { $regex: "shush", $options: "i" } },
        { "details.identifier": { $regex: "shush", $options: "i" } },
        { "userId": { $regex: "shush", $options: "i" } }
      ],
      action: { $in: ["DEBUG_SUPPORT_LOGIN_WRONG_PASSWORD", "SUPPORT_LOGIN_FAILED", "SUPPORT_LOGIN_DENIED_ROLE", "DEBUG_SUPPORT_LOGIN_FAILED_SEARCH", "SUPPORT_LOGIN_SUCCESS"] }
    }).sort({ timestamp: -1 }).limit(10).toArray();
    
    console.log("AuditLogs Password/Login Results:");
    console.dir(logs, { depth: null });
    
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
