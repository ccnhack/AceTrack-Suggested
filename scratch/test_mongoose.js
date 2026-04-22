require("dotenv").config({ path: "/Users/shashankshekhar/Final Working/AceTrack_Stablility_Enhanced/backend/.env" });
const mongoose = require("mongoose");
const z = require("zod");

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  // Fetch the data
  const db = mongoose.connection.db;
  const state = await db.collection("appstates").findOne({}, { sort: { lastUpdated: -1 } });
  
  if (!state) return console.log("No state");
  
  const currentData = state.data;
  
  // Simulate the UNION MERGE
  const incoming = [
      { "0": "1", "1": "0", "2": "1", "3": "6", "4": "5", "5": "5", "6": "2" },
      "123"
  ];
  const existing = Array.isArray(currentData.seenAdminActionIds) ? currentData.seenAdminActionIds : [];
  
  try {
     const merged = [...new Set([...existing, ...incoming])];
     currentData.seenAdminActionIds = merged;
     
     await db.collection("appstates").updateOne(
        { _id: state._id },
        { $set: { data: currentData } }
     );
     console.log("Successfully ran direct update!");
  } catch (e) {
     console.error("Crash during update!", e);
  }

  mongoose.disconnect();
}
run();
