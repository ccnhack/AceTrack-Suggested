import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = 'mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0';

async function run() {
  await mongoose.connect(MONGODB_URI);
  
  const schema = new mongoose.Schema({
    id: { type: String, required: true },
    data: { type: mongoose.Schema.Types.Mixed }
  });
  
  const Player = mongoose.models.Player || mongoose.model('Player', schema);
  
  const user = await Player.findOne({ "data.email": /shashank/i }).lean();
  console.log("User:", JSON.stringify(user, null, 2));
  
  if (user) {
    const defaultPassword = 'password123';
    const hashed = bcrypt.hashSync(defaultPassword, 10);
    await Player.updateOne({ id: user.id }, { $set: { "data.password": hashed } });
    console.log("Updated password for", user.id, "to 'password123'");
  } else {
    console.log("User not found.");
  }
  
  mongoose.disconnect();
}
run();
