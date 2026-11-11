const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Multer setup for memory storage - allows all file types with configurable max size
const storage = multer.memoryStorage();
const MAX_UPLOAD_BYTES = parseInt(process.env.MAX_UPLOAD_BYTES || '104857600', 10); // 100 MB default

const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES }
});

const handleChatUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ 
                    success: false, 
                    message: `File exceeds maximum allowed size (${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB).` 
                });
            }
            return res.status(400).json({ success: false, message: err.message || 'File upload error.' });
        }
        next();
    });
};

router.use(auth());

// Direct-to-storage signed upload endpoint
router.post('/upload-signature', messageController.getUploadSignature);

// Global unread count across all user's chats (for floating chat badge)
router.get('/unread-count', messageController.getUnreadCount);

// Status update endpoints
router.post('/delivered', messageController.markDelivered);
router.post('/seen', messageController.markSeen);

// Conversation specific endpoints
router.get('/:conversationId', messageController.getMessages);
router.get('/:conversationId/export', messageController.exportConversation);
router.post('/', handleChatUpload, messageController.sendMessage);

module.exports = router;
