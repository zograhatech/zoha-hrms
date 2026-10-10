const webpush = require('web-push');
const Employee = require('../models/Employee');

// Initialize web-push with VAPID keys
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL || 'mailto:admin@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

/**
 * Send a push notification to a specific user
 * @param {String} userId - The unique ID of the employee
 * @param {Object} payload - The notification payload { title, body, icon, data, etc. }
 */
const sendPushNotification = async (userId, payload) => {
    try {
        // Find employee by either MongoDB _id or custom id
        const employee = await Employee.findOne({
            $or: [
                { _id: userId.match?.(/^[0-9a-fA-F]{24}$/) ? userId : null },
                { id: userId },
                { _id: typeof userId !== 'string' ? userId : null }
            ].filter(query => query && Object.values(query)[0] !== null)
        });
        if (!employee || !employee.push_subscription) {
            return { success: false, reason: 'No valid push subscription found' };
        }

        const notificationPayload = JSON.stringify(payload);
        
        await webpush.sendNotification(
            employee.push_subscription,
            notificationPayload
        );
        
        return { success: true };
    } catch (error) {
        console.error('[Push Service] Error sending push:', error);
        
        // If subscription is expired or invalid, remove it
        if (error.statusCode === 410 || error.statusCode === 404) {
            await Employee.updateOne({ id: userId }, { $set: { push_subscription: null } });
        }
        
        return { success: false, error };
    }
};

module.exports = {
    sendPushNotification
};
