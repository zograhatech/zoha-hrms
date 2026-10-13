const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Employee = require('../models/Employee');
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

        res.json({ success: true, conversations });
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
        const employees = await Employee.find({ status: 'active' })
            .populate('department_id', 'name')
            .select('id name profile_image department_id')
            .sort({ name: 1 })
            .lean();

        const result = employees.map(e => ({
            _id: e._id,
            id: e.id,
            name: e.name,
            department_name: e.department_id?.name || '—',
            profile_image: e.profile_image || null
        }));

        res.json({ success: true, employees: result });
    } catch (err) {
        console.error('[getContactDirectory]', err);
        res.status(500).json({ success: false, message: err.message });
    }
};
