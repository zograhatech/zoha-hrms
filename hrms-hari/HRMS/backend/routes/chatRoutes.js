const express = require('express');
const router = express.Router();
const { processMessage } = require('../services/copilotEngine');
const auth = require('../middleware/auth');

// POST /api/chat
router.post('/', auth(), async (req, res) => {
    try {
        const { message, sessionId } = req.body;
        if (!message || !sessionId) {
            return res.status(400).json({ success: false, message: 'message and sessionId are required.' });
        }
        // Pass req.user to the engine
        const response = await processMessage(message, sessionId, req.user);
        res.json({ success: true, ...response });
    } catch (err) {
        console.error('Chat route error:', err);
        res.status(500).json({
            success: false,
            message: 'Sorry, I\'m unable to process that right now. Please try again.',
            intent: 'ERROR'
        });
    }
});

module.exports = router;
