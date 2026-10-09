const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { uploadFromBuffer } = require('../utils/cloudinary');

// Get messages for a conversation
exports.getMessages = async (req, res) => {
    try {
        const { conversationId } = req.params;
        const messages = await Message.find({ conversationId })
            .populate('sender', 'name id profile_image')
            .sort({ createdAt: 1 });

        res.json({ success: true, messages });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};

// Send message (API fallback if not using purely sockets, or for file uploads)
exports.sendMessage = async (req, res) => {
    try {
        const { conversationId, text } = req.body;
        const senderId = req.user._id;
        let fileUrl = null;
        let fileName = null;
        let fileSize = null;
        let calculatedFileType = null;

        if (req.file) {
            fileName = req.file.originalname;
            fileSize = req.file.size;

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
                console.log(`Cloudinary: Uploading ${fileName} (${req.file.mimetype}) as ${resourceType}...`);
                const result = await uploadFromBuffer(req.file.buffer, 'chat_attachments', resourceType);
                console.log('Cloudinary: Success!', result.secure_url);
                fileUrl = result.secure_url;
            } catch (uploadError) {
                console.error('Cloudinary: Upload Failed!', uploadError);
                return res.status(500).json({ success: false, message: 'File upload to cloud failed. Check configuration.', error: uploadError.message });
            }
        }

        const message = await Message.create({
            conversationId,
            sender: senderId,
            text,
            fileUrl,
            fileName,
            fileSize,
            fileType: calculatedFileType
        });

        // CRITICAL: Update conversation with last message link
        await Conversation.findByIdAndUpdate(conversationId, { 
            lastMessage: message._id,
            updatedAt: new Date() // Trigger re-sort
        });

        res.json({ success: true, message });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
};
