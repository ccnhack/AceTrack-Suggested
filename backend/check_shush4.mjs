import mongoose from 'mongoose';
const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";
async function checkShubhank() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const shush = await db.collection('players').findOne({ 
          $or: [
            { id: /shush/i }, 
            { "data.username": /shush/i },
            { "data.email": /shush/i },
            { "data.name": /shush/i }
          ] 
        });
        console.log("SHUSH:", shush ? { id: shush.id, username: shush.data.username, role: shush.data.role, status: shush.data.supportStatus, pw: !!shush.data.password, name: shush.data.name, email: shush.data.email } : 'Not found');
    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}
checkShubhank();
