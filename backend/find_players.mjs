import { MongoClient } from 'mongodb';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

async function listPlayers() {
    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(); // Uses default DB
        const collections = await db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        // Try to find the AppState document
        for (const colName of collections.map(c => c.name)) {
            if (colName.toLowerCase().includes('state')) {
                const doc = await db.collection(colName).findOne({}, { sort: { lastUpdated: -1 } });
                if (doc && doc.data && doc.data.players) {
                    console.log(`Found players in ${colName}`);
                    const targets = ['riyan', 'aurna', 'shush', 'admin'];
                    const found = doc.data.players.filter(p => targets.includes(p.id));
                    console.log(JSON.stringify(found, null, 2));
                    return;
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

listPlayers();
