require("dotenv").config({ path: "/Users/shashankshekhar/Final Working/AceTrack_Stablility_Enhanced/backend/.env" });
const mongoose = require("mongoose");

async function fix() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected...");

  const db = mongoose.connection.db;
  const state = await db.collection("appstates").findOne({}, { sort: { lastUpdated: -1 } });
  
  if (!state) return;
  
  let currentData = state.data;
  
  const extractStrings = (arr) => {
     if (!Array.isArray(arr)) return [];
     const res = new Set();
     arr.forEach(item => {
        if (typeof item === 'string') {
            res.add(item);
        } else if (item && typeof item === 'object') {
            // Attempt to glean string values from the object 
            Object.values(item).forEach(v => {
               if (typeof v === 'string') res.add(v);
            });
        }
     });
     return Array.from(res).filter(s => s.length > 2);
  };

  currentData.seenAdminActionIds = extractStrings(currentData.seenAdminActionIds);
  currentData.visitedAdminSubTabs = extractStrings(currentData.visitedAdminSubTabs);

  console.log("Cleaned seenAdminActionIds:", currentData.seenAdminActionIds);
  console.log("Cleaned visitedAdminSubTabs:", currentData.visitedAdminSubTabs);

  await db.collection("appstates").updateOne(
     { _id: state._id },
     { $set: { data: currentData } }
  );
  
  console.log("Successfully cleaned DB corruption!");
  mongoose.disconnect();
}
fix();
