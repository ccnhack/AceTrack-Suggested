import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import { Player } from './models/index.mjs';

mongoose.connect(process.env.MONGODB_URI, { dbName: 'test' }).then(async () => {
  let playerDoc = await Player.findOne({ id: "sup_mpjv2sny" }).select('+data.password');
  let user = playerDoc.data;
  
  // From manage-user route
  let status = 'suspended';
  
  if (status) {
    user.supportStatus = status;
    if (status === 'suspended') {
      user.suspendedAt = new Date().toISOString();
    }
  }
  
  // Automated unassign trigger
  if (status === 'terminated' || status === 'suspended') {
    user.lastForceLogoutAt = Date.now();
    user.activeSessions = [];
  }
  
  // Saving
  playerDoc.data = user;
  playerDoc.lastUpdated = new Date();
  playerDoc.markModified('data');
  await playerDoc.save();
  
  console.log("Saved playerDoc");
  
  // verify
  let verifyDoc = await Player.findOne({ id: "sup_mpjv2sny" }).lean();
  console.log("Verified status:", verifyDoc.data.supportStatus);
  
  process.exit(0);
}).catch(console.error);
