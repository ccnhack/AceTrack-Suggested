import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Player = mongoose.model('Player', new mongoose.Schema({ id: String, data: Object }, { strict: false }));
  
  const normalizedReqId = 'riyaplay';
  const docs = await Player.find(
    { id: { $ne: normalizedReqId } }, 
    { "data.id": 1, "data.name": 1, "data.role": 1, "data.skillLevel": 1, "data.rating": 1, "data.trueSkillRating": 1 }
  ).lean();

  const mergeEntities = (legacy = [], distinctDocs = []) => {
    const map = new Map();
    legacy.forEach(item => { if (item && item.id) map.set(String(item.id), item); });
    distinctDocs.forEach(doc => { 
      if (doc && doc.data && (doc.data.id || doc.id)) {
        const docId = String(doc.data.id || doc.id);
        map.set(docId, { ...doc.data, id: docId });
      }
    });
    return Array.from(map.values());
  };

  const players = mergeEntities([], docs);
  const rankingPlayers = players.filter(p => p && p.id !== 'admin_sys' && p.id !== 'admin' && p.role !== 'admin' && p.role !== 'academy' && p.role !== 'coach' && p.role !== 'support');
  
  console.log('Ranking players:', rankingPlayers.length);
  if (rankingPlayers.length > 0) {
    console.log('Sample ranking player:', JSON.stringify(rankingPlayers[0], null, 2));
  }
  process.exit(0);
};

run();
