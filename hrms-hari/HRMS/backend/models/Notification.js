const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    recipient: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        default: null // Make optional for system notifications
    },
    type: {
        type: String,
        enum: ['meeting', 'leave', 'announcement', 'ticket', 'general', 'resignation', 'holiday'],
        default: 'general'
    },
    title: {
        type: String,
        required: true
    },
    message: {
        type: String,
        required: true
    },
    data: {
        meetingId: { type: String },
        link: { type: String },
        status: { type: String },
        leaveId: { type: String }
    },
    is_read: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Post save hook for single notification create
notificationSchema.post('save', async function (doc) {
    if (!doc || !doc.recipient) return;
    try {
        const { sendPushToEmployee } = require('../utils/pushService');
        await sendPushToEmployee(doc.recipient, {
            title: doc.title,
            body: doc.message,
            url: doc.data?.link || '/'
        });
    } catch (e) {
        console.error('[Notification post-save push error]', e?.message);
    }
});

// Post insertMany hook for batch notifications
notificationSchema.post('insertMany', async function (docs) {
    if (!Array.isArray(docs)) return;
    try {
        const { sendPushToEmployee } = require('../utils/pushService');
        await Promise.all(
            docs.map(async doc => {
                if (doc && doc.recipient) {
                    try {
                        await sendPushToEmployee(doc.recipient, {
                            title: doc.title,
                            body: doc.message,
                            url: doc.data?.link || '/'
                        });
                    } catch (pushErr) {
                        console.error('[Notification post-insertMany push error for recipient]', pushErr?.message);
                    }
                }
            })
        );
    } catch (e) {
        console.error('[Notification post-insertMany push error]', e?.message);
    }
});

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
