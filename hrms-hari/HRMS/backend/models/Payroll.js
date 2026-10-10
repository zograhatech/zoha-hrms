const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema({
    employee_id: { type: String, required: true, ref: 'Employee' },
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
    days_worked: { type: Number, default: 0 },

    // ── Wages Earned ──────────────────────────────
    basic: { type: Number, default: 0 },
    da: { type: Number, default: 0 },   // Dearness Allowance
    oa: { type: Number, default: 0 },   // Other Allowance
    leave_wages: { type: Number, default: 0 },
    esi_wages: { type: Number, default: 0 },   // ESI Wages (70%)
    epf_wages: { type: Number, default: 0 },   // EPF Wages (70%)

    // ── Deductions ────────────────────────────────
    provident_fund: { type: Number, default: 0 }, // PF
    esi_deduction: { type: Number, default: 0 }, // E.S.I
    pt: { type: Number, default: 0 }, // Professional Tax
    lwf: { type: Number, default: 0 }, // Labour Welfare Fund
    tds: { type: Number, default: 0 },
    leave_deduction: { type: Number, default: 0 },
    other_deductions: { type: Number, default: 0 }, // Advance & Fine

    // ── Employer Contributions ───────────────────
    employer_pf: { type: Number, default: 0 },
    employer_esi: { type: Number, default: 0 },

    // ── Misc ──────────────────────────────────────
    bank_ac_no: { type: String, default: '' },
    paid_date: { type: Date },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
}, { timestamps: true });

// Virtual computed fields
payrollSchema.virtual('gross_salary').get(function () {
    return this.basic + this.da + this.oa + this.leave_wages;
});
payrollSchema.virtual('total_deductions').get(function () {
    return this.provident_fund + this.esi_deduction + this.pt + this.lwf + this.tds + this.leave_deduction + this.other_deductions;
});
payrollSchema.virtual('net_salary').get(function () {
    return this.gross_salary - this.total_deductions;
});
payrollSchema.virtual('actual_payable').get(function () {
    const standardDeductions = this.provident_fund + this.esi_deduction + this.pt + this.lwf + this.tds + this.leave_deduction;
    const monthlyNet = this.gross_salary - standardDeductions;
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    return (daysInMonth > 0 ? (monthlyNet / daysInMonth) * (this.days_worked || 0) : 0) - this.other_deductions;
});

payrollSchema.set('toJSON', { virtuals: true });
payrollSchema.set('toObject', { virtuals: true });
payrollSchema.index({ employee_id: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema);
