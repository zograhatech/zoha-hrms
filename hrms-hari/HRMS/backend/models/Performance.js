const mongoose = require('mongoose');

const performanceSchema = new mongoose.Schema({
    employee_id: { type: String, required: true }, // reference to Employee ID
    goal: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'On Hold'], default: 'Not Started' },
    due_date: { type: Date },
    review_date: { type: Date },
    feedback: { type: String },
    rating: { type: Number, min: 1, max: 5 },
    manager_id: { type: String }
}, { timestamps: true });

module.exports = mongoose.models.Performance || mongoose.model('Performance', performanceSchema);
