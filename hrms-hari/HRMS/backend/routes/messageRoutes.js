const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Multer setup for memory storage with fileFilter and 10MB limit
const storage = multer.memoryStorage();

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.docx', '.xlsx'];
const ALLOWED_MIMES = [
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/pjpeg',
    'image/jpg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
];

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = (file.mimetype || '').toLowerCase();

    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMES.includes(mime)) {
        const err = new Error('File type not allowed.');
        err.code = 'INVALID_FILE_TYPE';
        return cb(err, false);
    }
    cb(null, true);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 10 * 1024 * 1024 }
});

const handleChatUpload = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, message: 'File must be 10 MB or smaller.' });
            }
            if (err.code === 'INVALID_FILE_TYPE' || err.message === 'File type not allowed.') {
                return res.status(400).json({ success: false, message: 'File type not allowed.' });
            }
            return res.status(400).json({ success: false, message: err.message || 'File upload error.' });
        }
        next();
    });
};

router.use(auth());

router.get('/:conversationId', messageController.getMessages);
router.get('/:conversationId/export', messageController.exportConversation);
router.post('/', handleChatUpload, messageController.sendMessage);

module.exports = router;
