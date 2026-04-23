import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkAura() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const aura = state.data.players.find(p => p.name.includes('Aura') || p.username === 'aurna');
        console.log(JSON.stringify(aura, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkAura();
