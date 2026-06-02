import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  const Player = mongoose.connection.db.collection('players');
  const shobhitaPlayers = await Player.find({ 
    $or: [
      { id: /shobhita/i },
      { "data.username": /shobhita/i },
      { "data.name": /shobhita/i },
      { "data.email": /shobhita/i }
    ]
  }).toArray();
  
  console.log(`Found ${shobhitaPlayers.length} players for 'shobhita'`);
  shobhitaPlayers.forEach(p => {
    console.log(`- ID: ${p.id}, Role: ${p.data?.role}, Name: ${p.data?.name}, Affiliated: ${p.data?.affiliatedAcademy}`);
  });

  const CoachInvite = mongoose.connection.db.collection('coachinvites');
  const shobhitaInvites = await CoachInvite.find({
    $or: [
        { email: /shobhita/i },
        { name: /shobhita/i }
    ]
  }).toArray();

  console.log(`\nFound ${shobhitaInvites.length} coach invites for 'shobhita'`);
  shobhitaInvites.forEach(i => {
    console.log(`- Status: ${i.status}, Token: ${i.token}, Clicks: ${i.clicks?.length}`);
  });

  process.exit(0);
}

test();
