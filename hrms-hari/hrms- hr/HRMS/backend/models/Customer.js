const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    gstin: { type: String },
    opening_balance: { type: Number, default: 0 },
    current_balance: { type: Number, default: 0 }, // Positive = Receivable
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Customer', customerSchema);
