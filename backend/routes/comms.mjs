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
            const messages = await OrgMessage.find().populate('replyTo').sort({ timestamp: -1 }).limit(100);
            
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

    // 📎 [ATTACHMENT UPLOAD] (v2.6.395): Upload file to Cloudinary with 7-day expiry
    router.post('/chat/upload', upload.single('file'), async (req, res) => {
        try {
            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                return res.status(403).json({ success: false, message: 'Access denied' });
            }

            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file provided' });
            }

            const file = req.file;
            const isImage = file.mimetype.startsWith('image/');
            
            // Upload to Cloudinary
            const result = await cloudinary.uploader.upload(file.path, {
                folder: 'chat_attachments',
                resource_type: isImage ? 'image' : 'raw',
                public_id: `chat_${req.user.id}_${Date.now()}`,
                tags: ['chat_attachment', 'auto_expire']
            });

            // Clean up temp file
            try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }

            const expiresAt = new Date(Date.now() + ATTACHMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

            const attachment = {
                url: result.secure_url,
                publicId: result.public_id,
                filename: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                expiresAt
            };

            console.log(`📎 [UPLOAD] ${req.user.id} uploaded ${file.originalname} (${(file.size / 1024).toFixed(1)}KB). Expires: ${expiresAt.toISOString()}`);

            res.json({ success: true, attachment });
        } catch (error) {
            // Clean up temp file on error
            if (req.file?.path) try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore */ }
            console.error("❌ [UPLOAD_FAIL]", error.message);
            res.status(500).json({ success: false, message: 'Upload failed' });
        }
    });

    // Send Message (v2.6.405: Added replyTo support)
    router.post(['/chat', '/'], async (req, res) => {
        try {
            const { content, receiverId, attachments, replyTo } = req.body;
            
            // 🛡️ [CHAT_DIAGNOSTIC] (v2.6.392)
            await logAudit(req, 'CHAT_MESSAGE_ATTEMPT', [], { 
              target: receiverId, 
              role: req.userRole,
              hasIo: !!io,
              hasAttachments: !!(attachments && attachments.length),
              isReply: !!replyTo
            });

            if (req.userRole !== 'admin' && req.userRole !== 'support') {
                console.warn(`🛑 [CHAT_BLOCK] Unauthorized attempt from ${req.user.id} (${req.userRole})`);
                return res.status(403).json({ success: false, message: 'Access denied' });
            }

            // Require at least content or attachments
            if (!content?.trim() && (!attachments || attachments.length === 0)) {
                return res.status(400).json({ success: false, message: 'Message must have content or attachments' });
            }

            // 🛡️ [BRUTE_FORCE_EXTRACTION] (v2.6.412): Handle object payloads
            let parsedReplyTo = null;
            if (replyTo) {
                if (typeof replyTo === 'object') parsedReplyTo = replyTo._id || replyTo.id;
                else parsedReplyTo = replyTo;
            }

            const msgData = {
                senderId: req.user.id,
                senderName: req.user.name || req.user.email || req.user.id || 'System',
                content: content || '',
                receiverId: receiverId || null,
                replyTo: parsedReplyTo
            };

            // Add attachments if provided
            if (attachments && Array.isArray(attachments) && attachments.length > 0) {
                msgData.attachments = attachments.map(att => ({
                    url: att.url,
                    publicId: att.publicId,
                    filename: att.filename,
                    mimeType: att.mimeType || 'application/octet-stream',
                    size: att.size || 0,
                    expiresAt: att.expiresAt || new Date(Date.now() + ATTACHMENT_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
                }));
            }

            const msg = await OrgMessage.create(msgData);
            let populatedMsg = msg.toObject();
            if (msg.replyTo) {
                const original = await OrgMessage.findById(msg.replyTo).lean();
                populatedMsg.replyTo = original;
            }
            
            // Broadcast via Socket.io if available
            if (io) {
                const eventName = 'org_chat_message';
                if (receiverId) {
                    io.to(`user:${receiverId}`).to(`user:${req.user.id}`).emit(eventName, populatedMsg);
                } else {
                    io.emit(eventName, populatedMsg);
                }
            }

            res.json({ success: true, message: populatedMsg });
        } catch (error) {
            console.error("❌ [CHAT_CREATE_FAIL]", error.message);
            res.status(500).json({ success: false, message: error.message || 'Server error' });
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
            res.status(500).json({ success: false, message: 'Server error' });
        }
    });

    // 😄 [REACTIONS] (v2.6.405): Toggle emoji reactions
    router.post('/chat/react', async (req, res) => {
        try {
            const { messageId, emoji } = req.body;
            const msg = await OrgMessage.findById(messageId);
            if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });

            const reactions = msg.reactions || new Map();
            let users = reactions.get(emoji) || [];

            if (users.includes(req.user.id)) {
                users = users.filter(id => id !== req.user.id);
            } else {
                users.push(req.user.id);
            }

            if (users.length === 0) reactions.delete(emoji);
            else reactions.set(emoji, users);

            msg.reactions = reactions;
            msg.markModified('reactions');
            await msg.save();

            if (io) {
                const payload = { messageId, reactions: Object.fromEntries(reactions) };
                if (msg.receiverId) {
                    io.to(`user:${msg.receiverId}`).to(`user:${msg.senderId}`).emit('org_chat_reaction', payload);
                } else {
                    io.emit('org_chat_reaction', payload);
                }
            }

            res.json({ success: true, reactions: Object.fromEntries(reactions) });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // 🗑️ [DELETE] (v2.6.405): Delete message
    router.delete('/chat/:id', async (req, res) => {
        try {
            const msg = await OrgMessage.findById(req.params.id);
            if (!msg) return res.status(404).json({ success: false });

            if (msg.senderId !== req.user.id && req.userRole !== 'admin') {
                return res.status(403).json({ success: false });
            }

            await OrgMessage.findByIdAndDelete(req.params.id);

            if (io) {
                const payload = { messageId: req.params.id };
                if (msg.receiverId) {
                    io.to(`user:${msg.receiverId}`).to(`user:${msg.senderId}`).emit('org_chat_delete', payload);
                } else {
                    io.emit('org_chat_delete', payload);
                }
            }

            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, message: error.message });
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
