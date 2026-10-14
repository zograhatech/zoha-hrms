const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema({
    date: { type: String, required: true, unique: true, trim: true }, // 'YYYY-MM-DD' IST day
    name: { type: String, required: true, trim: true },
    createdBy: { type: String, required: true, ref: 'Employee' },
}, { timestamps: true });

// Pre-validate hook to handle Date object inputs gracefully
holidaySchema.pre('validate', function(next) {
    if (this.date instanceof Date) {
        const { toISTDateString } = require('../utils/istDate');
        this.date = toISTDateString(this.date);
    }
    next();
});

holidaySchema.index({ date: 1 }, { unique: true });

module.exports = mongoose.models.Holiday || mongoose.model('Holiday', holidaySchema);

