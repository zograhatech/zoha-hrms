const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String },
    manager_id: { type: String, ref: 'Employee', default: null }, // employee string id
}, { timestamps: true });

// Virtual: employee_count populated in controller
departmentSchema.virtual('employee_count');

module.exports = mongoose.models.Department || mongoose.model('Department', departmentSchema);
