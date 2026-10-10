const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');

// Multer setup for memory storage (required for Vercel)
const storage = multer.memoryStorage();
const upload = multer({ storage });

router.use(auth());

router.get('/:conversationId', messageController.getMessages);
router.post('/', upload.single('file'), messageController.sendMessage);

module.exports = router;
