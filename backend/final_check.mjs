import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/AceTrack-Suggested?appName=Cluster0";

async function checkStatus() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('AppState').findOne({}, { sort: { lastUpdated: -1 } });
        
        const targets = ['riyan', 'aurna', 'shush'];
        const players = state.data.players.filter(p => targets.includes(p.id));
        
        players.forEach(p => {
            console.log(`--- ${p.name} (${p.id}) ---`);
            console.log(`Role: ${p.role}`);
            console.log(`SupportStatus: ${p.supportStatus}`);
            console.log(`SupportLevel: ${p.supportLevel}`);
            console.log(`------------------------`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkStatus();
