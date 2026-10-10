const mongoose = require('mongoose');

const shiftSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    start_time: { type: String, required: true, default: '09:00' }, // HH:mm format
    end_time: { type: String, required: true, default: '18:00' },   // HH:mm format
    grace_period: { type: Number, default: 15 }, // in minutes
    half_day_min_hours: { type: Number, default: 4 },
    full_day_min_hours: { type: Number, default: 8 },
    days: [{ type: String }], // e.g. ['Monday', 'Tuesday']
    is_active: { type: Boolean, default: true },
    is_default: { type: Boolean, default: false },
    allowed_clock_ins: { type: Number, default: 1 } // Limit on how many times an employee can clock in per day
}, { timestamps: true });

module.exports = mongoose.models.Shift || mongoose.model('Shift', shiftSchema);
