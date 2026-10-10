const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

// Create or get existing 1-on-1 conversation
exports.createConversation = async (req, res) => {
    try {
        const { recipientId } = req.body;
        const senderId = req.user._id;

        if (!recipientId) return res.status(400).json({ success: false, message: 'Recipient ID is required' });

        // Check for existing 1-on-1
        let conversation = await Conversation.findOne({
            isGroup: false,
            participants: { $all: [senderId, recipientId], $size: 2 }
        }).populate('participants', 'name id profile_image email');

        if (!conversation) {
            conversation = await Conversation.create({
                participants: [senderId, recipientId],
                isGroup: false
            });
            conversation = await conversation.populate('participants', 'name id profile_image email');
        }

        res.json({ success: true, conversation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Create Group Conversation
exports.createGroup = async (req, res) => {
    try {
        const { groupName, participants } = req.body;
        const adminId = req.user._id;

        const allParticipants = [...new Set([...participants, adminId])];

        const conversation = await Conversation.create({
            participants: allParticipants,
            isGroup: true,
            groupName,
            groupAdmin: adminId
        });

        res.json({ success: true, conversation });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Get User's Conversations
exports.getConversations = async (req, res) => {
    try {
        const userId = req.user._id;
        const conversations = await Conversation.find({
            participants: userId
        })
            .populate('participants', 'name id profile_image email')
            .populate({
                path: 'lastMessage',
                populate: { path: 'sender', select: 'name id profile_image' }
            })
            .sort({ updatedAt: -1 });

        res.json({ success: true, conversations });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};
// Delete Conversation
exports.deleteConversation = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const conversation = await Conversation.findById(id);
        if (!conversation) return res.status(404).json({ success: false, message: 'Conversation not found' });

        // Check if user is a participant
        if (!conversation.participants.includes(userId)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Delete all messages in the conversation
        await Message.deleteMany({ conversationId: id });
        
        // Delete the conversation itself
        await Conversation.findByIdAndDelete(id);

        res.json({ success: true, message: 'Conversation deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};
