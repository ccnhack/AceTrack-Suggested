import express from 'express';
import fs from 'fs';
import { OrgMessage, Announcement } from '../models/CommsModels.mjs';
import { apiKeyGuard, authGuard } from '../middleware/security.mjs';

const ATTACHMENT_EXPIRY_DAYS = 7;

export default function createCommsRoutes({ io, logAudit, cloudinary, upload }) {
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
            
            // 🛡️ [EXPIRY_FILTER] (v2.6.395): Mark expired attachments
            const now = new Date();
            const processed = messages.reverse().map(m => {
                const msg = m.toObject();
                if (msg.attachments && msg.attachments.length > 0) {
                    msg.attachments = msg.attachments.map(att => ({
                        ...att,
                        expired: new Date(att.expiresAt) < now
                    }));
                }
                return msg;
            });
            
            res.json({ success: true, messages: processed });
        } catch (error) {
            console.error("Error fetching chat:", error);
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // 📎 [ATTACHMENT UPLOAD] (v2.6.395)
    router.post('/chat/upload', upload.single('file'), async (req, res) => {
        try {
            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }
            if (!req.file) return res.status(400).json({ success: false, message: 'No file' });

            const result = await cloudinary.uploader.upload(req.file.path, {
                folder: 'chat_attachments',
                resource_type: req.file.mimetype.startsWith('image/') ? 'image' : 'raw',
                tags: ['chat_attachment', 'auto_expire']
            });

            try { fs.unlinkSync(req.file.path); } catch (e) {}

            const expiresAt = new Date(Date.now() + ATTACHMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
            res.json({ 
                success: true, 
                attachment: {
                    url: result.secure_url,
                    publicId: result.public_id,
                    filename: req.file.originalname,
                    mimeType: req.file.mimetype,
                    size: req.file.size,
                    expiresAt
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Send Message (v2.6.400: Added replyTo support)
    router.post(['/chat', '/'], async (req, res) => {
        try {
            const { content, receiverId, attachments, replyTo } = req.body;
            
            await logAudit(req, 'CHAT_MESSAGE_ATTEMPT', [], { target: receiverId, isReply: !!replyTo });

            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }

            const msg = await OrgMessage.create({
                senderId: req.user.id,
                senderName: req.user.name || req.user.email || req.user.id || 'System',
                content: content || '',
                receiverId: receiverId || null,
                attachments: attachments || [],
                replyTo: replyTo || null
            });
            
            if (io) {
                const eventName = 'org_chat_message';
                if (receiverId) {
                    io.to(`user:${receiverId}`).to(`user:${req.user.id}`).emit(eventName, msg);
                } else {
                    io.emit(eventName, msg);
                }
            }
            res.json({ success: true, message: msg });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // 😄 [REACTIONS] (v2.6.400)
    router.post('/chat/react', async (req, res) => {
        try {
            const { messageId, emoji } = req.body;
            const msg = await OrgMessage.findById(messageId);
            if (!msg) return res.status(404).json({ success: false, message: 'Not found' });

            const reactions = msg.reactions || new Map();
            let users = reactions.get(emoji) || [];
            if (users.includes(req.user.id)) users = users.filter(id => id !== req.user.id);
            else users.push(req.user.id);

            if (users.length === 0) reactions.delete(emoji);
            else reactions.set(emoji, users);

            msg.reactions = reactions;
            msg.markModified('reactions');
            await msg.save();

            if (io) {
                const payload = { messageId, reactions: Object.fromEntries(reactions) };
                if (msg.receiverId) io.to(`user:${msg.receiverId}`).to(`user:${msg.senderId}`).emit('org_chat_reaction', payload);
                else io.emit('org_chat_reaction', payload);
            }
            res.json({ success: true, reactions: Object.fromEntries(reactions) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // 🗑️ [DELETE] (v2.6.400)
    router.delete('/chat/:id', async (req, res) => {
        try {
            const msg = await OrgMessage.findById(req.params.id);
            if (!msg && req.userRole !== 'admin') return res.status(404).json({ success: false });
            if (msg && msg.senderId !== req.user.id && req.userRole !== 'admin') return res.status(403).json({ success: false });

            await OrgMessage.findByIdAndDelete(req.params.id);
            if (io) {
                const payload = { messageId: req.params.id };
                if (msg?.receiverId) io.to(`user:${msg.receiverId}`).to(`user:${msg.senderId}`).emit('org_chat_delete', payload);
                else io.emit('org_chat_delete', payload);
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });
    
    // Mark as Seen
    router.post('/chat/seen', async (req, res) => {
        try {
            const { senderId } = req.body;
            await OrgMessage.updateMany(
                { senderId, receiverId: req.user.id, status: { $ne: 'seen' } },
                { $set: { status: 'seen' } }
            );
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false });
        }
    });

    // Announcements
    router.get('/announcements', async (req, res) => {
        try {
            const announcements = await Announcement.find().sort({ createdAt: -1 });
            res.json({ success: true, announcements });
        } catch (error) {
            res.status(500).json({ success: false });
        }
    });

    return router;
}
