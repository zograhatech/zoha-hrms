const mongoose = require('mongoose');

const ledgerSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    group: { type: String, required: true, enum: ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'] },
    opening_balance: { type: Number, default: 0 },
    current_balance: { type: Number, default: 0 },
    description: { type: String },
    is_system_custom: { type: Boolean, default: false } // To protect core ledgers
}, { timestamps: true });

module.exports = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);
