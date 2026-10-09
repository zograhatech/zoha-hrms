const mongoose = require('mongoose');

const verificationRequestSchema = new mongoose.Schema({
    employee_id: { type: String, ref: 'Employee', required: true }, // The string ID (e.g., "EMP001")
    requestor_name: { type: String, required: true },
    requestor_email: { type: String, required: true },
    requestor_company: { type: String, required: true },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    expires_at: { type: Date, default: () => new Date(+new Date() + 7*24*60*60*1000) }, // 7 days expiry
    approved_at: { type: Date },
    rejected_at: { type: Date },
}, { timestamps: true });

module.exports = mongoose.models.VerificationRequest || mongoose.model('VerificationRequest', verificationRequestSchema);
