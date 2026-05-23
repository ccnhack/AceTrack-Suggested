import mongoose from 'mongoose';
import config from './config.mjs';

mongoose.connect(config.DB_URI)
  .then(async () => {
    const AuditLog = mongoose.model('AuditLog', new mongoose.Schema({}, { strict: false }));
    
    const filter = {"$or":[{"userId":{"$regex":"shush","$options":"i"}},{"details.email":{"$regex":"shush","$options":"i"}}],"action":{"$regex":"LOGIN","$options":"i"}};
    
    try {
      const logs = await AuditLog.find(filter).lean();
      console.log(`Found ${logs.length} logs for shush with filter.`);
    } catch (e) {
      console.log("Error running filter:", e.message);
    }
    process.exit(0);
  });
