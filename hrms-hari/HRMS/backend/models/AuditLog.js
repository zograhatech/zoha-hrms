const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    action: {
        type: String,
        enum: ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'],
        required: true
    },
    resource: {
        type: String,
        required: true
    },
    resource_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: false
    },
    old_value: {
        type: Object,
        default: null
    },
    new_value: {
        type: Object,
        default: null
    },
    ip_address: {
        type: String
    },
    user_agent: {
        type: String
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
