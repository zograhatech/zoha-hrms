const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const webpush = require('web-push');

// @route   GET /api/notifications
// @desc    Get all notifications for logged in user
router.get('/', auth(), async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(20);
        res.json({ success: true, notifications });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// @route   PATCH /api/notifications/:id/read
// @desc    Mark notification as read
router.patch('/:id/read', auth(), async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id },
            { is_read: true },
            { new: true }
        );
        res.json({ success: true, notification });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// @route   DELETE /api/notifications/clear
// @desc    Clear all notifications
router.delete('/clear', auth(), async (req, res) => {
    try {
        await Notification.deleteMany({ recipient: req.user._id });
        res.json({ success: true, message: 'Notifications cleared' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// @route   GET /api/notifications/vapid-key
// @desc    Get public VAPID key
router.get('/vapid-key', auth(), (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        console.error('CRITICAL: VAPID_PUBLIC_KEY is missing from environment variables.');
        return res.status(500).json({ 
            success: false, 
            message: 'VAPID keys not configured on server. Push notifications disabled.',
            tip: 'Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to Vercel environment variables.'
        });
    }
    res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

// @route   POST /api/notifications/subscribe
// @desc    Save push subscription for user
router.post('/subscribe', auth(), async (req, res) => {
    try {
        const sub = req.body;
        if (
            !sub || typeof sub !== 'object' ||
            typeof sub.endpoint !== 'string' ||
            !sub.endpoint.startsWith('https://') ||
            sub.endpoint.length > 2048 ||
            !sub.keys || typeof sub.keys !== 'object' ||
            typeof sub.keys.p256dh !== 'string' ||
            sub.keys.p256dh.trim() === '' ||
            sub.keys.p256dh.length > 256 ||
            typeof sub.keys.auth !== 'string' ||
            sub.keys.auth.trim() === '' ||
            sub.keys.auth.length > 256
        ) {
            return res.status(400).json({ success: false, message: 'Invalid push subscription.' });
        }

        const cleanSubscription = {
            endpoint: sub.endpoint,
            keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth
            }
        };

        // Save subscription to the employee record
        await Employee.findOneAndUpdate(
            { id: req.user.id },
            { $set: { push_subscription: cleanSubscription } }
        );

        res.status(201).json({ success: true, message: 'Subscription saved' });
    } catch (err) {
        console.error('Subscription error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
