const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    contact_person: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    gstin: { type: String },
    opening_balance: { type: Number, default: 0 },
    current_balance: { type: Number, default: 0 }, // Positive = Payable
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Vendor', vendorSchema);
