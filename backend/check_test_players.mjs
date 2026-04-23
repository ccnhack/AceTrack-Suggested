import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function checkTestPlayers() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        
        const players = await db.collection('players').find({
            $or: [
                { name: /Riya/i },
                { name: /Aura/i },
                { id: 'riyan' },
                { id: 'aurna' }
            ]
        }).toArray();

        console.log(`Found ${players.length} matching players in test.players`);
        players.forEach(p => {
            console.log(JSON.stringify(p, null, 2));
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

checkTestPlayers();
