const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema({
    employee_id: {
        type: String,
        required: true,
        ref: 'Employee'
    },
    token_hash: {
        type: String,
        required: true,
        unique: true
    },
    device_name: {
        type: String,
        default: 'Windows PC'
    },
    created_by: {
        type: String,
        required: true
    },
    expires_at: {
        type: Date,
        default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    },
    revoked: {
        type: Boolean,
        default: false
    },
    last_used_at: {
        type: Date
    }
}, { timestamps: true });

deviceTokenSchema.index({ token_hash: 1 });
deviceTokenSchema.index({ employee_id: 1 });

module.exports = mongoose.models.DeviceToken || mongoose.model('DeviceToken', deviceTokenSchema);

