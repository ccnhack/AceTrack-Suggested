import mongoose from 'mongoose';

const OrgMessageSchema = new mongoose.Schema({
    senderId: { type: String, required: true },
    senderName: { type: String, required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});

const AnnouncementSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    createdBy: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

export const OrgMessage = mongoose.model('OrgMessage', OrgMessageSchema);
export const Announcement = mongoose.model('Announcement', AnnouncementSchema);
