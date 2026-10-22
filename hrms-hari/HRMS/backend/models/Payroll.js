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
    unpaid_leave_days: { type: Number, default: 0, min: 0 },
    unpaid_leave_deduction: { type: Number, default: 0, min: 0 },
    unpaid_leave_adjustment: { type: Number, default: 0, min: 0 },
    adjustment_notes: [{
        leave_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Leave', required: true },
        source_month: { type: Number, required: true },
        source_year: { type: Number, required: true },
        amount: { type: Number, required: true },
        reason: { type: String, default: 'Late approved leave after payroll paid' },
        applied_at: { type: Date, default: Date.now }
    }],

    // ── Employer Contributions ───────────────────
    employer_pf: { type: Number, default: 0 },
    employer_esi: { type: Number, default: 0 },

    // ── Misc ──────────────────────────────────────
    bank_ac_no: { type: String, default: '' },
    paid_date: { type: Date },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    days_worked_convention: { type: String, enum: ['payable', 'attended'], default: 'payable' },
}, { timestamps: true });

// Virtual computed fields
payrollSchema.virtual('gross_salary').get(function () {
    return this.basic + this.da + this.oa + this.leave_wages;
});
payrollSchema.virtual('total_deductions').get(function () {
    return (this.provident_fund || 0) + (this.esi_deduction || 0) + (this.pt || 0) + (this.lwf || 0) + (this.tds || 0) + (this.leave_deduction || 0) + (this.unpaid_leave_deduction || 0) + (this.unpaid_leave_adjustment || 0) + (this.other_deductions || 0);
});
payrollSchema.virtual('net_salary').get(function () {
    return this.gross_salary - this.total_deductions;
});
// Note: actual_payable virtual uses this.days_worked_convention ('payable' | 'attended').
// Defaults to the 'payable' formula when missing or 'payable'.
payrollSchema.virtual('actual_payable').get(function () {
    const standardDeductions = (this.provident_fund || 0) + (this.esi_deduction || 0) + (this.pt || 0) + (this.lwf || 0) + (this.tds || 0) + (this.leave_deduction || 0);
    const monthlyNet = this.gross_salary - standardDeductions;
    const daysInMonth = new Date(this.year, this.month, 0).getDate();
    const proRated = daysInMonth > 0 ? (monthlyNet / daysInMonth) * (this.days_worked || 0) : 0;
    if (this.days_worked_convention === 'attended') {
        return proRated - (this.other_deductions || 0) - (this.unpaid_leave_adjustment || 0);
    }
    return proRated - (this.other_deductions || 0) - (this.unpaid_leave_deduction || 0) - (this.unpaid_leave_adjustment || 0);
});

payrollSchema.set('toJSON', { virtuals: true });
payrollSchema.set('toObject', { virtuals: true });
payrollSchema.index({ employee_id: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema);
