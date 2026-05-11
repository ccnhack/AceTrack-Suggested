import express from 'express';
import { OrgMessage, Announcement } from '../models/CommsModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

export default function createCommsRoutes({ io, logAudit }) {
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
    router.post(['/chat', '/'], async (req, res) => {
        try {
            // 🛡️ [CHAT_DIAGNOSTIC] (v2.6.383)
            await logAudit(req, 'CHAT_MESSAGE_ATTEMPT', [], { 
              target: req.body.receiverId, 
              role: req.userRole,
              hasIo: !!io
            });

            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                console.warn(`🛑 [CHAT_BLOCK] Unauthorized attempt from ${req.user.id} (${req.userRole})`);
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
            // 🛡️ [CHAT_TRACE] (v2.6.383)
            console.log(`💬 [CHAT] Msg from ${req.user.id} to ${receiverId || 'GLOBAL'}`);

            const msg = await OrgMessage.create({
                senderId: req.user.id,
                senderName: req.user.name || req.user.email,
                content,
                receiverId
            });
            
            // Broadcast via Socket.io if available
            if (io) {
                if (receiverId) {
                    // 🏗️ PHASE 4: Targeted delivery to recipient and sender (for multi-device sync)
                    io.to(`user:${receiverId}`).to(`user:${req.user.id}`).emit('org_chat_message', msg);
                    console.log(`📡 [CHAT_RELAY] Targeted broadcast to user:${receiverId} and user:${req.user.id}`);
                } else {
                    // Public/Org-wide chat
                    io.emit('org_chat_message', msg);
                    console.log(`📡 [CHAT_RELAY] Global broadcast for public message`);
                }
            } else {
                console.warn(`⚠️ [CHAT_WARN] Socket.io (io) not initialized in comms routes!`);
            }

            res.json({ success: true, message: msg });
        } catch (error) {
            console.error("Error sending chat:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });
    
    // Mark as Seen
    router.post('/chat/seen', async (req, res) => {
        try {
            const { senderId } = req.body;
            if (!senderId) return res.status(400).json({ success: false, message: 'senderId required' });
            
            await OrgMessage.updateMany(
                { senderId, receiverId: req.user.id, status: { $ne: 'seen' } },
                { $set: { status: 'seen' } }
            );
            
            res.json({ success: true });
        } catch (error) {
            console.error("Error marking as seen:", error);
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
