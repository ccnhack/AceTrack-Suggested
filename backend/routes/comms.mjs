import express from 'express';
import { OrgMessage, Announcement } from '../models/CommsModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export default function createCommsRoutes({ io }) {
    const router = express.Router();
    
    router.use(apiKeyGuard);
    router.use(authGuard);

    // Chat History
    router.get('/chat', async (req, res) => {
        try {
            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
            const messages = await OrgMessage.find().sort({ timestamp: -1 }).limit(100);
            res.json({ success: true, messages: messages.reverse() });
        } catch (error) {
            console.error("Error fetching chat:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Send Message
    router.post('/chat', async (req, res) => {
        try {
            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
            const { content } = req.body;
            const msg = await OrgMessage.create({
                senderId: req.user.id,
                senderName: req.user.name || req.user.email,
                content
            });
            
            // Broadcast via Socket.io if available
            if (io) {
                io.emit('org_chat_message', msg);
            }

            res.json({ success: true, message: msg });
        } catch (error) {
            console.error("Error sending chat:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // Announcements
    router.get('/announcements', async (req, res) => {
        try {
            const announcements = await Announcement.find().sort({ createdAt: -1 });
            res.json({ success: true, announcements });
        } catch (error) {
            console.error("Error fetching announcements:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    return router;
}
