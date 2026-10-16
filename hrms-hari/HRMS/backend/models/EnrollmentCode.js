const mongoose = require('mongoose');

const enrollmentCodeSchema = new mongoose.Schema({
    employee_id: {
        type: String,
        required: true,
        ref: 'Employee',
        index: true
    },
    code_hash: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    expires_at: {
        type: Date,
        required: true,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
    used_at: {
        type: Date,
        default: null
    },
    created_by: {
        type: String,
        required: true
    }
}, { timestamps: true });

module.exports = mongoose.models.EnrollmentCode || mongoose.model('EnrollmentCode', enrollmentCodeSchema);

