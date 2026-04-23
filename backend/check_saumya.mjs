import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkSaumya() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const saumya = state.data.players.find(p => p.name.includes('Saumya'));
        console.log(JSON.stringify(saumya, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkSaumya();
