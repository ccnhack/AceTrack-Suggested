import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

async function deepSearch() {
    try {
        await mongoose.connect(MONGODB_URI);
        const admin = mongoose.connection.db.admin();
        const dbs = await admin.listDatabases();
        
        for (const dbInfo of dbs.databases) {
            const dbName = dbInfo.name;
            if (['admin', 'local', 'config'].includes(dbName)) continue;
            
            const db = mongoose.connection.useDb(dbName).db;
            const collections = await db.listCollections().toArray();
            
            for (const col of collections) {
                const colName = col.name;
                const doc = await db.collection(colName).findOne({}, { sort: { lastUpdated: -1 } });
                
                let players = [];
                if (doc && doc.data && doc.data.players) {
                    players = doc.data.players;
                } else if (colName === 'players') {
                    players = await db.collection(colName).find().toArray();
                }

                const matches = players.filter(p => 
                    (p.name && p.name.includes('Riya')) || 
                    (p.name && p.name.includes('Aura')) ||
                    (p.id === 'riyan') || 
                    (p.id === 'aurna')
                );

                if (matches.length > 0) {
                    console.log(`\nMATCHES FOUND IN ${dbName}.${colName}:`);
                    matches.forEach(p => {
                        console.log(`- ID: ${p.id}, Name: ${p.name}, Role: ${p.role}, Status: ${p.supportStatus}, Level: ${p.supportLevel}`);
                    });
                }
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

deepSearch();
