const { MongoClient } = require('mongodb');
const uri = 'mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0';
const client = new MongoClient(uri);

async function run() {
  try {
    await client.connect();
    const db = client.db('test');
    const tournaments = await db.collection('tournaments').find({}).toArray();
    console.log(`Found ${tournaments.length} tournaments.`);
    tournaments.forEach(t => {
      console.log(`- ${t.name} (Status: ${t.status}, Date: ${t.date})`);
    });
  } finally {
    await client.close();
  }
}
run().catch(console.dir);
