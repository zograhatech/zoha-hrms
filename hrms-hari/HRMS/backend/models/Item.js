const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    group: { type: String, default: 'General' },
    unit: { type: String, default: 'Nos' },
    opening_stock: { type: Number, default: 0 },
    current_stock: { type: Number, default: 0 },
    purchase_price: { type: Number, default: 0 },
    selling_price: { type: Number, default: 0 },
    low_stock_threshold: { type: Number, default: 5 },
    description: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Item', itemSchema);
