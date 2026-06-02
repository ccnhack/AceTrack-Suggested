import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const Player = mongoose.model('Player', new mongoose.Schema({ id: String, data: Object }, { strict: false }));
  
  const normalizedReqId = 'riyaplay';
  const sinceFilter = {}; // Full hydration

  const docs = await Player.find(
    { id: { $ne: normalizedReqId }, ...sinceFilter }, 
    { "data.id": 1, "data.name": 1, "data.username": 1, "data.avatar": 1, "data.role": 1, "data.skillLevel": 1, "data.rating": 1, "data.trueSkillRating": 1, "data.supportStatus": 1, "data.supportLevel": 1, "data.terminatedAt": 1, "data.reOnboardedAt": 1 }
  ).lean();

  console.log('Docs returned:', docs.length);
  if (docs.length > 0) {
    console.log('Sample doc:', JSON.stringify(docs[0], null, 2));
  }
  process.exit(0);
};

run();
