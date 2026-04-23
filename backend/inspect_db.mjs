import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/AceTrack-Suggested?appName=Cluster0";

async function inspectDb() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log("Collections:", collections.map(c => c.name));

        for (const col of collections) {
            if (col.name.toLowerCase().includes('state')) {
                const doc = await db.collection(col.name).findOne({}, { sort: { lastUpdated: -1 } });
                if (doc && doc.data && doc.data.players) {
                    console.log(`\n--- Found Data in ${col.name} ---`);
                    const targets = ['riyan', 'aurna', 'shush', 'admin'];
                    const found = doc.data.players.filter(p => targets.includes(p.id));
                    console.log(JSON.stringify(found, null, 2));
                    return;
                }
            }
        }
        console.log("No player data found in any 'state' collection.");
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

inspectDb();
