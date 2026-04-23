import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/acetrack?appName=Cluster0";

async function checkAceTrack() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log("Collections in acetrack:", collections.map(c => c.name));

        for (const col of collections) {
            const colName = col.name;
            const doc = await db.collection(colName).findOne({}, { sort: { lastUpdated: -1 } });
            
            let players = [];
            if (doc && doc.data && doc.data.players) {
                players = doc.data.players;
            } else if (colName === 'players' || colName === 'appstates') {
                players = await db.collection(colName).find().toArray();
                if (colName === 'appstates' && players.length > 0) {
                    players = players[0].data?.players || [];
                }
            }

            const matches = (players || []).filter(p => 
                (p.name && p.name.includes('Riya')) || 
                (p.name && p.name.includes('Aura')) ||
                (p.id === 'riyan') || 
                (p.id === 'aurna')
            );

            if (matches.length > 0) {
                console.log(`\nMATCHES FOUND IN acetrack.${colName}:`);
                matches.forEach(p => {
                    console.log(JSON.stringify(p, null, 2));
                });
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkAceTrack();
