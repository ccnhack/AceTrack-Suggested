db.appstates.find({}).forEach(function(doc) {
  if (doc.seenAdminActionIds && Array.isArray(doc.seenAdminActionIds)) {
    var originalLength = doc.seenAdminActionIds.length;
    // Filter out items that are not at least 10 characters long (to catch single letters, etc.)
    // Assuming valid IDs are UUIDs or ObjectIds (much longer than 1 character)
    var cleaned = doc.seenAdminActionIds.filter(function(id) {
      return typeof id === 'string' && id.length > 5; 
    });
    
    if (cleaned.length < originalLength) {
      print("Updating doc " + doc._id + " - removed " + (originalLength - cleaned.length) + " corrupted IDs");
      db.appstates.updateOne({ _id: doc._id }, { $set: { seenAdminActionIds: cleaned } });
    }
  }
});
