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
        const Setting = require('../models/Setting');
        const settings = await Setting.findOne();
        if (settings && settings.enable_browser_push === false) {
            return res.status(403).json({ success: false, message: 'Browser push notifications are disabled by the administrator.' });
        }

        const emp = await Employee.findOne({ id: req.user.id }).select('+push_subscriptions +push_subscription');
        if (!emp || emp.status !== 'active') {
            return res.status(403).json({ success: false, message: 'Browser push is not available for your account.' });
        }

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
            },
            createdAt: new Date()
        };

        // Atomic push if endpoint does not already exist
        const pushResult = await Employee.updateOne(
            { id: req.user.id, "push_subscriptions.endpoint": { $ne: cleanSubscription.endpoint } },
            {
                $push: { push_subscriptions: cleanSubscription },
                $set: { push_subscription: cleanSubscription }
            }
        );

        // If endpoint already existed, refresh its keys and createdAt
        if (pushResult.matchedCount === 0) {
            await Employee.updateOne(
                { id: req.user.id, "push_subscriptions.endpoint": cleanSubscription.endpoint },
                {
                    $set: {
                        "push_subscriptions.$.keys": cleanSubscription.keys,
                        "push_subscriptions.$.createdAt": cleanSubscription.createdAt,
                        push_subscription: cleanSubscription
                    }
                }
            );
        }

        res.status(201).json({ success: true, message: 'Subscription saved' });
    } catch (err) {
        console.error('Subscription error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// @route   DELETE /api/notifications/subscribe
// @desc    Remove a push subscription endpoint for user
router.delete('/subscribe', auth(), async (req, res) => {
    try {
        const { endpoint } = req.body || {};
        if (!endpoint || typeof endpoint !== 'string') {
            return res.status(400).json({ success: false, message: 'Endpoint is required.' });
        }

        await Employee.updateOne(
            { id: req.user.id },
            { $pull: { push_subscriptions: { endpoint } } }
        );

        res.json({ success: true, message: 'Subscription removed.' });
    } catch (err) {
        console.error('Unsubscribe error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// @route   POST /api/notifications/test-push
// @desc    Admin diagnostic to test push to an employee's subscriptions
router.post('/test-push', auth(['admin']), async (req, res) => {
    try {
        const { employee_id } = req.body || {};
        if (!employee_id) {
            return res.status(400).json({ success: false, message: 'employee_id is required.' });
        }

        // 1. VAPID Pre-flight checks without printing secrets
        const vapidPublicKeySet = !!process.env.VAPID_PUBLIC_KEY;
        const vapidPrivateKeySet = !!process.env.VAPID_PRIVATE_KEY;
        const vapidEmail = process.env.VAPID_EMAIL || '';
        const vapidEmailValid = typeof vapidEmail === 'string' && vapidEmail.startsWith('mailto:');
        const vapidKeyMatches = vapidPublicKeySet && (process.env.VAPID_PUBLIC_KEY === process.env.VAPID_PUBLIC_KEY);

        const vapidChecks = {
            vapid_public_key_set: vapidPublicKeySet,
            vapid_private_key_set: vapidPrivateKeySet,
            vapid_email_starts_with_mailto: vapidEmailValid,
            vapid_public_key_matches_served: vapidKeyMatches
        };

        // 2. Fetch employee with push_subscriptions
        const mongoose = require('mongoose');
        const employee = await Employee.findOne({
            $or: [
                { id: employee_id },
                ...(mongoose.Types.ObjectId.isValid(employee_id) ? [{ _id: employee_id }] : [])
            ]
        }).select('+push_subscriptions +push_subscription');

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.', checks: vapidChecks });
        }

        // Subscriptions list
        let subscriptions = Array.isArray(employee.push_subscriptions) ? [...employee.push_subscriptions] : [];
        if (subscriptions.length === 0 && employee.push_subscription && employee.push_subscription.endpoint) {
            subscriptions.push({
                endpoint: employee.push_subscription.endpoint,
                keys: employee.push_subscription.keys
            });
        }

        if (subscriptions.length === 0) {
            return res.json({
                success: true,
                message: 'No push subscriptions found for employee.',
                checks: vapidChecks,
                results: []
            });
        }

        // Set VAPID details
        let email = process.env.VAPID_EMAIL || 'admin@example.com';
        if (!email.startsWith('mailto:') && !email.startsWith('https://')) {
            email = `mailto:${email}`;
        }
        if (vapidPublicKeySet && vapidPrivateKeySet) {
            try {
                webpush.setVapidDetails(email, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
            } catch (vapidErr) {
                return res.status(500).json({ success: false, message: 'Failed to configure VAPID details: ' + vapidErr.message, checks: vapidChecks });
            }
        }

        // Safe payload (strictly capped under 4KB)
        const payloadString = JSON.stringify({
            title: 'Test notification',
            body: 'If you see this, desktop alerts work.',
            data: { url: '/' }
        });

        const results = [];
        const expiredEndpoints = [];

        for (const sub of subscriptions) {
            let host = 'unknown-host';
            try {
                host = new URL(sub.endpoint).host;
            } catch (_) {}

            try {
                const sendRes = await webpush.sendNotification(
                    { endpoint: sub.endpoint, keys: sub.keys },
                    payloadString
                );
                results.push({
                    endpoint_host: host,
                    status: sendRes?.statusCode || 201,
                    error: null
                });
            } catch (err) {
                const statusCode = err.statusCode || err.status || 500;
                let errMsg = err.message || 'Push delivery failed';
                if (statusCode === 403) {
                    errMsg = 'VAPID rejected';
                } else if (statusCode === 404 || statusCode === 410) {
                    expiredEndpoints.push(sub.endpoint);
                    errMsg = 'Subscription expired';
                }

                results.push({
                    endpoint_host: host,
                    status: statusCode,
                    error: errMsg
                });
            }
        }

        // Remove expired endpoints (404/410)
        if (expiredEndpoints.length > 0) {
            await Employee.updateOne(
                { _id: employee._id },
                { $pull: { push_subscriptions: { endpoint: { $in: expiredEndpoints } } } }
            );
        }

        res.json({
            success: true,
            checks: vapidChecks,
            results
        });
    } catch (err) {
        console.error('[test-push] Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
