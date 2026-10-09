const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'half-day', 'holiday'], default: 'absent' },
    check_in: { type: Date },
    check_out: { type: Date },
    work_hours: { type: Number, default: 0 },
}, { timestamps: true });

attendanceSchema.index({ employee_id: 1, date: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
