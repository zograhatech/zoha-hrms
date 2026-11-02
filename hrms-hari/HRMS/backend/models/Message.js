const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true,
        index: true
    },
    clientMessageId: {
        type: String,
        index: true,
        sparse: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true,
        index: true
    },
    text: {
        type: String,
        trim: true
    },
    fileUrl: {
        type: String
    },
    fileName: {
        type: String
    },
    fileSize: {
        type: Number
    },
    fileType: {
        type: String,
        enum: ['image', 'video', 'audio', 'file', null],
        default: null
    },
    mimeType: {
        type: String
    },
    status: {
        type: String,
        enum: ['sending', 'sent', 'delivered', 'seen'],
        default: 'sent',
        index: true
    },
    deliveredAt: {
        type: Date
    },
    seenAt: {
        type: Date
    },
    deliveredTo: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }],
    seenBy: [{
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Employee'
        },
        seenAt: {
            type: Date,
            default: Date.now
        }
    }],
    isRead: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }]
}, { timestamps: true });

messageSchema.index({ conversationId: 1, createdAt: 1 });
messageSchema.index({ conversationId: 1, status: 1 });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
