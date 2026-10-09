const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    resume_url: { type: String },
    qualification: { type: String },
    experience_type: { type: String },
    experience_years: { type: String },
    address: { type: String },
    status: { type: String, enum: ['Applied', 'Screening', 'Interviewed', 'Offered', 'Hired', 'Rejected'], default: 'Applied' },
    notes: { type: String },
    applied_date: { type: Date, default: Date.now }
});

const recruitmentSchema = new mongoose.Schema({
    job_title: { type: String, required: true },
    department_id: { type: String, required: true },
    description: { type: String },
    requirements: { type: String },
    positions: { type: Number, default: 1 },
    status: { type: String, enum: ['Open', 'Closed', 'On Hold'], default: 'Open' },
    candidates: [candidateSchema]
}, { timestamps: true });

module.exports = mongoose.models.Recruitment || mongoose.model('Recruitment', recruitmentSchema);
