import mongoose from 'mongoose';
import { config } from 'dotenv';
config();

mongoose.connect("mongodb+srv://shashankshekhar0517:hackerisback1717@cluster0.10s3q.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0")
  .then(async () => {
    const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));
    const filter = {"$or":[{"userId":{"$regex":"shush","$options":"i"}},{"details.email":{"$regex":"shush","$options":"i"}}],"action":{"$regex":"LOGIN","$options":"i"}};
    try {
      const logs = await AuditLog.find(filter).lean();
      console.log(`Found ${logs.length} logs.`);
    } catch (e) {
      console.log("Error running filter:", e.message);
    }
    process.exit(0);
  });
