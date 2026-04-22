import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

async function updateSupportUsernames() {
  const connection = await mongoose.connect(MONGODB_URI);
  const db = connection.connection.client.db('test');
  const collection = db.collection('appstates');
  
  const appState = await collection.findOne({}, { sort: { lastUpdated: -1 } });
  if (!appState || !appState.data || !appState.data.players) {
    console.error('No appstate data found.');
    await mongoose.disconnect();
    return;
  }

  const players = appState.data.players;
  const supportUsers = players.filter(p => p.role === 'support');
  console.log(`Found ${supportUsers.length} support users.`);

  const generateSupportUsername = (fName, lName, existingPlayers, currentUserId) => {
    const base = (fName.substring(0, 3) + lName.substring(0, 2)).toLowerCase().replace(/[^a-z0-9]/g, '');
    let un = base;
    let counter = 1;
    // Check uniqueness against ALL players except the current one being updated
    while (existingPlayers.some(p => (p.username === un || p.id === un) && p.id !== currentUserId)) {
      un = `${base}${counter}`;
      counter++;
    }
    return un;
  };

  let updatedCount = 0;
  players.forEach(p => {
    if (p.role === 'support') {
      let fName = p.firstName;
      let lName = p.lastName;
      
      if (!fName || !lName) {
        const parts = (p.name || '').split(' ');
        fName = fName || parts[0] || 'support';
        lName = lName || parts[1] || 'user';
      }

      const newUsername = generateSupportUsername(fName, lName, players, p.id);
      if (p.username !== newUsername) {
        console.log(`Updating ${p.id} (${p.name}): ${p.username} -> ${newUsername}`);
        p.username = newUsername;
        updatedCount++;
      }
    }
  });

  if (updatedCount > 0) {
    await collection.updateOne(
      { _id: appState._id },
      { $set: { "data.players": players, lastUpdated: new Date() } }
    );
    console.log(`Successfully updated ${updatedCount} usernames in Mongo document ${appState._id}.`);
  } else {
    console.log('All support usernames are already up to date.');
  }

  await mongoose.disconnect();
}

updateSupportUsernames();
