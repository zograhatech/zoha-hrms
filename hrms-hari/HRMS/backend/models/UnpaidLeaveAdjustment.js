const mongoose = require('mongoose');

const unpaidLeaveAdjustmentSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee', index: true },
    leave_id: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Leave' },
    source_month: { type: Number, required: true },
    source_year: { type: Number, required: true },
    amount: { type: Number, required: true },
    status: { type: String, enum: ['pending', 'applied'], default: 'pending', index: true },
    applied_payroll_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Payroll', default: null },
    applied_at: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.models.UnpaidLeaveAdjustment || mongoose.model('UnpaidLeaveAdjustment', unpaidLeaveAdjustmentSchema);

