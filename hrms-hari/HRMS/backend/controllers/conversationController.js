const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const { normalizeRole } = require('../utils/visibilityHelper');
const { isSuperAdminUser } = require('../utils/authHelper');

// Helper to resolve MongoDB ObjectId for user (always returns a BSON ObjectId instance)
const resolveEmployeeObjectId = async (userOrId) => {
    if (!userOrId) return null;
    if (userOrId instanceof mongoose.Types.ObjectId) return userOrId;
    if (userOrId._id) {
        if (userOrId._id instanceof mongoose.Types.ObjectId) return userOrId._id;
        if (typeof userOrId._id === 'string' && mongoose.Types.ObjectId.isValid(userOrId._id)) {
            return new mongoose.Types.ObjectId(userOrId._id);
        }
    }
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

        // Check for existing 1-on-1 (match ObjectId or legacy string representation)
        const senderMatches = [senderId, senderId.toString(), req.user?.id, req.user?.employee_id].filter(Boolean);
        const targetMatches = [targetId, targetId.toString(), recipientId].filter(Boolean);

        let conversation = await Conversation.findOne({
            isGroup: false,
            $and: [
                { participants: { $in: senderMatches } },
                { participants: { $in: targetMatches } },
                { participants: { $size: 2 } }
            ]
        }).populate('participants', 'name id profile_image email');

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, targetId],
                isGroup: false
            });
            conversation = await conversation.populate('participants', 'name id profile_image email');
            return res.status(201).json({ success: true, conversation });
        }

        await hydrateConversationParticipants([conversation]);
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

        let conversation = await Conversation.create({
            participants: allParticipants,
            isGroup: true,
            groupName,
            groupAdmin: adminId
        });
        conversation = await conversation.populate('participants', 'name id profile_image email');

        res.json({ success: true, conversation });
    } catch (err) {
        console.error('[createGroup]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get User's Conversations
exports.getConversations = async (req, res) => {
    try {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }
        const callerRole = normalizeRole(req.user?.role || '');
        const userId = await resolveEmployeeObjectId(req.user);
        const userObjIdStr = userId ? userId.toString() : null;
        const userCode = req.user?.id || req.user?.employee_id;

        let query = {};
        if (callerRole === 'admin' && (req.query.all === 'true' || req.query.oversight === 'true')) {
            // Super Admin oversight view returns all conversations
            query = {};
        } else {
            // For all other roles and normal view, match where caller is a participant
            // (handles both ObjectIds and legacy string IDs)
            const participantMatches = [];
            if (userId) {
                participantMatches.push(userId);
                participantMatches.push(userId.toString());
            }
            if (userObjIdStr && mongoose.Types.ObjectId.isValid(userObjIdStr)) {
                participantMatches.push(new mongoose.Types.ObjectId(userObjIdStr));
                participantMatches.push(userObjIdStr);
            }
            if (userCode) {
                participantMatches.push(userCode);
                participantMatches.push(userCode.toUpperCase());
                participantMatches.push(userCode.toLowerCase());
            }
            query = { participants: { $in: Array.from(new Set(participantMatches.filter(Boolean))) } };
        }

        const conversations = await Conversation.find(query)
            .populate('participants', 'name id profile_image email')
            .populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'name id profile_image' }
            })
            .sort({ updatedAt: -1 });

        // Hydrate any string participants safely without CastErrors
        await hydrateConversationParticipants(conversations);

        // Calculate unread count per conversation for caller in a single aggregated query
        const convIds = conversations.map(c => c._id);
        const unreadCounts = await Message.aggregate([
            {
                $match: {
                    conversationId: { $in: convIds },
                    sender: { $ne: userId },
                    $or: [
                        { status: { $in: ['sent', 'delivered'] } },
                        { 'seenBy.employee': { $ne: userId } }
                    ]
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

        // Check if user is a participant (matches ObjectId or string employee code)
        const isParticipant = (conversation.participants || []).some(p => {
            const pid = (p?._id || p).toString();
            return (userId && pid === userId.toString()) || (req.user?.id && pid === req.user.id);
        });
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

// Helper to hydrate/resolve participants regardless of whether stored as ObjectIds or String IDs
const hydrateConversationParticipants = async (conversations) => {
    if (!conversations || conversations.length === 0) return conversations;
    const isArray = Array.isArray(conversations);
    const convList = isArray ? conversations : [conversations];

    const neededObjectIds = new Set();
    const neededStringIds = new Set();

    for (const c of convList) {
        for (const p of (c.participants || [])) {
            if (!p) continue;
            if (typeof p === 'object' && p.name && (p.id || p._id)) continue;
            const pStr = p._id ? p._id.toString() : p.toString();
            if (mongoose.Types.ObjectId.isValid(pStr)) {
                neededObjectIds.add(new mongoose.Types.ObjectId(pStr));
            } else {
                neededStringIds.add(pStr);
            }
        }
    }

    const orClauses = [];
    if (neededObjectIds.size > 0) orClauses.push({ _id: { $in: Array.from(neededObjectIds) } });
    if (neededStringIds.size > 0) {
        orClauses.push({ id: { $in: Array.from(neededStringIds) } });
    }

    let foundEmps = [];
    if (orClauses.length > 0) {
        foundEmps = await Employee.find({ $or: orClauses })
            .select('name id employee_id email designation profile_image role department_id')
            .lean();
    }

    const byOid = new Map(foundEmps.map(e => [e._id.toString(), e]));
    const byStr = new Map(foundEmps.filter(e => e.id).map(e => [e.id.toUpperCase(), e]));
    const byEmpId = new Map(foundEmps.filter(e => e.employee_id).map(e => [e.employee_id.toUpperCase(), e]));

    for (const c of convList) {
        const raw = c.toObject ? c.toObject() : c;
        c.participants = (raw.participants || []).map(p => {
            if (p && typeof p === 'object' && p.name && (p.id || p._id)) return p;
            const pStr = (p?._id || p || '').toString();
            const matched = byOid.get(pStr) || byStr.get(pStr.toUpperCase()) || byEmpId.get(pStr.toUpperCase());
            if (matched) return matched;
            return typeof p === 'object' ? p : { _id: pStr, id: pStr, name: pStr, email: '' };
        });
    }

    return isArray ? convList : convList[0];
};

// Super Admin: get all conversations with pagination and search
exports.getAdminConversations = async (req, res) => {
    try {
        if (typeof res.setHeader === 'function') {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        }
        if (!isSuperAdminUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can access chat oversight.' });
        }

        const { search, startDate, endDate, hasAttachments, page = 1, limit = 20 } = req.query;
        const parsedPage = Math.max(1, parseInt(page, 10) || 1);
        const parsedLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const conditions = [];

        if (search && search.trim()) {
            const rawTerm = search.trim();
            const escapedTerm = rawTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const termRegex = new RegExp(escapedTerm, 'i');

            // Find matching employees by id, employee_id, name, or email
            const employeeOrConditions = [
                { id: termRegex },
                { employee_id: termRegex },
                { name: termRegex },
                { email: termRegex }
            ];
            if (mongoose.Types.ObjectId.isValid(rawTerm)) {
                employeeOrConditions.push({ _id: new mongoose.Types.ObjectId(rawTerm) });
            }

            const matchingEmps = await Employee.find({
                $or: employeeOrConditions
            }).select('_id id employee_id name email').lean();

            const empObjectIds = [];
            const empStringIds = new Set();

            for (const emp of matchingEmps) {
                if (emp._id) {
                    empObjectIds.push(emp._id);
                    empStringIds.add(emp._id.toString());
                }
                if (emp.id) {
                    empStringIds.add(emp.id);
                    empStringIds.add(emp.id.toUpperCase());
                }
                if (emp.employee_id) {
                    empStringIds.add(emp.employee_id);
                    empStringIds.add(emp.employee_id.toUpperCase());
                }
            }

            // Always add rawTerm directly in case participant is stored as raw string or code
            empStringIds.add(rawTerm);
            empStringIds.add(rawTerm.toUpperCase());

            const participantFilters = [];
            if (empObjectIds.length > 0) {
                participantFilters.push({ participants: { $in: empObjectIds } });
            }
            if (empStringIds.size > 0) {
                participantFilters.push({ participants: { $in: Array.from(empStringIds) } });
            }
            participantFilters.push({ participants: termRegex });
            participantFilters.push({ groupName: termRegex });

            conditions.push({ $or: participantFilters });
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
                .populate({
                    path: 'lastMessage',
                    populate: { path: 'sender', select: 'name id profile_image' }
                })
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(parsedLimit)
        ]);

        // Hydrate all participants safely without Mongoose CastError on string IDs
        await hydrateConversationParticipants(conversations);

        const convIds = conversations.map(c => c._id);
        const convsWithAttachments = await Message.distinct('conversationId', {
            conversationId: { $in: convIds },
            fileUrl: { $exists: true, $ne: null, $nin: ['', null] }
        });
        const attachmentSet = new Set(convsWithAttachments.map(id => id.toString()));

        // Fetch total messages per conversation for overview
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
        if (!isSuperAdminUser(req.user)) {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can access chat oversight.' });
        }

        const { id } = req.params;
        const conversation = await Conversation.findById(id);
        if (!conversation) {
            return res.status(404).json({ success: false, message: 'Conversation not found' });
        }

        // Hydrate participants safely (handles ObjectIds and String IDs)
        await hydrateConversationParticipants([conversation]);

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

exports.hydrateConversationParticipants = hydrateConversationParticipants;
