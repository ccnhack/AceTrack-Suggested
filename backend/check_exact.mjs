import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkExact() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const targets = ['sup_yk36y9uw', 'sup_mobrosv8'];
        const players = state.data.players.filter(p => targets.includes(p.id));
        
        players.forEach(p => {
            console.log(`--- ${p.name} (${p.id}) ---`);
            console.log(`supportStatus: "${p.supportStatus}" (Type: ${typeof p.supportStatus})`);
            console.log(`supportLevel: "${p.supportLevel}" (Type: ${typeof p.supportLevel})`);
            console.log(`------------------------`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkExact();
