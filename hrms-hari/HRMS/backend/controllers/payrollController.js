const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const Setting = require('../models/Setting');
const UnpaidLeaveAdjustment = require('../models/UnpaidLeaveAdjustment');
const { sendEmail } = require('../utils/emailService');
const { toISTDateString, getISTDayStart, getISTDayEnd } = require('../utils/istDate');
const { splitLeaveByMonth, computeMonthlyDeduction, round2 } = require('../utils/leaveDeduction');
const XLSX = require('xlsx');

// Helper: compute gross/net from a plain object
const computeSalary = (p, convention = 'payable') => {
    const gross = (p.basic || 0) + (p.da || 0) + (p.oa || 0) + (p.leave_wages || 0);
    const standardDed = (p.provident_fund || 0) + (p.esi_deduction || 0) + (p.pt || 0) + (p.lwf || 0) + (p.tds || 0) + (p.leave_deduction || 0);
    const totalDed = standardDed + (p.unpaid_leave_deduction || 0) + (p.unpaid_leave_adjustment || 0) + (p.other_deductions || 0);
    const monthlyNet = gross - standardDed;
    const daysInMonth = (p.month && p.year) ? new Date(p.year, p.month, 0).getDate() : 30;
    const proRated = daysInMonth > 0 ? (monthlyNet / daysInMonth) * (p.days_worked || 0) : 0;
    const actualPayable = convention === 'attended'
        ? proRated - (p.other_deductions || 0) - (p.unpaid_leave_adjustment || 0)
        : proRated - (p.other_deductions || 0) - (p.unpaid_leave_deduction || 0) - (p.unpaid_leave_adjustment || 0);

    return { 
        gross_salary: gross, 
        total_deductions: totalDed, 
        net_salary: gross - totalDed,
        actual_payable: actualPayable
    };
};

const getDaysWorkedConvention = async () => {
    try {
        const s = await Setting.findOne().select('days_worked_convention').lean();
        return (s && s.days_worked_convention === 'attended') ? 'attended' : 'payable';
    } catch {
        return 'payable';
    }
};

// Strictly enforce SuperAdmin (admin) role in controller
const checkAdminRole = (req, res) => {
    const roleLower = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
    if (roleLower !== 'admin') {
        res.status(403).json({ success: false, message: 'Access denied: Admin only.' });
        return false;
    }
    return true;
};

// Shared calculation and synchronization function
const syncPendingPayrollForMonth = async ({ employee_id, month, year, baseSalary = null, payrollDoc = null, dryRun = false }) => {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    if (monthKey < '2026-10') {
        return { unpaid_leave_days: 0, unpaid_leave_deduction: 0, payroll: payrollDoc };
    }

    let targetPayroll = payrollDoc;
    if (!targetPayroll && !dryRun) {
        targetPayroll = await Payroll.findOne({ employee_id, month, year, status: 'pending' });
    }
    if (!targetPayroll && !dryRun) {
        return { unpaid_leave_days: 0, unpaid_leave_deduction: 0, payroll: null };
    }

    const padM = String(month).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const padD = String(lastDay).padStart(2, '0');
    const monthStartUtc = getISTDayStart(`${year}-${padM}-01`);
    const monthEndUtc = getISTDayEnd(`${year}-${padM}-${padD}`);

    const [holidays, overlappingApprovedLeaves, settings] = await Promise.all([
        Holiday.find({}).select('date').lean(),
        Leave.find({
            employee_id,
            status: 'approved',
            start_date: { $lt: monthEndUtc },
            end_date: { $gte: monthStartUtc }
        }).lean(),
        Setting.findOne().lean()
    ]);

    const holidayDates = holidays.map(h => typeof h.date === 'string' ? h.date : toISTDateString(h.date));
    let approvedDaysInMonth = 0;
    for (const l of overlappingApprovedLeaves) {
        const daysByMonth = splitLeaveByMonth(toISTDateString(l.start_date), toISTDateString(l.end_date), holidayDates);
        approvedDaysInMonth += (daysByMonth[monthKey] || 0);
    }

    const allowance = (settings && typeof settings.monthly_leave_allowance === 'number')
        ? settings.monthly_leave_allowance
        : 1;

    const computedBase = (baseSalary != null)
        ? baseSalary
        : ((targetPayroll?.basic || 0) + (targetPayroll?.da || 0) + (targetPayroll?.oa || 0));

    const { deductibleDays, deduction } = computeMonthlyDeduction({
        approvedDaysInMonth,
        allowance,
        baseSalary: computedBase,
        divisor: 30
    });

    if (!dryRun && targetPayroll) {
        targetPayroll.unpaid_leave_days = deductibleDays;
        targetPayroll.unpaid_leave_deduction = deduction;
        await targetPayroll.save();
    }

    return {
        unpaid_leave_days: deductibleDays,
        unpaid_leave_deduction: deduction,
        payroll: targetPayroll
    };
};

// Consumes pending adjustments from earlier paid months
const consumePendingAdjustmentsForPayroll = async (payroll) => {
    const pending = await UnpaidLeaveAdjustment.find({
        employee_id: payroll.employee_id,
        status: 'pending',
        $or: [
            { source_year: { $lt: payroll.year } },
            { source_year: payroll.year, source_month: { $lt: payroll.month } }
        ]
    });

    if (!pending.length) return;

    const totalAdjustment = round2(pending.reduce((sum, a) => sum + (a.amount || 0), 0));
    payroll.unpaid_leave_adjustment = round2((payroll.unpaid_leave_adjustment || 0) + totalAdjustment);

    for (const a of pending) {
        payroll.adjustment_notes.push({
            leave_id: a.leave_id,
            source_month: a.source_month,
            source_year: a.source_year,
            amount: a.amount,
            reason: 'Late approved leave after payroll paid',
            applied_at: new Date()
        });
    }

    // Step 1: Save the payroll first. If this throws, adjustments remain 'pending'.
    await payroll.save();

    // Step 2: Only after payroll.save succeeds, mark adjustments 'applied'
    await UnpaidLeaveAdjustment.updateMany(
        { _id: { $in: pending.map(a => a._id) } },
        {
            $set: {
                status: 'applied',
                applied_payroll_id: payroll._id,
                applied_at: new Date()
            }
        }
    );
};

// ─── GET /api/payroll/:employeeId ─────────────────────────────
const getEmployeePayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;
        const convention = await getDaysWorkedConvention();

        const emp = await Employee.findOne({ id: employeeId }).lean();
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        let dept_name = null;
        if (emp.department_id) {
            const dept = await Department.findById(emp.department_id).select('name');
            dept_name = dept?.name || null;
        }

        const empInfo = { ...emp, department_name: dept_name, password_hash: undefined };

        if (month && year) {
            const payroll = await Payroll.findOne({ employee_id: employeeId, month: +month, year: +year }).lean();
            if (payroll) {
                const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(payroll, convention);
                return res.json({ 
                    success: true, 
                    payroll: { ...payroll, gross_salary, total_deductions, net_salary, actual_payable }, 
                    employee: empInfo 
                });
            }
            return res.json({ success: true, payroll: null, employee: empInfo });
        }

        const payrolls = await Payroll.find({ employee_id: employeeId }).sort({ year: -1, month: -1 }).lean();
        const result = payrolls.map(p => {
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p, convention);
            return { ...p, gross_salary, total_deductions, net_salary, actual_payable };
        });
        res.json({ success: true, payroll: result, employee: empInfo });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── GET /api/payroll/all  (Admin) ────────────────────────────
const getAllPayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const { month, year } = req.query;
        const convention = await getDaysWorkedConvention();
        const filter = {};
        if (month) filter.month = +month;
        if (year) filter.year = +year;

        const payrolls = await Payroll.find(filter).sort({ year: -1, month: -1 }).lean();

        const empIds = [...new Set(payrolls.map(p => p.employee_id))];
        const employees = await Employee.find({ id: { $in: empIds } }).lean();
        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        const result = payrolls.map(p => {
            const emp = empMap[p.employee_id] || {};
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p, convention);
            return {
                ...p,
                employee_name: emp.name || '',
                department_name: deptMap[emp.department_id?.toString()] || '',
                designation: emp.designation || '',
                gross_salary,
                total_deductions,
                net_salary,
                actual_payable,
            };
        });

        res.json({ success: true, payrolls: result });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── GET /api/payroll/analytics ──────────────────────────────
const getAnalytics = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const { month, year } = req.query;
        const convention = await getDaysWorkedConvention();
        const filter = {};
        if (month) filter.month = +month;
        if (year) filter.year = +year;

        const payrolls = await Payroll.find(filter).lean();

        let totalSalaryPaid = 0;
        let totalDeductions = 0;
        let pendingPayments = 0;
        let paidEmployees = 0;

        payrolls.forEach(p => {
            const { gross_salary, total_deductions, net_salary } = computeSalary(p, convention);
            totalDeductions += total_deductions;
            if (p.status === 'paid') {
                totalSalaryPaid += net_salary;
                paidEmployees++;
            } else {
                pendingPayments += net_salary;
            }
        });

        const analytics = {
            total_records: payrolls.length,
            total_salary_paid: totalSalaryPaid,
            total_deductions: totalDeductions,
            pending_payments: pendingPayments,
            paid_count: paidEmployees,
            pending_count: payrolls.length - paidEmployees
        };

        res.json({ success: true, analytics });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── POST /api/payroll/create ────────────────────────────────
const createPayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const {
            employee_id, month, year, days_worked,
            basic, da, oa, leave_wages, esi_wages, epf_wages,
            provident_fund, esi_deduction, pt, lwf, tds, leave_deduction, other_deductions,
            employer_pf, employer_esi,
            bank_ac_no
        } = req.body;

        const existing = await Payroll.findOne({ employee_id, month, year });
        if (existing) return res.status(400).json({ success: false, message: 'Payroll for this month already exists.' });

        // Step 1: Compute unpaid leave days & deduction before creating payroll
        const { unpaid_leave_days, unpaid_leave_deduction } = await syncPendingPayrollForMonth({
            employee_id,
            month: +month,
            year: +year,
            baseSalary: (basic || 0) + (da || 0) + (oa || 0),
            dryRun: true
        });

        // Step 2: Create Payroll document with computed values
        const payroll = await Payroll.create({
            employee_id, month, year,
            days_worked: days_worked || 0,
            basic: basic || 0,
            da: da || 0,
            oa: oa || 0,
            leave_wages: leave_wages || 0,
            esi_wages: esi_wages || 0,
            epf_wages: epf_wages || 0,
            provident_fund: provident_fund || 0,
            esi_deduction: esi_deduction || 0,
            pt: pt || 0,
            lwf: lwf || 0,
            tds: tds || 0,
            leave_deduction: leave_deduction || 0,
            other_deductions: other_deductions || 0,
            employer_pf: employer_pf || 0,
            employer_esi: employer_esi || 0,
            bank_ac_no: bank_ac_no || '',
            unpaid_leave_days,
            unpaid_leave_deduction,
            unpaid_leave_adjustment: 0,
            status: 'pending'
        });

        // Step 3: Consume any pending adjustments from earlier paid months after create
        await consumePendingAdjustmentsForPayroll(payroll);

        try {
            const emp = await Employee.findOne({ id: employee_id }).select('_id').lean();
            if (emp) {
                await Notification.create({
                    recipient: emp._id,
                    type: 'general',
                    title: 'Payroll Created',
                    message: `Payroll record for month ${month}/${year} has been created.`,
                    data: { status: 'pending' }
                });
            }
        } catch (notifErr) {
            console.error('[createPayroll] notification error:', notifErr.message);
        }

        const convention = await getDaysWorkedConvention();
        const pObj = payroll.toJSON();
        const { actual_payable } = computeSalary(pObj, convention);
        pObj.actual_payable = actual_payable;
        res.status(201).json({ success: true, message: 'Payroll record created.', payroll: pObj });
    } catch (err) {
        console.error('[createPayroll]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// ─── PUT /api/payroll/:id/pay ─────────────────────────────────
const markAsPaid = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const payroll = await Payroll.findByIdAndUpdate(
            req.params.id,
            { status: 'paid', paid_date: new Date() },
            { returnDocument: 'after' }
        );
        if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found.' });

        const convention = await getDaysWorkedConvention();
        const emp = await Employee.findOne({ id: payroll.employee_id }).lean();
        if (emp?._id) {
            try {
                await Notification.create({
                    recipient: emp._id,
                    type: 'general',
                    title: 'Salary Disbursed',
                    message: `Your salary for month ${payroll.month}/${payroll.year} has been marked as paid.`,
                    data: { status: 'paid' }
                });
            } catch (notifErr) {
                console.error('[markAsPaid] notification error:', notifErr.message);
            }
        }

        if (emp?.email) {
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = months[payroll.month - 1];
            const { actual_payable } = computeSalary(payroll.toObject(), convention);

            sendEmail({
                to: emp.email,
                subject: `Salary Disbursed - ${monthName} ${payroll.year}`,
                html: `
                    <h2 style="color: #6366f1;">💰 Salary Credited</h2>
                    <p>Hi ${emp.name},</p>
                    <p>Your salary for <b>${monthName} ${payroll.year}</b> has been processed and successfully disbursed.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border: 1px dashed #6366f1; margin: 20px 0;">
                        <p style="margin: 0; font-size: 1.2rem; color: #10b981;"><b>Actual Payable: ₹${actual_payable.toLocaleString('en-IN')}</b></p>
                        <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;" />
                        <p style="margin: 0; font-size: 0.9rem;">Please log in to your dashboard to download the detailed payslip.</p>
                    </div>
                    <p>Best Regards,<br>Finance Team</p>
                `
            }).catch(e => console.error('[markAsPaid] email error:', e.message));
        }

        res.json({ success: true, message: 'Marked as paid and employee notified.', payroll: payroll.toJSON() });
    } catch (err) {
        console.error('[markAsPaid]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

const bulkMarkAsPaid = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or empty IDs array.' });
        }

        const payrolls = await Payroll.find({ _id: { $in: ids } }).lean();
        const result = await Payroll.updateMany(
            { _id: { $in: ids } },
            { $set: { status: 'paid', paid_date: new Date() } }
        );

        try {
            const empIds = [...new Set(payrolls.map(p => p.employee_id))];
            const emps = await Employee.find({ id: { $in: empIds } }).select('_id id').lean();
            const empMap = Object.fromEntries(emps.map(e => [e.id, e._id]));
            const notifs = payrolls.map(p => empMap[p.employee_id] ? ({
                recipient: empMap[p.employee_id],
                type: 'general',
                title: 'Salary Disbursed',
                message: `Your salary for month ${p.month}/${p.year} has been marked as paid.`,
                data: { status: 'paid' }
            }) : null).filter(Boolean);

            if (notifs.length > 0) {
                await Notification.insertMany(notifs);
            }
        } catch (notifErr) {
            console.error('[bulkMarkAsPaid] notification error:', notifErr.message);
        }

        res.json({ success: true, message: `Bulk updated ${result.modifiedCount} records and notified employees.` });
    } catch (err) {
        console.error('[bulkMarkAsPaid]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// ─── GET /api/payroll/export ──────────────────────────────────
const exportPayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const convention = await getDaysWorkedConvention();
        const payrolls = await Payroll.find({}).lean();
        const empIds = [...new Set(payrolls.map(p => p.employee_id))];
        const emps = await Employee.find({ id: { $in: empIds } }).lean();
        const empMap = Object.fromEntries(emps.map(e => [e.id, e]));

        const rows = payrolls.map(p => {
            const emp = empMap[p.employee_id] || {};
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p, convention);
            return {
                employee_id: p.employee_id,
                employee_name: emp.name || '',
                gender: emp.gender || '',
                designation: emp.designation || '',
                month: p.month, year: p.year,
                days_worked: p.days_worked || 0,
                basic: p.basic, da: p.da, oa: p.oa,
                leave_wages: p.leave_wages, esi_wages: p.esi_wages, epf_wages: p.epf_wages,
                gross_salary,
                provident_fund: p.provident_fund, esi_deduction: p.esi_deduction, pt: p.pt, lwf: p.lwf, tds: p.tds,
                leave_deduction: p.leave_deduction || 0,
                unpaid_leave_days: p.unpaid_leave_days || 0,
                unpaid_leave_deduction: p.unpaid_leave_deduction || 0,
                unpaid_leave_adjustment: p.unpaid_leave_adjustment || 0,
                other_deductions: p.other_deductions,
                total_deductions, 
                net_salary,
                actual_payable,
                bank_ac_no: p.bank_ac_no || '',
                status: p.status,
                paid_date: p.paid_date ? new Date(p.paid_date).toISOString().split('T')[0] : '',
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Payroll');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="payroll_export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('[exportPayroll]', err);
        res.status(500).json({ success: false, message: 'Export failed.' });
    }
};

// ─── GET /api/payroll/template ────────────────────────────────
const downloadPayrollTemplate = (req, res) => {
    if (!checkAdminRole(req, res)) return;
    const sample = [{
        employee_id: 'EMP001',
        month: 3, year: 2026,
        days_worked: 26,
        basic: 15000, da: 3000, oa: 2000,
        leave_wages: 500, esi_wages: 1200, epf_wages: 1800,
        provident_fund: 1800, esi_deduction: 800, other_deductions: 0,
        bank_ac_no: '1234567890',
    }];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="payroll_import_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};

// ─── POST /api/payroll/import ─────────────────────────────────
const importPayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });

        const REQUIRED = ['employee_id', 'month', 'year', 'basic'];
        let imported = 0, skipped = 0;
        const errors = [];
        const importNotifs = [];

        // Batch pre-fetch: Setting, Holidays, Employees, Leaves
        const settings = await Setting.findOne().lean();
        const allowance = (settings && typeof settings.monthly_leave_allowance === 'number') ? settings.monthly_leave_allowance : 1;
        const holidays = await Holiday.find({}).select('date').lean();
        const holidayDates = holidays.map(h => typeof h.date === 'string' ? h.date : toISTDateString(h.date));

        const empIds = [...new Set(rows.map(r => String(r.employee_id || '').trim().toUpperCase()).filter(Boolean))];
        const allEmps = await Employee.find({ id: { $in: empIds } }).lean();
        const empMap = new Map(allEmps.map(e => [e.id, e]));

        const allApprovedLeaves = await Leave.find({
            employee_id: { $in: empIds },
            status: 'approved'
        }).lean();

        const leavesByEmp = new Map();
        for (const l of allApprovedLeaves) {
            if (!leavesByEmp.has(l.employee_id)) leavesByEmp.set(l.employee_id, []);
            leavesByEmp.get(l.employee_id).push(l);
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const missing = REQUIRED.filter(f => !String(row[f] || '').trim());
            if (missing.length > 0) {
                errors.push(`Row ${rowNum}: Missing required fields: ${missing.join(', ')}`);
                skipped++; continue;
            }

            const rowEmpId = String(row.employee_id).trim().toUpperCase();
            const emp = empMap.get(rowEmpId);
            if (!emp) {
                errors.push(`Row ${rowNum}: Employee "${row.employee_id}" not found.`);
                skipped++; continue;
            }

            const exists = await Payroll.findOne({ employee_id: emp.id, month: +row.month, year: +row.year });
            if (exists) {
                errors.push(`Row ${rowNum}: Payroll for ${emp.id} on ${row.month}/${row.year} already exists.`);
                skipped++; continue;
            }

            // In-memory unpaid leave computation for imported row
            const monthKey = `${+row.year}-${String(+row.month).padStart(2, '0')}`;
            let unpaid_leave_days = 0;
            let unpaid_leave_deduction = 0;

            if (monthKey >= '2026-10') {
                const padM = String(+row.month).padStart(2, '0');
                const lastDay = new Date(+row.year, +row.month, 0).getDate();
                const padD = String(lastDay).padStart(2, '0');
                const monthStartUtc = getISTDayStart(`${+row.year}-${padM}-01`);
                const monthEndUtc = getISTDayEnd(`${+row.year}-${padM}-${padD}`);

                const empLeaves = (leavesByEmp.get(emp.id) || []).filter(l => {
                    const startUtc = new Date(l.start_date);
                    const endUtc = new Date(l.end_date);
                    return startUtc < monthEndUtc && endUtc >= monthStartUtc;
                });

                let approvedDaysInMonth = 0;
                for (const l of empLeaves) {
                    const daysByMonth = splitLeaveByMonth(toISTDateString(l.start_date), toISTDateString(l.end_date), holidayDates);
                    approvedDaysInMonth += (daysByMonth[monthKey] || 0);
                }

                const baseSalary = (parseFloat(row.basic) || 0) + (parseFloat(row.da) || 0) + (parseFloat(row.oa) || 0);
                const deductionResult = computeMonthlyDeduction({
                    approvedDaysInMonth,
                    allowance,
                    baseSalary,
                    divisor: 30
                });
                unpaid_leave_days = deductionResult.deductibleDays;
                unpaid_leave_deduction = deductionResult.deduction;
            }

            const payroll = await Payroll.create({
                employee_id: emp.id,
                month: +row.month, year: +row.year,
                days_worked: parseFloat(row.days_worked) || 0,
                basic: parseFloat(row.basic) || 0,
                da: parseFloat(row.da) || 0,
                oa: parseFloat(row.oa) || 0,
                leave_wages: parseFloat(row.leave_wages) || 0,
                esi_wages: parseFloat(row.esi_wages) || 0,
                epf_wages: parseFloat(row.epf_wages) || 0,
                provident_fund: parseFloat(row.provident_fund) || 0,
                esi_deduction: parseFloat(row.esi_deduction) || 0,
                pt: parseFloat(row.pt) || 0,
                lwf: parseFloat(row.lwf) || 0,
                tds: parseFloat(row.tds) || 0,
                leave_deduction: parseFloat(row.leave_deduction) || 0,
                other_deductions: parseFloat(row.other_deductions) || 0,
                employer_pf: parseFloat(row.employer_pf) || 0,
                employer_esi: parseFloat(row.employer_esi) || 0,
                bank_ac_no: String(row.bank_ac_no || ''),
                unpaid_leave_days,
                unpaid_leave_deduction,
                unpaid_leave_adjustment: 0,
                status: 'pending',
            });

            await consumePendingAdjustmentsForPayroll(payroll);

            importNotifs.push({
                recipient: emp._id,
                type: 'general',
                title: 'Payroll Created',
                message: `Payroll record for month ${row.month}/${row.year} has been imported.`,
                data: { status: 'pending' }
            });
            imported++;
        }

        if (importNotifs.length > 0) {
            try {
                await Notification.insertMany(importNotifs);
            } catch (notifErr) {
                console.error('[importPayroll] notification error:', notifErr.message);
            }
        }

        res.json({ success: true, message: `Payroll import complete. ${imported} imported, ${skipped} skipped.`, imported, skipped, errors });
    } catch (err) {
        console.error('[importPayroll]', err);
        res.status(500).json({ success: false, message: 'Import failed: ' + err.message });
    }
};

// ─── GET /api/payroll/reconcile ────────────────────────────────
const reconcilePayroll = async (req, res) => {
    if (!checkAdminRole(req, res)) return;
    try {
        const { month, year } = req.query;
        if (!month || !year) {
            return res.status(400).json({ success: false, message: 'month and year are required query parameters.' });
        }

        const pendingPayrolls = await Payroll.find({ month: +month, year: +year, status: 'pending' }).lean();
        const mismatches = [];

        for (const p of pendingPayrolls) {
            const expected = await syncPendingPayrollForMonth({
                employee_id: p.employee_id,
                month: +month,
                year: +year,
                payrollDoc: p,
                dryRun: true
            });

            const dayMismatch = (p.unpaid_leave_days || 0) !== expected.unpaid_leave_days;
            const deductionMismatch = Math.abs((p.unpaid_leave_deduction || 0) - expected.unpaid_leave_deduction) > 0.01;

            const linkedAdjustments = await UnpaidLeaveAdjustment.find({ applied_payroll_id: p._id }).lean();
            const linkedSum = round2(linkedAdjustments.reduce((sum, a) => sum + (a.amount || 0), 0));
            const adjustmentMismatch = Math.abs((p.unpaid_leave_adjustment || 0) - linkedSum) > 0.01;

            if (dayMismatch || deductionMismatch || adjustmentMismatch) {
                mismatches.push({
                    employee_id: p.employee_id,
                    payroll_id: p._id,
                    stored: {
                        unpaid_leave_days: p.unpaid_leave_days || 0,
                        unpaid_leave_deduction: p.unpaid_leave_deduction || 0,
                        unpaid_leave_adjustment: p.unpaid_leave_adjustment || 0
                    },
                    expected: {
                        unpaid_leave_days: expected.unpaid_leave_days,
                        unpaid_leave_deduction: expected.unpaid_leave_deduction,
                        unpaid_leave_adjustment: linkedSum
                    },
                    difference: {
                        days: expected.unpaid_leave_days - (p.unpaid_leave_days || 0),
                        deduction: round2(expected.unpaid_leave_deduction - (p.unpaid_leave_deduction || 0)),
                        adjustment: round2(linkedSum - (p.unpaid_leave_adjustment || 0))
                    }
                });
            }
        }

        res.json({
            success: true,
            month: +month,
            year: +year,
            total_checked: pendingPayrolls.length,
            mismatches_count: mismatches.length,
            mismatches
        });
    } catch (err) {
        console.error('[reconcilePayroll]', err);
        res.status(500).json({ success: false, message: 'Reconciliation failed: ' + err.message });
    }
};

module.exports = { 
    getEmployeePayroll, 
    getAllPayroll, 
    getAnalytics, 
    createPayroll, 
    markAsPaid, 
    bulkMarkAsPaid, 
    exportPayroll, 
    importPayroll, 
    downloadPayrollTemplate,
    reconcilePayroll,
    syncPendingPayrollForMonth,
    consumePendingAdjustmentsForPayroll,
    computeSalary
};
