const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
    ticket_number: { type: String, unique: true },
    employee_id: { type: String, required: true, ref: 'Employee' },
    subject: { type: String, required: true },
    description: { type: String },
    category: { type: String, enum: ['general', 'payroll', 'leave', 'attendance', 'it', 'hr'], default: 'general' },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    status: { type: String, enum: ['open', 'in-progress', 'resolved', 'closed'], default: 'open' },
    assigned_to: { type: String, ref: 'Employee', default: null },
}, { timestamps: true });

ticketSchema.pre('save', function (next) {
    if (!this.ticket_number) {
        const year = new Date().getFullYear();
        const rand = Math.floor(Math.random() * 9000) + 1000;
        this.ticket_number = `TKT-${year}-${rand}`;
    }
    next();
});

module.exports = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
