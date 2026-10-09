const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    leave_type: { type: String, enum: ['casual', 'sick', 'earned', 'maternity', 'paternity', 'unpaid'], required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    total_days: { type: Number, required: true },
    reason: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    approved_by: { type: String, ref: 'Employee', default: null },
    approved_date: { type: Date },
    rejection_reason: { type: String },
}, { timestamps: true });

leaveSchema.index({ employee_id: 1, status: 1 });
leaveSchema.index({ start_date: 1, end_date: 1 });

module.exports = mongoose.models.Leave || mongoose.model('Leave', leaveSchema);
