const mongoose = require('mongoose');

const bankTransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', required: true },
    type: { type: String, enum: ['Deposit', 'Withdrawal', 'Transfer', 'Interest', 'Charges'], required: true },
    amount: { type: Number, required: true },
    ref_no: { type: String }, // Cheque #, UTR, etc.
    description: { type: String },
    to_account: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount' }, // For transfers
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
