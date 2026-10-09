const express = require('express');
const router = express.Router();
const zoomController = require('./zoom.controller');
const zoomWebhook = require('./zoom.webhook');
const auth = require('../../middleware/auth');

// --- Configuration ---
router.get('/config', auth(['hr', 'manager', 'admin']), zoomController.getConfig);
router.post('/config', auth(['hr', 'manager', 'admin']), zoomController.saveConfig);

// --- OAuth (Using S2S internally now) ---

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
