const mongoose = require('mongoose');

const onboardingSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true },
    applied_role: { type: String, required: true, trim: true },
    department_id: { type: String, trim: true },
    qualification: { type: String },
    experience_type: { type: String },
    experience_years: { type: String },
    address: { type: String },
    status: { 
        type: String, 
        enum: ['Offer Accepted', 'Documents Verification', 'IT Setup', 'Orientation'], 
        default: 'Offer Accepted' 
    },
    start_date: { type: Date },
    documents_submitted: { type: Boolean, default: false },
    it_setup_completed: { type: Boolean, default: false },
    orientation_completed: { type: Boolean, default: false },
    notes: { type: String, trim: true },
}, { timestamps: true });

module.exports = mongoose.models.Onboarding || mongoose.model('Onboarding', onboardingSchema);
