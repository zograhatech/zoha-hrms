const express = require('express');
const router = express.Router();
const zoomController = require('./zoom.controller');
const zoomWebhook = require('./zoom.webhook');
const auth = require('../../middleware/auth');
const { isZoomConfigured } = require('./zoom.crypto');

// Guard: if ZOOM_ENCRYPTION_KEY is missing or invalid, return 503
router.use((req, res, next) => {
    if (!isZoomConfigured()) {
        return res.status(503).json({
            success: false,
            code: 'ZOOM_SERVICE_UNCONFIGURED',
            message: 'Zoom service is currently unavailable. ZOOM_ENCRYPTION_KEY is missing or invalid (must be 32 characters).'
        });
    }
    next();
});

// Root endpoint check
router.all('/', (req, res) => {
    res.json({ success: true, message: 'Zoom integration API is active.' });
});

// --- Configuration ---
router.get('/config', auth(['hr', 'manager', 'admin']), zoomController.getConfig);
router.post('/config', auth(['hr', 'manager', 'admin']), zoomController.saveConfig);

// --- Meetings ---
// Only roles with 'manage_zoom' permission can manage meetings
router.post('/meetings', auth(['manage_zoom']), zoomController.createMeeting);
router.get('/meetings', auth(), zoomController.getMeetings);
router.patch('/meetings/:id/end', auth(['manage_zoom']), zoomController.endMeeting);
router.delete('/meetings/:id', auth(['manage_zoom']), zoomController.deleteMeeting);

// Shortcut for instant team meeting
router.post('/instant', auth(['manage_zoom']), zoomController.createInstantMeeting);

// --- Webhooks (Public Route, validated via Zoom Signature internally) ---
router.post('/webhook', zoomWebhook.handleWebhook);

module.exports = router;
