const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema({
    company_name: { type: String, default: 'Hari HRMS' },
    company_subtext: { type: String, default: 'HR Management System' },
    company_logo: { type: String, default: '' },
    company_address: { type: String, default: '' },
    company_email: { type: String, default: '' },
    company_phone: { type: String, default: '' },
    company_gstin: { type: String, default: '' },
    leave_policies: {
        casual_leave: { type: Number, default: 12 },
        sick_leave: { type: Number, default: 12 },
        earned_leave: { type: Number, default: 15 },
        maternity_leave: { type: Number, default: 0 },
        paternity_leave: { type: Number, default: 0 }
    },
    attendance_settings: {
        office_start_time: { type: String, default: '09:00' },
        office_end_time: { type: String, default: '18:00' },
        grace_period: { type: Number, default: 15 },
        half_day_min_hours: { type: Number, default: 4 },
        full_day_min_hours: { type: Number, default: 8 }
    },
    email_settings: {
        mail_from_name: { type: String, default: '' },
        mail_from_email: { type: String, default: '' },
        enable_email_queue: { type: String, enum: ['Yes', 'No'], default: 'No' },
        mail_driver: { type: String, enum: ['mail', 'smtp'], default: 'smtp' },
        mail_host: { type: String, default: '' },
        mail_port: { type: String, default: '' },
        mail_encryption: { type: String, enum: ['none', 'ssl', 'tls'], default: 'ssl' },
        mail_username: { type: String, default: '' },
        mail_password: { type: String, default: '' }
    },
    roles_permissions: {
        type: mongoose.Schema.Types.Mixed,
        default: {
            hr_manager: ['all_modules', 'manage_settings', 'view_audit_logs', 'manage_subscription', 'manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_payroll_formulas', 'manage_departments', 'manage_shifts', 'view_analytics', 'manage_zoom', 'manage_events', 'manage_resignations', 'manage_fun', 'manage_lms'],
            hr: ['manage_employees', 'manage_attendance', 'manage_leaves', 'manage_tickets', 'view_analytics', 'manage_departments', 'manage_shifts', 'manage_messages', 'manage_events', 'manage_announcements'],
            employee: []
        }
    },
    payroll_formulas: {
        pf_wage_ceiling: { type: Number, default: 15000 },
        pf_fixed_amount: { type: Number, default: 1800 },
        pf_rate: { type: Number, default: 0.12 },
        esi_wage_limit: { type: Number, default: 21000 },
        esi_employee_rate: { type: Number, default: 0.0075 },
        esi_employer_rate: { type: Number, default: 0.0325 },
        pt_slab1_limit: { type: Number, default: 10000 },
        pt_slab1_amount: { type: Number, default: 0 },
        pt_slab2_limit: { type: Number, default: 15000 },
        pt_slab2_amount: { type: Number, default: 150 },
        pt_above_amount: { type: Number, default: 200 }
    },
    subscription: {
        plan: { type: String, enum: ['free', 'starter', 'pro', 'enterprise'], default: 'free' },
        status: { type: String, enum: ['active', 'expired', 'trial', 'inactive'], default: 'trial' },
        expires_at: { type: Date, default: () => new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) }, 
        max_employees: { type: Number, default: 5 },
        is_paid: { type: Boolean, default: false }
    },
    payment_qr_code: { type: String, default: '' },
    module_pricing: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.models.Setting || mongoose.model('Setting', settingSchema);
