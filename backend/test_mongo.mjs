import mongoose from 'mongoose';
try {
   const filter = {"timestamp":{"$gte":"2026-05-22T05:23:51.555Z","$lte":"2026-05-23T05:23:51.555Z"},"$or":[{"userId":{"$regex":"shush","$options":"i"}},{"details.email":{"$regex":"shush","$options":"i"}},{"details.name":{"$regex":"shush","$options":"i"}},{"details.userId":{"$regex":"shush","$options":"i"}},{"details.identifier":{"$regex":"shush","$options":"i"}},{"details.receivedIdentifier":{"$regex":"shush","$options":"i"}}],"action":{"$regex":"LOGIN","$options":"i"}};
   
   console.log("Filter parses successfully:", JSON.stringify(filter));
   
   // Just to check if mongoose rejects it
   const schema = new mongoose.Schema({}, { strict: false });
   const Model = mongoose.model('Test', schema);
   const query = Model.find(filter);
   console.log("Query constructed successfully.");
} catch (e) {
   console.error("Error:", e.message);
}
