import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

const uri = process.env.MONGODB_URI;

async function run() {
  await mongoose.connect(uri);
  const SupportTicket = mongoose.connection.collection('supporttickets');
  
  const reqUserRole = 'support';
  const resolvedScopes = ['read:basic', 'write:tickets'];
  const normalizedReqId = 'sup_do8ux1cc';
  
  const isAdmin = reqUserRole === 'admin' || normalizedReqId === 'admin' || resolvedScopes.includes('*');
  const isSupport = reqUserRole === 'support' || resolvedScopes.includes('read:support') || normalizedReqId.startsWith('admin_support_');
  const canReadSupport = isAdmin || isSupport || resolvedScopes.includes('read:basic');

  const ticketQuery = canReadSupport ? {} : { "data.userId": normalizedReqId };
  
  const ticketsDocs = await SupportTicket.find(ticketQuery).toArray();
  console.log(`canReadSupport: ${canReadSupport}`);
  console.log(`Fetched ${ticketsDocs.length} tickets`);
  
  // Simulated mergeEntities
  const map = new Map();
  ticketsDocs.forEach(doc => { 
    if (doc && doc.data && (doc.data.id || doc.id)) map.set(String(doc.data.id || doc.id), doc.data); 
  });
  
  const finalTickets = Array.from(map.values());
  console.log(`After mergeEntities: ${finalTickets.length} tickets`);
  
  await mongoose.disconnect();
}
run();
