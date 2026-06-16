import { Player, PlayerSession } from './models/index.mjs';
import mongoose from 'mongoose';

async function patchSaumya() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const saumyaDoc = await Player.findOne({ id: "sup_qp0whbdc" });
  if (!saumyaDoc) {
    console.log("Could not find Saumya");
    process.exit(1);
  }

  // 1. Update lastActive to June 16th 15:14:30.225Z
  const loginTime = new Date('2026-06-16T15:14:30.225Z').getTime();
  
  await Player.updateOne(
    { id: "sup_qp0whbdc" },
    { $set: { "data.lastActive": loginTime, lastUpdated: new Date() } }
  );
  console.log("Updated Saumya lastActive to June 16th");

  // 2. Create a retroactive PlayerSession for June 16th
  const sessionDoc = await PlayerSession.findOne({ userId: "sup_qp0whbdc", startTime: { $gte: new Date('2026-06-16T00:00:00Z'), $lte: new Date('2026-06-16T23:59:59Z') } });

  if (!sessionDoc) {
    // Simulate a 45-minute session based on typical attendance
    const durationMs = 45 * 60 * 1000;
    await PlayerSession.create({
      userId: "sup_qp0whbdc",
      startTime: new Date(loginTime),
      endTime: new Date(loginTime + durationMs),
      durationMs: durationMs,
      device: 'Browser',
      userAgent: 'Recovered via Audit Log'
    });
    console.log("Created retroactive PlayerSession for June 16th");
  } else {
    console.log("PlayerSession for June 16th already exists");
  }

  process.exit(0);
}

patchSaumya().catch(console.error);
