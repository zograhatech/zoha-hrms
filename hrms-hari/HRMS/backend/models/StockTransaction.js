const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
    date: { type: Date, default: Date.now },
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    type: { type: String, required: true, enum: ['Purchase', 'Sales', 'Adjustment', 'Return'] },
    quantity: { type: Number, required: true }, // Positive for Inward, Negative for Outward handled in logic
    rate: { type: Number, required: true },
    total_amount: { type: Number, required: true },
    ref_no: { type: String },
    narration: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
