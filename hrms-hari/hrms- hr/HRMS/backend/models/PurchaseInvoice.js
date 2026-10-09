const mongoose = require('mongoose');

const purchaseInvoiceSchema = new mongoose.Schema({
    bill_no: { type: String, required: true }, // Vendor's bill number
    internal_ref: { type: String, required: true, unique: true }, // System generated
    date: { type: Date, default: Date.now },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        quantity: { type: Number, required: true },
        rate: { type: Number, required: true }, // Purchase Rate
        amount: { type: Number, required: true }
    }],
    subtotal: { type: Number, required: true },
    tax_percent: { type: Number, default: 0 },
    tax_amount: { type: Number, default: 0 },
    total_amount: { type: Number, required: true },
    payment_status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    payment_made: { type: Number, default: 0 },
    notes: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('PurchaseInvoice', purchaseInvoiceSchema);
