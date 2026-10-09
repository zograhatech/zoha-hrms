const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    type: { type: String, required: true, enum: ['Payment', 'Receipt', 'Journal', 'Contra'] },
    ref_no: { type: String },
    debit_ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledger', required: true },
    credit_ledger: { type: mongoose.Schema.Types.ObjectId, ref: 'Ledger', required: true },
    amount: { type: Number, required: true, min: 0.01 },
    narration: { type: String },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

module.exports = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);
