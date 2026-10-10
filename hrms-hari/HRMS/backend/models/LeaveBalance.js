const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    year: { type: Number, required: true, default: () => new Date().getFullYear() },
    casual_leave: { type: Number, default: 12 },
    sick_leave: { type: Number, default: 12 },
    earned_leave: { type: Number, default: 15 },
    maternity_leave: { type: Number, default: 0 },
    paternity_leave: { type: Number, default: 0 },
}, { timestamps: true });

leaveBalanceSchema.index({ employee_id: 1, year: 1 }, { unique: true });

module.exports = mongoose.models.LeaveBalance || mongoose.model('LeaveBalance', leaveBalanceSchema);
