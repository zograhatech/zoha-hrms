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
        enum: ['meeting', 'leave', 'announcement', 'ticket', 'general', 'resignation'],
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
        status: { type: String }
    },
    is_read: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
