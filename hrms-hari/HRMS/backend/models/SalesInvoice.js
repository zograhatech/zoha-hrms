const mongoose = require('mongoose');

const salesInvoiceSchema = new mongoose.Schema({
    invoice_no: { type: String, required: true, unique: true },
    date: { type: Date, default: Date.now },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }, // Optional for direct entry
    customer_name: { type: String }, // For manual/walk-in entry
    customer_gst: { type: String }, // For manual/walk-in entry
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        quantity: { type: Number, required: true },
        rate: { type: Number, required: true },
        amount: { type: Number, required: true }
    }],
    subtotal: { type: Number, required: true },
    tax_percent: { type: Number, default: 0 },
    tax_amount: { type: Number, default: 0 },
    total_amount: { type: Number, required: true },
    payment_status: { type: String, enum: ['Unpaid', 'Partially Paid', 'Paid'], default: 'Unpaid' },
    payment_received: { type: Number, default: 0 },
    notes: { type: String },
    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SalesInvoice', salesInvoiceSchema);
