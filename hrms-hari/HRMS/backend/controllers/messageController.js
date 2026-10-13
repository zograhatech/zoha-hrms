const mongoose = require('mongoose');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { uploadFromBuffer } = require('../utils/cloudinary');
const { normalizeRole } = require('../utils/visibilityHelper');
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

        const messages = await Message.find(query)
            .populate('sender', 'name id profile_image')
            .sort({ createdAt: 1 });

        res.json({ success: true, messages });
    } catch (err) {
        console.error('[getMessages]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Send message
exports.sendMessage = async (req, res) => {
    try {
        const { conversationId, text } = req.body;
        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const userId = await resolveUserId(req.user);
        const isParticipant = isUserInParticipants(conversation.participants, userId, req.user);

        if (!isParticipant) {
            return res.status(403).json({ success: false, message: 'Access denied for this conversation.' });
        }

        const senderId = userId;
        let fileUrl = null;
        let fileName = null;
        let fileSize = null;
        let calculatedFileType = null;
        let mimeType = null;

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
                // Upload via buffer stream
                const result = await uploadFromBuffer(req.file.buffer, 'chat_attachments', resourceType, fileName);
                fileUrl = result.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary: Upload Failed!', uploadError);
                // Fallback to local URL if Cloudinary is unconfigured in test
                fileUrl = `/uploads/test_${Date.now()}_${fileName}`;
            }
        }

        const message = await Message.create({
            conversationId,
            sender: senderId,
            text,
            fileUrl,
            fileName,
            fileSize,
            fileType: calculatedFileType,
            mimeType
        });

        // Update conversation with last message link
        await Conversation.findByIdAndUpdate(conversationId, { 
            lastMessage: message._id,
            updatedAt: new Date()
        });

        res.json({ success: true, message });
    } catch (err) {
        console.error('[sendMessage]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Export conversation to PDF (Super Admin only)
exports.exportConversation = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role || '');
        if (callerRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Only Super Admins can export chats.' });
        }

        const { conversationId } = req.params;
        const conversation = await Conversation.findById(conversationId).populate('participants', 'name email id');
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        const userId = await resolveUserId(req.user);
        if (userId) {
            await AuditLog.create({
                user_id: userId,
                action: 'EXPORT',
                resource: 'conversation',
                resource_id: conversation._id,
                ip_address: req.ip || req.connection?.remoteAddress,
                user_agent: req.get('user-agent')
            });
        }

        const messages = await Message.find({ conversationId })
            .populate('sender', 'name id')
            .sort({ createdAt: 1 });

        const doc = new PDFDocument({ margin: 50 });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=conversation_${conversationId}.pdf`);
        doc.pipe(res);

        doc.fontSize(18).text('Chat Conversation Export', { align: 'center' });
        doc.moveDown();
        const participantNames = conversation.participants.map(p => `${p.name} (${p.id || p.email})`).join(', ');
        doc.fontSize(10).text(`Participants: ${participantNames}`);
        doc.text(`Generated at: ${new Date().toISOString()}`);
        doc.moveDown();
        doc.text('------------------------------------------------------------');
        doc.moveDown();

        for (const msg of messages) {
            const time = new Date(msg.createdAt).toLocaleString();
            const sender = msg.sender ? `${msg.sender.name}` : 'Unknown';
            doc.fontSize(10).fillColor('#333333').text(`[${time}] ${sender}:`, { continued: true });
            doc.fillColor('#000000').text(` ${msg.text || (msg.fileUrl ? `[File: ${msg.fileName || msg.fileUrl}]` : '')}`);
        }

        doc.end();
    } catch (err) {
        console.error('[exportConversation]', err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
};
