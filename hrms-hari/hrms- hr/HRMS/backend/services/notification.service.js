const Notification = require('../models/Notification');
const { getIO } = require('../socket');
const { sendPushNotification } = require('./push.service');

/**
 * Send a notification to a specific user
 * @param {Object} params - Notification parameters
 * @param {string} params.recipient - User ID of the recipient
 * @param {string} params.title - Notification title
 * @param {string} params.message - Notification message
 * @param {string} params.type - Notification type (e.g., 'meeting', 'info', 'alert')
 * @param {Object} params.data - Optional metadata (e.g., { link: '/zoom' })
 */
const sendNotification = async ({ recipient, title, message, type = 'info', data = {} }) => {
    try {
        // 1. Resolve Recipient ObjectId if custom ID is passed
        let recipientId = recipient;
        const Employee = require('../models/Employee');
        
        // If recipient is a string and looks like a custom ID, find the ObjectId
        if (typeof recipient === 'string' && !recipient.match(/^[0-9a-fA-F]{24}$/)) {
            const emp = await Employee.findOne({ id: recipient });
            if (emp) recipientId = emp._id;
        }

        // 2. Save to Database
        const notification = new Notification({
            recipient: recipientId,
            title,
            message,
            type,
            data,
            is_read: false
        });
        await notification.save();

        // 2. Emit via Socket.io for real-time delivery
        try {
            const io = getIO();
            io.to(recipient.toString()).emit('notification', {
                _id: notification._id,
                title,
                message,
                type,
                data,
                createdAt: notification.createdAt,
                is_read: false
            });
        } catch (socketError) {
            // Silently fail if socket is not available or user not connected
            console.error('Socket notification emit failed:', socketError.message);
        }

        // 3. Send Push Notification (Browser level)
        try {
            await sendPushNotification(recipientId, {
                title,
                body: message,
                icon: '/logo.png', // Replace with dynamic if needed
                data: {
                    url: data.link || '/',
                    ...data
                }
            });
        } catch (pushError) {
            console.error('Push notification failed:', pushError.message);
        }

        return notification;
    } catch (error) {
        console.error('Error in sendNotification service:', error);
        throw error;
    }
};

module.exports = {
    sendNotification
};
