import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function recoverSupportUsers() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  
  // 1. Get current state from Doc 0
  const appstates = db.collection('appstates');
  const appState = await appstates.findOne({ _id: new mongoose.Types.ObjectId('69b9190b1255554ffb1b660f') });
  const players = appState.data.players || [];
  
  // 2. Define the support users to ensure/restore
  const supportUsers = [
    { name: 'Shubhank Shekhar', email: 'hackerisback1717@gmail.com', firstName: 'Shubhank', lastName: 'Shekhar', role: 'support', status: 'active', level: 'Senior' },
    { name: 'Saumya Anand', email: 'saumya.anand27@gmail.com', firstName: 'Saumya', lastName: 'Anand', role: 'support', status: 'active', level: 'Junior' },
    { name: 'Riya Anand', email: 'riya0508anand@gmail.com', firstName: 'Riya', lastName: 'Anand', role: 'support', status: 'inactive', level: 'Ex-Employee' }
  ];

  const generateSupportUsername = (fName, lName, existingPlayers, currentUserId) => {
    const base = (fName.substring(0, 3) + lName.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '');
    let un = base;
    let counter = 1;
    while (existingPlayers.some(p => (p.username === un || p.id === un) && p.id !== currentUserId)) {
      un = `${base}${counter}`;
      counter++;
    }
    return un;
  };

  let changesMade = 0;

  for (const user of supportUsers) {
    const existingIndex = players.findIndex(p => p.email?.toLowerCase() === user.email.toLowerCase());
    
    if (existingIndex !== -1) {
      console.log(`User ${user.name} exists. Ensuring support role and correct username.`);
      const existing = players[existingIndex];
      existing.role = 'support';
      existing.supportStatus = user.status;
      existing.supportLevel = user.level;
      existing.username = generateSupportUsername(user.firstName, user.lastName, players, existing.id);
      changesMade++;
    } else {
      console.log(`User ${user.name} MISSING. Restoring...`);
      const newId = `sup_${Math.random().toString(36).substring(2, 10)}`;
      const newUsername = generateSupportUsername(user.firstName, user.lastName, players, newId);
      
      const newAgent = {
        id: newId,
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        password: 'password', // Default password for restoration, they should reset it
        role: 'support',
        supportStatus: user.status,
        supportLevel: user.level,
        username: newUsername,
        createdAt: new Date().toISOString(),
        isEmailVerified: true
      };
      
      players.push(newAgent);
      changesMade++;
    }
  }

  if (changesMade > 0) {
    await appstates.updateOne(
      { _id: appState._id },
      { $set: { "data.players": players, lastUpdated: new Date() } }
    );
    console.log(`✅ Successfully restored/updated ${changesMade} support accounts in Doc 0.`);
  } else {
    console.log('No changes needed.');
  }

  await mongoose.disconnect();
}

recoverSupportUsers();
