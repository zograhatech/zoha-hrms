const mongoose = require('mongoose');

const rotationShiftSchema = new mongoose.Schema({
    name: { type: String, required: true },
    frequency: { type: String, enum: ['Daily', 'Weekly', 'Bi-Weekly', 'Monthly'], default: 'Weekly' },
    shifts: [{ type: String }],
    assigned_staff: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Employee' }]
}, { timestamps: true });

module.exports = mongoose.models.RotationShift || mongoose.model('RotationShift', rotationShiftSchema);
