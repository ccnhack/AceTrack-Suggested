import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  // First, set it to suspended
  let p = await Player.findOne({ id: "sup_mpjv2sny" });
  p.data.supportStatus = "suspended";
  p.markModified('data');
  await p.save();
  console.log("DB status set to suspended.");

  // Simulate syncAndSaveData logic
  let existing = p.data;
  let frontendPayload = { ...existing, supportStatus: "active" };
  
  const adminControlledStatuses = ['terminated', 'suspended', 'inactive', 'left'];
  const existingDbStatus = (existing.supportStatus || '').toLowerCase();
  const preservedSupportStatus = adminControlledStatuses.includes(existingDbStatus) ? existing.supportStatus : 'offline';
  
  const merged = { ...existing, ...frontendPayload, supportStatus: preservedSupportStatus, status: 'offline', isLive: false };
  
  p.data = merged;
  p.markModified('data');
  await p.save();
  
  // Read back
  p = await Player.findOne({ id: "sup_mpjv2sny" });
  console.log("DB status after sync logic:", p.data.supportStatus);

  process.exit(0);
}).catch(console.error);
