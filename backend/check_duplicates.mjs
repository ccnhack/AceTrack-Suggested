import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkDuplicates() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const auras = state.data.players.filter(p => p.name.includes('Aura') || p.username === 'aurna');
        console.log(`Found ${auras.length} Aura Naiks:`);
        auras.forEach(p => {
            console.log(`- ID: ${p.id}, Username: ${p.username}, Status: ${p.supportStatus}, Level: ${p.supportLevel}`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkDuplicates();
