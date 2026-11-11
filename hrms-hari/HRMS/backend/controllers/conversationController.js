const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { normalizeRole } = require('../utils/visibilityHelper');

// Helper to resolve MongoDB ObjectId for user
const resolveEmployeeObjectId = async (userOrId) => {
    if (!userOrId) return null;
    if (userOrId._id && mongoose.Types.ObjectId.isValid(userOrId._id)) return userOrId._id;
    const val = typeof userOrId === 'object' ? (userOrId.id || userOrId._id) : userOrId;
    if (mongoose.Types.ObjectId.isValid(val)) {
        const empByMongoId = await Employee.findById(val).select('_id');
        if (empByMongoId) return empByMongoId._id;
    }
    const empByStringId = await Employee.findOne({ id: val }).select('_id');
    if (empByStringId) return empByStringId._id;
    return mongoose.Types.ObjectId.isValid(val) ? new mongoose.Types.ObjectId(val) : null;
};

// Create or get existing 1-on-1 conversation
exports.createConversation = async (req, res) => {
    try {
        const { recipientId } = req.body;
        if (!recipientId) return res.status(400).json({ success: false, message: 'Recipient ID is required' });

        const senderId = await resolveEmployeeObjectId(req.user);
        const targetId = await resolveEmployeeObjectId(recipientId);

        if (!senderId || !targetId) {
            return res.status(400).json({ success: false, message: 'Invalid sender or recipient' });
        }

        // Check for existing 1-on-1
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [senderId, targetId], $size: 2 }
        }).populate('participants', 'name id profile_image email');

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, targetId],
                isGroup: false
            });
            conversation = await conversation.populate('participants', 'name id profile_image email');
            return res.status(201).json({ success: true, conversation });
        }

        res.json({ success: true, conversation });
    } catch (err) {
        console.error('[createConversation]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create Group Conversation
exports.createGroup = async (req, res) => {
    try {
        const { groupName, participants } = req.body;
        const adminId = await resolveEmployeeObjectId(req.user);

        const resolvedParticipants = await Promise.all(
            (participants || []).map(p => resolveEmployeeObjectId(p))
        );
        const validParticipants = resolvedParticipants.filter(Boolean);
        const allParticipants = [...new Set([...validParticipants.map(p => p.toString()), adminId.toString()])].map(id => new mongoose.Types.ObjectId(id));

        const conversation = await Conversation.create({
            participants: allParticipants,
            isGroup: true,
            groupName,
            groupAdmin: adminId
        });

        res.json({ success: true, conversation });
    } catch (err) {
        console.error('[createGroup]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get User's Conversations
exports.getConversations = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const callerRole = normalizeRole(req.user?.role || '');
        const userId = await resolveEmployeeObjectId(req.user);

        let query = {};
        if (callerRole === 'admin' && (req.query.all === 'true' || req.query.oversight === 'true')) {
            // Super Admin oversight view returns all conversations
            query = {};
        } else {
            // For all other roles and normal view, only where caller is a participant
            query = { participants: userId };
        }

        const conversations = await Conversation.find(query)
            .populate('participants', 'name id profile_image email')
            .populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'name id profile_image' }
            })
            .sort({ updatedAt: -1 });

        // Calculate unread count per conversation for caller in a single aggregated query
        const convIds = conversations.map(c => c._id);
        const unreadCounts = await Message.aggregate([
            {
                $match: {
                    conversationId: { $in: convIds },
                    sender: { $ne: userId },
                    status: { $in: ['sent', 'delivered'] }
                }
            },
            {
                $group: {
                    _id: '$conversationId',
                    count: { $sum: 1 }
                }
            }
        ]);
        const unreadMap = Object.fromEntries(unreadCounts.map(u => [u._id.toString(), u.count]));

        const result = conversations.map(c => {
            const obj = c.toObject ? c.toObject() : c;
            obj.unreadCount = unreadMap[c._id.toString()] || 0;
            return obj;
        });

        res.json({ success: true, conversations: result });
    } catch (err) {
        console.error('[getConversations]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Delete Conversation
exports.deleteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = await resolveEmployeeObjectId(req.user);

        const conversation = await Conversation.findById(id);
        if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

        // Check if user is a participant
        const isParticipant = (conversation.participants || []).some(p => p.toString() === userId?.toString());
        if (!isParticipant) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Delete all messages in the conversation
        await Message.deleteMany({ conversationId: id });
        
        // Delete the conversation itself
        await Conversation.findByIdAndDelete(id);

        res.json({ success: true, message: 'Conversation deleted' });
    } catch (err) {
        console.error('[deleteConversation]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Contact directory: active employees with id, name, department_name, profile_image
exports.getContactDirectory = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const employees = await Employee.find({ status: 'active' })
            .populate('department_id', 'name')
            .select('id name profile_image department_id')
            .sort({ name: 1 })
            .lean();

        const result = employees.map(e => ({
            _id: e._id,
            id: e.id,
            name: e.name,
            profile_image: e.profile_image || null,
            department_name: e.department_id?.name || 'General'
        }));

        res.json({ success: true, employees: result });
    } catch (err) {
        console.error('[getContactDirectory]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Super Admin: get all conversations with pagination and search
exports.getAdminConversations = async (req, res) => {
    try {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }
        const callerRole = normalizeRole(req.user?.role || '');
        if (callerRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can access chat oversight.' });
        }

        const { search, startDate, endDate, hasAttachments, page = 1, limit = 20 } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const conditions = [];

        if (search && search.trim()) {
            const term = search.trim();
            // Find matching employees by name, id or email
            const matchingEmps = await Employee.find({
                $or: [
                    { name: { $regex: term, $options: 'i' } },
                    { id: { $regex: term, $options: 'i' } },
                    { email: { $regex: term, $options: 'i' } }
                ]
            }).select('_id');
            const empIds = matchingEmps.map(e => e._id);

            conditions.push({
                $or: [
                    { participants: { $in: empIds } },
                    { groupName: { $regex: term, $options: 'i' } }
                ]
            });
        }

        if (startDate || endDate) {
            const dateFilter = {};
            if (startDate) dateFilter.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateFilter.$lte = end;
            }
            conditions.push({ updatedAt: dateFilter });
        }

        if (hasAttachments === 'true' || hasAttachments === true) {
            const convsWithFiles = await Message.distinct('conversationId', {
                fileUrl: { $exists: true, $ne: null, $nin: ['', null] }
            });
            conditions.push({ _id: { $in: convsWithFiles } });
        }

        const query = conditions.length === 0 ? {} : (conditions.length === 1 ? conditions[0] : { $and: conditions });

        const [total, conversations] = await Promise.all([
            Conversation.countDocuments(query),
            Conversation.find(query)
                .populate('participants', 'name id email designation profile_image role department_id')
                .populate({
                    path: 'lastMessage',
                    populate: { path: 'sender', select: 'name id profile_image' }
                })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
        ]);

        const convIds = conversations.map(c => c._id);
        const convsWithAttachments = await Message.distinct('conversationId', {
            conversationId: { $in: convIds },
            fileUrl: { $exists: true, $ne: null, $nin: ['', null] }
        });
        const attachmentSet = new Set(convsWithAttachments.map(id => id.toString()));

        // Also fetch total messages per conversation for overview
        const msgCounts = await Message.aggregate([
            { $match: { conversationId: { $in: convIds } } },
            { $group: { _id: '$conversationId', count: { $sum: 1 } } }
        ]);
        const msgCountMap = Object.fromEntries(msgCounts.map(m => [m._id.toString(), m.count]));

        const result = conversations.map(c => {
            const obj = c.toObject ? c.toObject() : c;
            obj.hasAttachment = attachmentSet.has(c._id.toString());
            obj.messageCount = msgCountMap[c._id.toString()] || 0;
            return obj;
        });

        res.json({
            success: true,
            conversations: result,
            pagination: {
                total,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / parsedLimit) || 1,
                hasMore: skip + conversations.length < total
            }
        });
    } catch (err) {
        console.error('[getAdminConversations]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Super Admin: get messages for a conversation with audit logging
exports.getAdminConversationMessages = async (req, res) => {
    try {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }
        const callerRole = normalizeRole(req.user?.role || '');
        if (callerRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can access chat oversight.' });
        }

        const { id } = req.params;
        const conversation = await Conversation.findById(id)
            .populate('participants', 'name id email designation profile_image role department_id');
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        // AuditLog entry on every admin view of oversight transcript
        const adminUserId = await resolveEmployeeObjectId(req.user);
        if (adminUserId) {
            try {
                await AuditLog.create({
                    user_id: adminUserId,
                    action: 'CHAT_OVERSIGHT_VIEW',
                    resource: 'conversation',
                    resource_id: conversation._id,
                    new_value: {
                        viewedAt: new Date(),
                        participantCount: conversation.participants?.length,
                        participantIds: conversation.participants?.map(p => p.id || p._id)
                    },
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            } catch (auditErr) {
                console.error('[getAdminConversationMessages] AuditLog creation failed:', auditErr.message);
            }
        }

        const limit = parseInt(req.query.limit || '200', 10);
        const query = { conversationId: conversation._id };
        if (req.query.since) {
            query.createdAt = { $gt: new Date(req.query.since) };
        }

        const [messages, totalMessages, mediaFiles] = await Promise.all([
            Message.find(query)
                .populate('sender', 'name id profile_image email')
                .sort({ createdAt: 1 })
                .limit(limit),
            Message.countDocuments({ conversationId: conversation._id }),
            Message.find({
                conversationId: conversation._id,
                fileUrl: { $exists: true, $ne: null, $nin: ['', null] }
            })
            .select('fileUrl fileName fileSize fileType mimeType createdAt sender')
            .populate('sender', 'name id')
            .sort({ createdAt: -1 })
        ]);

        res.json({
            success: true,
            conversation,
            messages,
            mediaFiles,
            totalMessages
        });
    } catch (err) {
        console.error('[getAdminConversationMessages]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
