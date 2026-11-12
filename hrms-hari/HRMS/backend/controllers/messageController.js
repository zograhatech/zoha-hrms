const mongoose = require('mongoose');
const crypto = require('crypto');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const { uploadFromBuffer } = require('../utils/cloudinary');
const { normalizeRole } = require('../utils/visibilityHelper');
const { isSuperAdminUser } = require('../utils/authHelper');
const r2Storage = require('../utils/r2Storage');
const PDFDocument = require('pdfkit');

// Helper to resolve MongoDB ObjectId for user
const resolveUserId = async (user) => {
    if (!user) return null;
    if (user._id && mongoose.Types.ObjectId.isValid(user._id)) return user._id;
    const val = typeof user === 'object' ? (user.id || user._id) : user;
    if (mongoose.Types.ObjectId.isValid(val)) {
        const emp = await Employee.findById(val).select('_id');
        if (emp) return emp._id;
    }
    const empByStringId = await Employee.findOne({ id: val }).select('_id');
    if (empByStringId) return empByStringId._id;
    return mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : null;
};

const isUserInParticipants = (participants, userId, userObj) => {
    return (participants || []).some(p => {
        const pid = (p?._id || p).toString();
        return (userId && pid === userId.toString()) || (userObj?.id && pid === userObj.id);
    });
};

// Get messages for a conversation
exports.getMessages = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const { conversationId } = req.params;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const callerRole = normalizeRole(req.user?.role || '');
        const userId = await resolveUserId(req.user);
        const isParticipant = isUserInParticipants(conversation.participants, userId, req.user);

        if (!isParticipant) {
            if (callerRole !== 'admin') {
                return res.status(403).json({ success: false, message: 'Access denied for this conversation.' });
            }

            // Super Admin oversight read: write AuditLog entry
            if (userId) {
                await AuditLog.create({
                    user_id: userId,
                    action: 'READ',
                    resource: 'conversation',
                    resource_id: conversation._id,
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            }
        }

        const query = { conversationId };
        if (req.query.since) {
            query.createdAt = { $gt: new Date(req.query.since) };
        }

        const limit = parseInt(req.query.limit || '100', 10);

        const messages = await Message.find(query)
            .populate('sender', 'name id profile_image')
            .sort({ createdAt: 1 })
            .limit(limit);

        res.json({ success: true, messages });
    } catch (err) {
        console.error('[getMessages]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Send message (Idempotent via clientMessageId)
exports.sendMessage = async (req, res) => {
    try {
        const { conversationId, text, content, clientMessageId } = req.body;
        if (!conversationId) {
            return res.status(400).json({ success: false, message: 'Conversation ID is required' });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const userId = await resolveUserId(req.user);
        const isParticipant = isUserInParticipants(conversation.participants, userId, req.user);

        if (!isParticipant) {
            return res.status(403).json({ success: false, message: 'Access denied for this conversation.' });
        }

        // Idempotency check: if clientMessageId already exists for this conversation, return it
        if (clientMessageId) {
            const existing = await Message.findOne({ conversationId, clientMessageId })
                .populate('sender', 'name id profile_image');
            if (existing) {
                return res.json({ success: true, message: existing, duplicate: true });
            }
        }

        const rawText = text !== undefined ? text : content;
        const cleanText = typeof rawText === 'string' ? rawText.trim() : '';
        if (!cleanText && !req.file && !req.body.fileUrl) {
            return res.status(400).json({ success: false, message: 'Message content or attachment is required.' });
        }

        const senderId = userId;
        let fileUrl = req.body.fileUrl || null;
        let fileName = req.body.fileName || null;
        let fileSize = req.body.fileSize ? Number(req.body.fileSize) : null;
        let calculatedFileType = req.body.fileType || null;
        let mimeType = req.body.mimeType || null;

        if (req.file) {
            fileName = req.file.originalname;
            fileSize = req.file.size;
            mimeType = req.file.mimetype;

            let resourceType = 'auto'; 
            if (req.file.mimetype.startsWith('image/')) {
                calculatedFileType = 'image';
                resourceType = 'image';
            } else if (req.file.mimetype.startsWith('video/')) {
                calculatedFileType = 'video';
                resourceType = 'video';
            } else if (req.file.mimetype.startsWith('audio/')) {
                calculatedFileType = 'audio';
                resourceType = 'video';
            } else {
                calculatedFileType = 'file';
                resourceType = 'raw';
            }

            try {
                const result = await uploadFromBuffer(req.file.buffer, 'chat_attachments', resourceType, fileName);
                fileUrl = result.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary: Upload Failed, using fallback', uploadError);
                fileUrl = `/uploads/test_${Date.now()}_${fileName}`;
            }
        } else if (fileUrl && !calculatedFileType) {
            // Infer fileType from extension
            const ext = (fileName || fileUrl).split('.').pop()?.toLowerCase();
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) {
                calculatedFileType = 'image';
            } else if (['mp4', 'webm', 'ogg', 'mov', 'mkv'].includes(ext)) {
                calculatedFileType = 'video';
            } else if (['mp3', 'wav', 'm4a', 'aac', 'flac'].includes(ext)) {
                calculatedFileType = 'audio';
            } else {
                calculatedFileType = 'file';
            }
        }

        const message = await Message.create({
            conversationId,
            clientMessageId: clientMessageId || null,
            sender: senderId,
            text: cleanText,
            fileUrl,
            fileName,
            fileSize,
            fileType: calculatedFileType,
            mimeType,
            status: 'sent',
            deliveredTo: [],
            seenBy: []
        });

        // Update conversation with last message link
        await Conversation.findByIdAndUpdate(conversationId, { 
            lastMessage: message._id,
            updatedAt: new Date()
        });

        const populatedMessage = await Message.findById(message._id)
            .populate('sender', 'name id profile_image');

        // Create or update in-app notifications for other participants
        const senderEmp = await Employee.findById(senderId).select('name id');
        const senderName = senderEmp?.name || req.user?.name || 'Someone';
        const otherParticipants = (conversation.participants || []).filter(p => p.toString() !== senderId.toString());

        for (const recipientId of otherParticipants) {
            try {
                // Check if an unread chat notification already exists for this conversation from this sender
                const existingNotif = await Notification.findOne({
                    recipient: recipientId,
                    type: 'chat',
                    is_read: false,
                    'data.conversationId': conversationId.toString()
                });

                if (existingNotif) {
                    const newCount = (existingNotif.data?.count || 1) + 1;
                    existingNotif.message = `${senderName} sent ${newCount} messages`;
                    existingNotif.data = {
                        ...existingNotif.data,
                        count: newCount,
                        messageId: message._id.toString()
                    };
                    await existingNotif.save();
                } else {
                    const preview = cleanText ? (cleanText.length > 60 ? cleanText.substring(0, 57) + '...' : cleanText) : 'Sent a file';
                    await Notification.create({
                        recipient: recipientId,
                        sender: senderId,
                        type: 'chat',
                        title: senderName,
                        message: preview,
                        data: {
                            conversationId: conversationId.toString(),
                            messageId: message._id.toString(),
                            link: '/dashboard/messages',
                            count: 1
                        },
                        is_read: false
                    });
                }
            } catch (notifErr) {
                console.error('[sendMessage notification error]', notifErr.message);
            }
        }

        // Emit Socket.io if available
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(conversationId.toString()).emit('receive_message', populatedMessage);
            }
        } catch (_) {}

        // Trigger hosted realtime (Pusher) on PRIVATE channels with IDs ONLY (never message text)
        try {
            const { triggerRealtime } = require('../utils/realtimeService');
            triggerRealtime(`private-chat-${conversationId}`, 'receive_message', {
                conversationId: conversationId.toString(),
                messageId: populatedMessage._id.toString(),
                senderId: populatedMessage.sender?._id?.toString() || populatedMessage.sender?.id || ''
            });
            if (recipientId) {
                triggerRealtime(`private-user-${recipientId}`, 'chat-notification', {
                    conversationId: conversationId.toString(),
                    messageId: populatedMessage._id.toString()
                });
            }
        } catch (_) {}

        res.json({ success: true, message: populatedMessage });
    } catch (err) {
        console.error('[sendMessage]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Mark messages delivered
// Triggered when a user opens the app or polls conversations
exports.markDelivered = async (req, res) => {
    try {
        const userId = await resolveUserId(req.user);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const { conversationId } = req.body || {};
        let convIds = [];

        if (conversationId) {
            const conv = await Conversation.findById(conversationId);
            if (!conv) {
                return res.status(404).json({ success: false, message: 'Conversation not found' });
            }
            if (!isUserInParticipants(conv.participants, userId, req.user)) {
                return res.status(403).json({ success: false, message: 'Forbidden. You are not a participant in this conversation.' });
            }
            convIds = [conv._id];
        } else {
            // Find all conversations user is part of (matches ObjectId or string employee code)
            const participantMatches = [userId, userId?.toString(), req.user?.id, req.user?.employee_id].filter(Boolean);
            const userConversations = await Conversation.find({
                participants: { $in: Array.from(new Set(participantMatches)) }
            }).select('_id');
            convIds = userConversations.map(c => c._id);
        }

        const now = new Date();
        const updateResult = await Message.updateMany(
            {
                conversationId: { $in: convIds },
                sender: { $ne: userId },
                status: 'sent'
            },
            {
                $set: { status: 'delivered', deliveredAt: now },
                $addToSet: { deliveredTo: userId }
            }
        );

        if (updateResult.modifiedCount > 0) {
            try {
                const { triggerRealtime } = require('../utils/realtimeService');
                const channels = convIds.slice(0, 10).map(id => `private-chat-${id}`);
                triggerRealtime(channels, 'messages_delivered', { deliveredTo: userId.toString(), deliveredAt: now });
            } catch (_) {}
        }

        res.json({ success: true, modifiedCount: updateResult.modifiedCount });
    } catch (err) {
        console.error('[markDelivered]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Mark messages seen
// Triggered when a user has a conversation open in a visible tab
exports.markSeen = async (req, res) => {
    try {
        const { conversationId, messageIds } = req.body;
        const userId = await resolveUserId(req.user);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        if (!conversationId) {
            return res.status(400).json({ success: false, message: 'conversationId is required' });
        }

        const conv = await Conversation.findById(conversationId);
        if (!conv) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        if (!isUserInParticipants(conv.participants, userId, req.user)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You are not a participant in this conversation.' });
        }

        const query = {
            conversationId: conv._id,
            sender: { $ne: userId },
            $or: [
                { status: { $in: ['sent', 'delivered'] } },
                { 'seenBy.employee': { $ne: userId } }
            ]
        };

        if (Array.isArray(messageIds) && messageIds.length > 0) {
            query._id = { $in: messageIds };
        }

        const now = new Date();
        const updateResult = await Message.updateMany(query, {
            $set: { status: 'seen', seenAt: now },
            $addToSet: { seenBy: { employee: userId, seenAt: now } }
        });

        // Mark in-app chat notifications for this conversation as read
        await Notification.updateMany(
            {
                recipient: userId,
                type: 'chat',
                'data.conversationId': conversationId.toString(),
                is_read: false
            },
            { $set: { is_read: true } }
        );

        // Emit Socket.io seen event if available
        try {
            const { getIO } = require('../socket');
            const io = getIO();
            if (io) {
                io.to(conversationId.toString()).emit('messages_seen', {
                    conversationId,
                    seenBy: userId,
                    seenAt: now
                });
            }
        } catch (_) {}

        // Trigger hosted realtime (Pusher) if configured
        try {
            const { triggerRealtime } = require('../utils/realtimeService');
            triggerRealtime(`private-chat-${conversationId}`, 'messages_seen', {
                conversationId: conversationId.toString(),
                seenBy: userId.toString(),
                seenAt: now
            });
        } catch (_) {}

        res.json({ success: true, modifiedCount: updateResult.modifiedCount });
    } catch (err) {
        console.error('[markSeen]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get total unread chat message count for the current user
exports.getUnreadCount = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const userId = await resolveUserId(req.user);
        if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

        const userConversations = await Conversation.find({ participants: userId }).select('_id');
        const convIds = userConversations.map(c => c._id);

        // When recipient client performs global poll, transition any pending 'sent' messages to 'delivered'
        const now = new Date();
        await Message.updateMany(
            {
                conversationId: { $in: convIds },
                sender: { $ne: userId },
                status: 'sent'
            },
            {
                $set: { status: 'delivered', deliveredAt: now },
                $addToSet: { deliveredTo: userId }
            }
        );

        // Count only explicitly unread messages (status 'sent' or 'delivered'), excluding legacy messages with no status field
        const unreadCount = await Message.countDocuments({
            conversationId: { $in: convIds },
            sender: { $ne: userId },
            status: { $in: ['sent', 'delivered'] }
        });

        res.json({ success: true, count: unreadCount });
    } catch (err) {
        console.error('[getUnreadCount]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Export conversation to PDF, TXT, or CSV (Strictly Super Admin only)
exports.exportConversation = async (req, res) => {
    try {
        if (!isSuperAdminUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can export chats.' });
        }

        const conversationId = req.params.conversationId || req.params.id;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        // Hydrate conversation participants for display
        const { hydrateConversationParticipants } = require('./conversationController');
        if (typeof hydrateConversationParticipants === 'function') {
            await hydrateConversationParticipants(conversation);
        }

        const messages = await Message.find({ conversationId })
            .populate('sender', 'name id email')
            .sort({ createdAt: 1 })
            .lean();

        // AuditLog entry with action CHAT_OVERSIGHT_EXPORT
        const format = (req.query.format || 'pdf').toLowerCase();
        const adminUserId = await resolveUserId(req.user);
        if (adminUserId) {
            try {
                await AuditLog.create({
                    user_id: adminUserId,
                    action: 'CHAT_OVERSIGHT_EXPORT',
                    resource: 'conversation',
                    resource_id: conversation._id,
                    new_value: {
                        format,
                        totalMessages: messages.length,
                        exportedAt: new Date()
                    },
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            } catch (auditErr) {
                console.error('[exportConversation] AuditLog creation failed:', auditErr.message);
            }
        }

        const participantStr = (conversation.participants || [])
            .map(p => `${p.name || p.id || 'Unknown'} (${p.id || p.email || '—'})`)
            .join(', ');

        if (format === 'txt') {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="chat_oversight_${conversationId}.txt"`);
            
            let textOutput = `=== CHAT CONVERSATION OVERSIGHT EXPORT ===\n`;
            textOutput += `Conversation ID: ${conversationId}\n`;
            textOutput += `Participants: ${participantStr}\n`;
            textOutput += `Exported At: ${new Date().toISOString()}\n`;
            textOutput += `Total Messages: ${messages.length}\n`;
            textOutput += `------------------------------------------------------------\n\n`;

            for (const msg of messages) {
                const time = new Date(msg.createdAt).toLocaleString();
                const senderName = msg.sender?.name || msg.sender?.id || 'Unknown';
                const senderId = msg.sender?.id ? ` (${msg.sender.id})` : '';
                const fileInfo = msg.fileUrl ? ` [Attachment: ${msg.fileName || 'file'} - ${msg.fileUrl}]` : '';
                textOutput += `[${time}] ${senderName}${senderId}: ${msg.text || ''}${fileInfo}\n`;
            }

            return res.send(textOutput);
        }

        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="chat_oversight_${conversationId}.csv"`);
            
            const escapeCsv = (str) => {
                if (str === null || str === undefined) return '""';
                const s = String(str).replace(/"/g, '""');
                return `"${s}"`;
            };

            let csvOutput = `"Timestamp","Sender ID","Sender Name","Message","Attachment Name","Attachment URL"\n`;
            for (const msg of messages) {
                const time = new Date(msg.createdAt).toISOString();
                const senderId = msg.sender?.id || '';
                const senderName = msg.sender?.name || 'Unknown';
                const text = msg.text || '';
                const fileName = msg.fileName || '';
                const fileUrl = msg.fileUrl || '';
                csvOutput += `${escapeCsv(time)},${escapeCsv(senderId)},${escapeCsv(senderName)},${escapeCsv(text)},${escapeCsv(fileName)},${escapeCsv(fileUrl)}\n`;
            }

            return res.send(csvOutput);
        }

        // Default: PDF format
        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="chat_oversight_${conversationId}.pdf"`);
        doc.pipe(res);

        doc.fontSize(16).text('Chat Conversation Oversight Export', { align: 'center' });
        doc.moveDown();
        doc.fontSize(9).fillColor('#666666').text(`Conversation ID: ${conversationId}`);
        doc.text(`Participants: ${participantStr}`);
        doc.text(`Generated at: ${new Date().toISOString()}`);
        doc.text(`Total Messages: ${messages.length}`);
        doc.moveDown();
        doc.text('--------------------------------------------------------------------------------------------------');
        doc.moveDown();

        for (const msg of messages) {
            const time = new Date(msg.createdAt).toLocaleString();
            const sender = msg.sender ? `${msg.sender.name} (${msg.sender.id || '—'})` : 'Unknown';
            doc.fontSize(9).fillColor('#0284c7').text(`[${time}] ${sender}:`, { continued: true });
            doc.fillColor('#111827').text(` ${msg.text || ''}`);
            if (msg.fileUrl) {
                doc.fontSize(8).fillColor('#d97706').text(`   📎 Attachment: ${msg.fileName || 'file'} (${msg.fileUrl})`);
            }
            doc.moveDown(0.3);
        }

        doc.end();
    } catch (err) {
        console.error('[exportConversation]', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
};

// POST /api/messages/upload-signature
// Direct-to-storage signed parameters for Cloudinary (<10MB) or Cloudflare R2 / S3 Multipart (up to 2GB)
exports.getUploadSignature = async (req, res) => {
    try {
        const { filename, fileType, fileSize } = req.body;
        const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES || '2147483648', 10); // 2 GB default
        if (fileSize && fileSize > maxBytes) {
            return res.status(400).json({
                success: false,
                message: `File size exceeds the maximum limit of ${Math.round(maxBytes / (1024 * 1024))} MB.`
            });
        }

        // If file is large (> 10MB) or Cloudflare R2 is configured, route to R2 multipart
        if (r2Storage.isR2Configured() && (fileSize > 10 * 1024 * 1024 || !process.env.CLOUDINARY_CLOUD_NAME)) {
            const initData = await r2Storage.initiateMultipartUpload({
                filename: filename || 'attachment.zip',
                fileType: fileType || 'application/octet-stream'
            });
            return res.json({
                success: true,
                provider: 'r2',
                uploadId: initData.uploadId,
                key: initData.key,
                publicUrl: initData.publicUrl,
                partSize: 10 * 1024 * 1024 // 10 MB per part
            });
        }

        const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
        const apiKey = process.env.CLOUDINARY_API_KEY;
        const apiSecret = process.env.CLOUDINARY_API_SECRET;

        if (cloudName && apiKey && apiSecret) {
            // Cloudinary raw archives have a hard plan limit of 10MB on free tiers
            const isRawArchive = !fileType?.startsWith('image/') && !fileType?.startsWith('video/') && !fileType?.startsWith('audio/');
            if (isRawArchive && fileSize > 10 * 1024 * 1024 && !r2Storage.isR2Configured()) {
                return res.status(400).json({
                    success: false,
                    message: 'Raw archives > 10 MB require Cloudflare R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET) for direct 1GB+ multipart upload.'
                });
            }

            const cloudinary = require('cloudinary').v2;
            cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

            const timestamp = Math.round(Date.now() / 1000);
            const folder = 'chat_attachments';
            const paramsToSign = { folder, timestamp };
            const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

            let resourceType = 'auto';
            if (fileType?.startsWith('image/')) resourceType = 'image';
            else if (fileType?.startsWith('video/')) resourceType = 'video';
            else if (fileType?.startsWith('audio/')) resourceType = 'video';
            else resourceType = 'raw';

            return res.json({
                success: true,
                provider: 'cloudinary',
                uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`,
                params: {
                    api_key: apiKey,
                    timestamp,
                    folder,
                    signature
                }
            });
        }

        // Fallback: direct multipart upload to backend
        return res.json({
            success: true,
            provider: 'multipart',
            uploadUrl: '/messages/send'
        });
    } catch (err) {
        console.error('[getUploadSignature]', err);
        res.status(500).json({ success: false, message: 'Failed to generate upload signature.' });
    }
};

// POST /api/messages/upload/r2-initiate
exports.r2InitiateMultipart = async (req, res) => {
    try {
        const { filename, fileType, fileSize } = req.body;
        const maxBytes = parseInt(process.env.MAX_UPLOAD_BYTES || '2147483648', 10);
        if (fileSize && fileSize > maxBytes) {
            return res.status(400).json({ success: false, message: 'File size exceeds maximum allowed limit.' });
        }

        if (!r2Storage.isR2Configured()) {
            return res.status(400).json({
                success: false,
                message: 'Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.'
            });
        }

        const result = await r2Storage.initiateMultipartUpload({ filename: filename || 'file.zip', fileType });
        res.json({
            success: true,
            provider: 'r2',
            uploadId: result.uploadId,
            key: result.key,
            publicUrl: result.publicUrl,
            partSize: 10 * 1024 * 1024
        });
    } catch (err) {
        console.error('[r2InitiateMultipart]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/messages/upload/r2-part-url
exports.r2GetPartUrl = async (req, res) => {
    try {
        const { key, uploadId, partNumber } = req.body;
        if (!key || !uploadId || !partNumber) {
            return res.status(400).json({ success: false, message: 'key, uploadId, and partNumber are required.' });
        }

        const presignedUrl = r2Storage.getPresignedPartUrl({
            key,
            uploadId,
            partNumber: parseInt(partNumber, 10)
        });
        res.json({ success: true, presignedUrl, partNumber: parseInt(partNumber, 10) });
    } catch (err) {
        console.error('[r2GetPartUrl]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/messages/upload/r2-complete
exports.r2CompleteMultipart = async (req, res) => {
    try {
        const { key, uploadId, parts } = req.body;
        if (!key || !uploadId || !Array.isArray(parts)) {
            return res.status(400).json({ success: false, message: 'key, uploadId, and parts array are required.' });
        }

        const result = await r2Storage.completeMultipartUpload({ key, uploadId, parts });
        res.json({ success: true, fileUrl: result.fileUrl });
    } catch (err) {
        console.error('[r2CompleteMultipart]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/messages/upload/r2-abort
exports.r2AbortMultipart = async (req, res) => {
    try {
        const { key, uploadId } = req.body;
        if (!key || !uploadId) {
            return res.status(400).json({ success: false, message: 'key and uploadId are required.' });
        }

        await r2Storage.abortMultipartUpload({ key, uploadId });
        res.json({ success: true, message: 'Upload aborted.' });
    } catch (err) {
        console.error('[r2AbortMultipart]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// POST /api/messages/pusher/auth
// Validates caller is a conversation participant before granting access to private-chat-* channels
exports.pusherAuth = async (req, res) => {
    try {
        const { socket_id, channel_name } = req.body;
        if (!socket_id || !channel_name) {
            return res.status(400).json({ success: false, message: 'socket_id and channel_name are required.' });
        }

        const userId = await resolveUserId(req.user);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }

        // Private conversation channels: private-chat-<conversationId>
        if (channel_name.startsWith('private-chat-')) {
            const conversationId = channel_name.replace('private-chat-', '');
            const conversation = await Conversation.findById(conversationId);
            if (!conversation) {
                return res.status(404).json({ success: false, message: 'Conversation not found.' });
            }

            const isParticipant = isUserInParticipants(conversation.participants, userId, req.user);
            if (!isParticipant) {
                // Strictly deny non-participants (Super Admin monitor does not eavesdrop on private channels)
                return res.status(403).json({ success: false, message: 'Forbidden. You are not a participant in this conversation.' });
            }
        } else if (channel_name.startsWith('private-user-')) {
            const targetUserId = channel_name.replace('private-user-', '');
            const isSelf = String(userId) === String(targetUserId) || String(req.user?.id) === String(targetUserId);
            if (!isSelf) {
                return res.status(403).json({ success: false, message: 'Forbidden. Cannot subscribe to another user channel.' });
            }
        }

        const secret = process.env.PUSHER_SECRET;
        const key = process.env.PUSHER_KEY;
        if (!secret || !key) {
            return res.status(500).json({ success: false, message: 'Pusher is not configured on server.' });
        }

        const stringToSign = `${socket_id}:${channel_name}`;
        const authSignature = crypto.createHmac('sha256', secret).update(stringToSign).digest('hex');

        res.json({ auth: `${key}:${authSignature}` });
    } catch (err) {
        console.error('[pusherAuth]', err);
        res.status(500).json({ success: false, message: 'Pusher authentication failed.' });
    }
};
