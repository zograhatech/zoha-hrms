const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const employeeSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password_hash: { type: String, required: true },
    role: { type: String, default: 'employee' },
    department_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    shift_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift', default: null },
    manager_id: { type: String, ref: 'Employee', default: null },
    phone: { type: String, trim: true },
    designation: { type: String, trim: true },
    qualification: { type: String, trim: true },
    experience_type: { type: String, enum: ['fresher', 'experienced', ''] },
    experience_years: { type: String, trim: true },
    date_of_joining: { type: Date },
    date_of_birth: { type: Date },
    gender: { type: String, enum: ['male', 'female', 'other', ''] },
    address: { type: String },
    pan: { type: String, trim: true, uppercase: true },
    uan: { type: String, trim: true },
    pf_account_no: { type: String, trim: true },
    status: { type: String, enum: ['active', 'inactive', 'terminated'], default: 'active' },
    profile_image: { type: String },
    salary_details: {
        basic: { type: Number, default: 0 },
        da: { type: Number, default: 0 },
        oa: { type: Number, default: 0 },
        leave_wages: { type: Number, default: 0 },
        esi_wages: { type: Number, default: 0 },
        epf_wages: { type: Number, default: 0 },
        provident_fund: { type: Number, default: 0 },
        esi_deduction: { type: Number, default: 0 },
        pt: { type: Number, default: 0 },
        lwf: { type: Number, default: 0 },
        tds: { type: Number, default: 0 },
        leave_deduction: { type: Number, default: 0 },
        other_deductions: { type: Number, default: 0 },
        bank_ac_no: { type: String, default: '' },
        bank_ifsc_code: { type: String, default: '' },
        bank_name: { type: String, default: '' },
    },
    refresh_tokens: [String],
    reset_otp: { type: String },
    reset_otp_expiry: { type: Date },
    push_subscription: { type: Object, default: null },
    permissions: { type: [String], default: null },
}, { timestamps: true });

employeeSchema.index({ status: 1 });
employeeSchema.index({ role: 1 });
employeeSchema.index({ department_id: 1 });
employeeSchema.index({ name: 1 });
employeeSchema.index({ date_of_joining: 1 });

employeeSchema.methods.matchPassword = function (password) {
    return bcrypt.compare(password, this.password_hash);
};

employeeSchema.pre('save', async function () {
    if (!this.isModified('password_hash')) return;
    if (!this.password_hash.startsWith('$2')) {
        this.password_hash = await bcrypt.hash(this.password_hash, 10);
    }
});

module.exports = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
