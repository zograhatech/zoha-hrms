const mongoose = require('mongoose');

const assetSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    serial_number: { type: String, unique: true },
    assigned_to: { type: String }, // reference to Employee ID
    status: { type: String, enum: ['Available', 'Assigned', 'Under Maintenance', 'Retired'], default: 'Available' },
    purchase_date: { type: Date },
    cost: { type: Number },
    notes: { type: String }
}, { timestamps: true });

module.exports = mongoose.models.Asset || mongoose.model('Asset', assetSchema);
