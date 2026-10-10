const mongoose = require('mongoose');

const resignationSchema = new mongoose.Schema({
    employee: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    notice_start_date: {
        type: Date,
        required: true
    },
    last_working_day: {
        type: Date,
        required: true
    },
    reason: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'revoke', 'revoke_requested'],
        default: 'pending'
    },
    revoke_reason: {
        type: String,
        default: ''
    },
    hr_comments: {
        type: String,
        default: ''
    },
    documents: [
        {
            name: String,
            data: Buffer,
            contentType: String,
            uploadedAt: { type: Date, default: Date.now }
        }
    ],
    history: [
        {
            status: String,
            comment: String,
            updated_at: { type: Date, default: Date.now },
            updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.models.Resignation || mongoose.model('Resignation', resignationSchema);
