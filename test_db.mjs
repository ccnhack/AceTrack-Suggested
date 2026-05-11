import { MongoClient } from 'mongodb';
async function run() {
  const uri = "mongodb+srv://acetrack:AcetracK123@cluster0.abc.mongodb.net/acetrack?retryWrites=true&w=majority";
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('acetrack');
  const msgs = await db.collection('orgmessages').find().sort({ timestamp: -1 }).limit(5).toArray();
  console.log(JSON.stringify(msgs.map(m => ({ content: m.content, replyTo: m.replyTo })), null, 2));
  await client.close();
}
run();
