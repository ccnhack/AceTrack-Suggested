import mongoose from 'mongoose';
import { Player } from './backend/models/index.mjs';

mongoose.connect(process.env.MONGODB_URI || 'mongodb+srv://acetrack-production:L85sQx3S6m8Bv9y1@acetrackcluster.dxyj1.mongodb.net/acetrack?retryWrites=true&w=majority')
  .then(async () => {
    const coaches = await Player.find({ "data.role": "coach" });
    console.log(`Found ${coaches.length} coaches`);
    coaches.forEach(c => {
      console.log(`- ${c.data.id}: status=${c.data.coachStatus}, approved=${c.data.isApprovedCoach}`);
    });
    process.exit(0);
  });
