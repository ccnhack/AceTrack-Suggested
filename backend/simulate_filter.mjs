import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?appName=Cluster0";

async function simulateFilter() {
    try {
        await mongoose.connect(MONGODB_URI);
        const db = mongoose.connection.db;
        const state = await db.collection('appstates').findOne({}, { sort: { lastUpdated: -1 } });
        
        const targets = ['sup_yk36y9uw', 'sup_mobrosv8', 'sup_do8ux1cc'];
        const players = state.data.players.filter(p => targets.includes(p.id));
        
        players.forEach(p => {
            const role = (p.role || '').toLowerCase();
            const status = (p.supportStatus || '').toLowerCase();
            const level = (p.supportLevel || '').toLowerCase();
            
            const isAgent = role === 'support' || role === 'admin';
            const isExplicitlyInactive = 
              ['terminated', 'inactive', 'suspended', 'left', 'ex-employee'].includes(status) || 
              ['ex-employee', 'terminated'].includes(level) ||
              !!p.terminatedAt;
            
            const isActiveSupport = role === 'support' && (status === 'active' || !status) && !isExplicitlyInactive;
            const isActiveAdmin = role === 'admin' && !isExplicitlyInactive;

            console.log(`--- ${p.name} (${p.id}) ---`);
            console.log(`Role: ${role}, Status: "${status}", Level: "${level}", TerminatedAt: ${!!p.terminatedAt}`);
            console.log(`isExplicitlyInactive: ${isExplicitlyInactive}`);
            console.log(`isActiveSupport: ${isActiveSupport}`);
            console.log(`isActiveAdmin: ${isActiveAdmin}`);
            console.log(`RESULT: ${isActiveSupport || isActiveAdmin}`);
            console.log(`------------------------`);
        });

    } catch (e) {
        console.error(e);
    } finally {
        await mongoose.disconnect();
    }
}

simulateFilter();
