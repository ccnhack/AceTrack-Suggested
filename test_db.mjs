import mongoose from 'mongoose';

async function test() {
  await mongoose.connect('mongodb+srv://admin:LhZ1uY23p26p20R8@acetrack-cluster.3s5i5.mongodb.net/acetrack_db?retryWrites=true&w=majority');
  console.log("Connected");
  const appState = await mongoose.connection.db.collection('appstates').findOne();
  console.log("partnerRequests length:", appState?.data?.partnerRequests?.length);
  console.log("partnerRequests:", JSON.stringify(appState?.data?.partnerRequests, null, 2));
  process.exit(0);
}

test();
