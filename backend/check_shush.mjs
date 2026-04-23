import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkShubhank() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const shush = state.data.players.find(p => p.id === 'shush' || p.username === 'shush' || p.name.includes('Shubhank'));
        console.log("SHUBHANK DATA:");
        console.log(JSON.stringify(shush, null, 2));

        const riyan = state.data.players.find(p => p.id === 'riyan' || p.username === 'riyan');
        console.log("\nRIYAN DATA (@riyan):");
        console.log(JSON.stringify(riyan, null, 2));

        const aurna = state.data.players.find(p => p.id === 'aurna' || p.username === 'aurna');
        console.log("\nAURNA DATA (@aurna):");
        console.log(JSON.stringify(aurna, null, 2));

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkShubhank();
