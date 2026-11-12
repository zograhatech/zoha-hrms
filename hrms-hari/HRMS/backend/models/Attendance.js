const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    date: { type: Date, required: true },
    status: { type: String, enum: ['present', 'absent', 'late', 'half-day', 'holiday'], default: 'absent' },
    check_in: { type: Date },
    check_out: { type: Date },
    work_hours: { type: Number, default: 0 },
    is_open_session: { type: Boolean, default: false },
    needs_review: { type: Boolean, default: false },
    auto_clock_out: { type: Boolean, default: false },
    source: { type: String, enum: ['manual', 'auto-idle', 'companion', 'system', 'web'], default: 'manual' },
    last_activity_at: { type: Date },
    devices: [{
        device_id: { type: String },
        hostname: { type: String },
        source: { type: String, default: 'companion' },
        last_activity_at: { type: Date },
        idle_seconds: { type: Number, default: 0 },
        in_meeting: { type: Boolean, default: false },
        media_active: { type: Boolean, default: false }
    }],
    closed_by_device_id: { type: String },
    closed_by_hostname: { type: String },
    closed_reason: { type: String },
}, { timestamps: true });

attendanceSchema.index({ employee_id: 1, date: 1 });
attendanceSchema.index({ date: 1 });
attendanceSchema.index({ status: 1 });
attendanceSchema.index({ is_open_session: 1, last_activity_at: 1 });
attendanceSchema.index({ status: 1, check_out: 1, last_activity_at: 1 });

module.exports = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);
