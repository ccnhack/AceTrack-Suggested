import mongoose from 'mongoose';

const OrgMessageSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    receiverId: { type: String }, // Optional for broadcasts
    content: { type: String, required: true },
    status: { type: String, default: 'sent' }, // sent, seen
    timestamp: { type: Date, default: Date.now },
    reminderSentAt: { type: Date, default: null } // 📧 [CHAT_REMINDER] (v2.6.383)
});

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export const OrgMessage = mongoose.models.OrgMessage || mongoose.model('OrgMessage', OrgMessageSchema);
export const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', AnnouncementSchema);
