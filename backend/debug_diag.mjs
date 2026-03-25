import mongoose from 'mongoose';

const MONGODB_URI = "mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/?appName=Cluster0";

const AuditLogSchema = new mongoose.Schema({
  userId: String,
  action: String,
  changedCollections: [String],
  ipAddress: String,
  userAgent: String,
  details: mongoose.Schema.Types.Mixed,
  timestamp: { type: Date, default: Date.now }
});

const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

async function check() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");
    
    console.log("\n--- Latest 20 Audit Logs (All Actions) ---");
    const logs = await AuditLog.find().sort({ timestamp: -1 }).limit(20);
    logs.forEach(l => {
      console.log(`[${l.timestamp.toISOString()}] ${l.action} | IP: ${l.ipAddress}`);
      console.log(`Details: ${JSON.stringify(l.details)}`);
      console.log('---');
    });
    
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

check();
