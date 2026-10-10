const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    date: { type: Date, required: true },
    content: { type: String, required: true },
}, { timestamps: true });

// Ensure one note per employee per day
noteSchema.index({ employee_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.models.Note || mongoose.model('Note', noteSchema);
