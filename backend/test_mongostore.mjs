import dotenv from 'dotenv';
dotenv.config();
import MongoStore from 'rate-limit-mongo';

async function run() {
  const store = new MongoStore({
    uri: process.env.MONGODB_URI,
    collectionName: 'rate_limits',
  });
  
  store.increment('test_key', (err, hits, resetTime) => {
    if (err) {
      console.error("Increment error:", err.message || err);
      process.exit(1);
    } else {
      console.log("Increment success:", hits);
      process.exit(0);
    }
  });
}
run();
