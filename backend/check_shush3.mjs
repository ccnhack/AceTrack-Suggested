import mongoose from 'mongoose';
const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";
async function checkShubhank() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const shush = await db.collection('players').findOne({ id: 'shush' });
        console.log("SHUSH:", shush ? { role: shush.data.role, status: shush.data.supportStatus, pw: !!shush.data.password, name: shush.data.name } : 'Not found');
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
checkShubhank();
