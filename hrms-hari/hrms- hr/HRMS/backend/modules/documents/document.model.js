const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' }, // Using the string 'id' field of Employee
    name: { type: String, required: true },
    type: { type: String, enum: ['photo', 'document', 'other'], default: 'document' },
    category: { type: String, default: 'General' },
    data: { type: Buffer, required: true },
    contentType: { type: String, required: true },
    size: { type: Number },
    uploaded_by: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
}, { timestamps: true });

module.exports = mongoose.model('Document', documentSchema);
