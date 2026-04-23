import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

async function listDbs() {
    try {
        await mongoose.connect(MONGODB_URI);
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        console.log("Databases:", dbs.databases.map(d => d.name));

        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            if (['admin', 'local', 'config'].includes(dbName)) continue;
            
            console.log(`\nInspecting Database: ${dbName}`);
            const db = mongoose.connection.useDb(dbName).db;
            const collections = await db.listCollections().toArray();
            console.log(`Collections in ${dbName}:`, collections.map(c => c.name));

            for (const col of collections) {
                if (col.name.toLowerCase().includes('state')) {
                    const doc = await db.collection(col.name).findOne({}, { sort: { lastUpdated: -1 } });
                    if (doc && doc.data && doc.data.players) {
                        console.log(`FOUND PLAYERS in ${dbName}.${col.name}`);
                        const targets = ['riyan', 'aurna', 'shush', 'admin'];
                        const found = doc.data.players.filter(p => targets.includes(p.id));
                        console.log(JSON.stringify(found, null, 2));
                    }
                }
            }
        }

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

listDbs();
