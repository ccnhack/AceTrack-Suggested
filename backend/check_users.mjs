import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

const AppStateSchema = new mongoose.Schema({
    data: Object,
    lastUpdated: { type: Date, default: Date.now }
}, { collection: 'AppState' });

const AppState = mongoose.model('AppState', AppStateSchema);

async function checkUsers() {
    try {
        await mongoose.connect(MONGODB_URI);
        const state = await AppState.findOne().sort({ lastUpdated: -1 });
        if (!state || !state.data || !state.data.players) {
            console.log("No players found in state");
            return;
        }

        const targets = ['riyan', 'aurna', 'shush', 'admin'];
        const found = state.data.players.filter(p => targets.includes(p.id));

        console.log(JSON.stringify(found, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkUsers();
