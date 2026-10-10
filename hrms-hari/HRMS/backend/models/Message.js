const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    conversationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Conversation',
        required: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
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
    isRead: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee'
    }]
}, { timestamps: true });

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
