const mongoose = require('mongoose');

const remoteAccessSchema = new mongoose.Schema({
    employee_id: {
        type: String,
        required: true,
        trim: true,
        index: true
    },
    grantedBy: {
        type: String,
        required: true,
        trim: true
    },
    expiresAt: {
        type: Date,
        default: null
    },
    allowedIp: {
        type: String,
        default: null,
        trim: true
    },
    active: {
        type: Boolean,
        default: true,
        index: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RemoteAccess', remoteAccessSchema);

