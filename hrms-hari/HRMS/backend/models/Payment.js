const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    employee_id: { type: String, required: true },
    employee_name: { type: String, required: true },
    module_key: { type: String, required: true },
    module_name: { type: String, required: true },
    amount: { type: Number, required: true },
    transaction_id: { type: String },
    receipt_image: { type: String }, // URL to cloudinary or local path
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected'], 
        default: 'pending' 
    },
    remarks: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
