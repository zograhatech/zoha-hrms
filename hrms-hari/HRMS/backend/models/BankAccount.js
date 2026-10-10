const mongoose = require('mongoose');

const bankAccountSchema = new mongoose.Schema({
    account_name: { type: String, required: true },
    bank_name: { type: String, required: true },
    account_number: { type: String, required: true, unique: true },
    ifsc_code: { type: String },
    branch: { type: String },
    account_type: { type: String, enum: ['Current', 'Savings', 'OD', 'Cash'], default: 'Current' },
    opening_balance: { type: Number, default: 0 },
    current_balance: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BankAccount', bankAccountSchema);
