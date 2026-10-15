const webpush = require('web-push');
const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Setting = require('../models/Setting');

const ensureVapidDetails = () => {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.error('[PushService] VAPID keys not configured in environment variables');
        return false;
    }
    let email = process.env.VAPID_EMAIL || 'admin@example.com';
    if (!email.startsWith('mailto:') && !email.startsWith('https://')) {
        email = `mailto:${email}`;
    }
    try {
        webpush.setVapidDetails(
            email,
            process.env.VAPID_PUBLIC_KEY,
            process.env.VAPID_PRIVATE_KEY
        );
        return true;
    } catch (vapidErr) {
        console.error('[PushService] webpush.setVapidDetails error:', vapidErr.message);
        return false;
    }
};

// Initialize web-push if keys are present
ensureVapidDetails();

/**
 * Sends web push notification to an employee across all their active device subscriptions.
 * Payload is strictly capped under 4KB (title, body, url only).
 * Handles expired/invalid endpoints (404/410) by removing them with $pull.
 * Never throws errors.
 *
 * @param {string|mongoose.Types.ObjectId} employeeId - _id or custom id of employee
 * @param {Object} payload - { title, body, url }
 */
const sendPushToEmployee = async (employeeId, payload = {}) => {
    try {
        if (!employeeId) {
            console.error('[PushService] Skipped: No employeeId provided');
            return { success: false, reason: 'No employeeId provided' };
        }

        const settings = await Setting.findOne();
        
        // Find employee and include hidden push_subscriptions and legacy push_subscription
        const employee = await Employee.findOne({
            $or: [
                { id: employeeId },
                ...(mongoose.Types.ObjectId.isValid(employeeId) ? [{ _id: employeeId }] : [])
            ]
        }).select('+push_subscriptions +push_subscription');

        if (!employee) {
            console.error(`[PushService] Skipped: Employee not found for identifier: ${employeeId}`);
            return { success: false, reason: 'Employee not found' };
        }

        // Check feature flag and employee status
        if (settings && settings.enable_browser_push === false) {
            console.log(`[PushService] Skipped: enable_browser_push is false for employee ${employee.id}`);
            return { success: false, reason: 'Browser push notifications are disabled by the administrator' };
        }
        if (employee.status !== 'active') {
            console.log(`[PushService] Skipped: Employee ${employee.id} status is not active (${employee.status})`);
            return { success: false, reason: 'Employee is not active' };
        }

        // Additive migration in code: wrap legacy push_subscription if push_subscriptions is empty
        let subscriptions = Array.isArray(employee.push_subscriptions) ? [...employee.push_subscriptions] : [];
        if (subscriptions.length === 0 && employee.push_subscription && employee.push_subscription.endpoint) {
            subscriptions.push({
                endpoint: employee.push_subscription.endpoint,
                keys: employee.push_subscription.keys,
                createdAt: employee.push_subscription.createdAt || new Date()
            });
        }

        if (subscriptions.length === 0) {
            console.log(`[PushService] Skipped: No push subscriptions found for employee ${employee.id}`);
            return { success: false, reason: 'No push subscriptions found' };
        }

        if (!ensureVapidDetails()) {
            console.error('[PushService] Cannot send: VAPID keys not configured on server');
            return { success: false, reason: 'VAPID keys not configured on server' };
        }

        // Build and cap payload to title, body, url (capped at 4KB)
        const safePayload = {
            title: String(payload.title || 'HRMS Notification').slice(0, 200),
            body: String(payload.body || payload.message || '').slice(0, 1000),
            data: {
                url: payload.url || payload.data?.link || payload.data?.url || '/'
            }
        };

        let payloadString = JSON.stringify(safePayload);
        if (Buffer.byteLength(payloadString, 'utf8') > 4096) {
            safePayload.body = safePayload.body.slice(0, 500);
            payloadString = JSON.stringify(safePayload);
        }

        const expiredEndpoints = [];

        await Promise.all(
            subscriptions.map(async (sub) => {
                try {
                    await webpush.sendNotification(
                        {
                            endpoint: sub.endpoint,
                            keys: sub.keys
                        },
                        payloadString
                    );
                } catch (pushErr) {
                    const statusCode = pushErr.statusCode || pushErr.status;
                    if (statusCode === 404 || statusCode === 410) {
                        expiredEndpoints.push(sub.endpoint);
                    } else {
                        console.error('[PushService] Non-fatal push delivery error:', pushErr.message);
                    }
                }
            })
        );

        // Remove expired endpoints from database
        if (expiredEndpoints.length > 0) {
            await Employee.updateOne(
                { _id: employee._id },
                { $pull: { push_subscriptions: { endpoint: { $in: expiredEndpoints } } } }
            );
        }

        return { success: true };
    } catch (err) {
        console.error('[PushService] Unexpected error sending push:', err.message);
        return { success: false, error: err.message };
    }
};

module.exports = {
    sendPushToEmployee
};

