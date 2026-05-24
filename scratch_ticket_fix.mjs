import mongoose from 'mongoose';

mongoose.connect("mongodb+srv://AceTrack_Admin:FHutG9recfAF_MC@cluster0.zdqlj0f.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0")
  .then(async () => {
    const supportTicketSchema = new mongoose.Schema({
      id: String,
      data: mongoose.Schema.Types.Mixed,
      lastUpdated: Date,
    });
    
    const SupportTicket = mongoose.models.SupportTicket || mongoose.model('SupportTicket', supportTicketSchema);
    
    const ticketDoc = await SupportTicket.findOne({ "id": "2899313" });
    if (ticketDoc) {
      ticketDoc.data.status = 'Closed';
      ticketDoc.data.closedAt = new Date().toISOString();
      
      const f = (new Date()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      ticketDoc.data.messages.push({
        id: `system-${Date.now()}`,
        senderId: 'system',
        text: `-------- CLOSED WAS IN PROGRESS --------\n(${f})`,
        timestamp: new Date().toISOString(),
        type: 'event'
      });
      
      ticketDoc.lastUpdated = new Date();
      ticketDoc.markModified('data');
      await ticketDoc.save();
      console.log("Ticket 2899313 forced to Closed successfully.");
    } else {
      console.log("Ticket 2899313 not found");
    }
    process.exit(0);
  });
