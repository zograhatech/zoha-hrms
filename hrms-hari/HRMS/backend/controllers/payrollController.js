const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { sendEmail } = require('../utils/emailService');
const XLSX = require('xlsx');

// Helper: compute gross/net from a plain object
const computeSalary = (p) => {
    const gross = (p.basic || 0) + (p.da || 0) + (p.oa || 0) + (p.leave_wages || 0);
    const standardDed = (p.provident_fund || 0) + (p.esi_deduction || 0) + (p.pt || 0) + (p.lwf || 0) + (p.tds || 0) + (p.leave_deduction || 0);
    const totalDed = standardDed + (p.other_deductions || 0);
    const monthlyNet = gross - standardDed;
    const daysInMonth = (p.month && p.year) ? new Date(p.year, p.month, 0).getDate() : 30;
    const proRated = daysInMonth > 0 ? (monthlyNet / daysInMonth) * (p.days_worked || 0) : 0;
    const actualPayable = proRated - (p.other_deductions || 0);

    return { 
        gross_salary: gross, 
        total_deductions: totalDed, 
        net_salary: gross - totalDed,
        actual_payable: actualPayable
    };
};

// ─── GET /api/payroll/:employeeId ─────────────────────────────
const getEmployeePayroll = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;

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
                const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(payroll);
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
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p);
            return { ...p, gross_salary, total_deductions, net_salary, actual_payable };
        });
        res.json({ success: true, payroll: result, employee: empInfo });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── GET /api/payroll/all  (Admin) ────────────────────────────
const getAllPayroll = async (req, res) => {
    try {
        const { month, year } = req.query;
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
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p);
            return {
                ...p,
                gross_salary,
                total_deductions,
                net_salary,
                actual_payable,
                employee_name: emp.name || p.employee_id,
                gender: emp.gender || '',
                designation: emp.designation || '',
                department_name: emp.department_id ? deptMap[emp.department_id.toString()] : null,
            };
        });

        res.json({ success: true, payroll: result });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── GET /api/payroll/analytics?year=YYYY ────────────────────
const getAnalytics = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();
        const analytics = await Payroll.aggregate([
            { $match: { year } },
            {
                $group: {
                    _id: '$month',
                    total: {
                        $sum: {
                            $subtract: [
                                { $add: ['$basic', '$da', '$oa', '$leave_wages'] },
                                { $add: ['$provident_fund', '$esi_deduction', '$other_deductions', '$pt', '$lwf', '$tds', '$leave_deduction'] }
                            ]
                        }
                    },
                    employees: { $sum: 1 },
                    avgSalary: {
                        $avg: {
                            $subtract: [
                                { $add: ['$basic', '$da', '$oa', '$leave_wages'] },
                                { $add: ['$provident_fund', '$esi_deduction', '$other_deductions', '$pt', '$lwf', '$tds', '$leave_deduction'] }
                            ]
                        }
                    },
                },
            },
            { $project: { _id: 0, month: '$_id', total: 1, employees: 1, avgSalary: { $round: ['$avgSalary', 0] } } },
            { $sort: { month: 1 } },
        ]);
        res.json({ success: true, analytics });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// ─── POST /api/payroll/create ────────────────────────────────
const createPayroll = async (req, res) => {
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
            status: 'pending'
        });

        res.status(201).json({ success: true, message: 'Payroll record created.', payroll: payroll.toJSON() });
    } catch (err) {
        console.error('[createPayroll]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// ─── PUT /api/payroll/:id/pay ─────────────────────────────────
const markAsPaid = async (req, res) => {
    try {
        const payroll = await Payroll.findByIdAndUpdate(
            req.params.id,
            { status: 'paid', paid_date: new Date() },
            { returnDocument: 'after' }
        );
        if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found.' });

        const emp = await Employee.findOne({ id: payroll.employee_id }).lean();
        if (emp?.email) {
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            const monthName = months[payroll.month - 1];
            const { actual_payable } = computeSalary(payroll.toObject());

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
            });
        }

        res.json({ success: true, message: 'Marked as paid and employee notified.', payroll: payroll.toJSON() });
    } catch (err) {
        console.error('[markAsPaid]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

const bulkMarkAsPaid = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Invalid or empty IDs array.' });
        }

        const result = await Payroll.updateMany(
            { _id: { $in: ids } },
            { $set: { status: 'paid', paid_date: new Date() } }
        );

        res.json({ success: true, message: `Bulk updated ${result.modifiedCount} records and notified employees.` });
    } catch (err) {
        console.error('[bulkMarkAsPaid]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// ─── GET /api/payroll/export ──────────────────────────────────
const exportPayroll = async (req, res) => {
    try {
        const payrolls = await Payroll.find({}).lean();
        const empIds = [...new Set(payrolls.map(p => p.employee_id))];
        const emps = await Employee.find({ id: { $in: empIds } }).lean();
        const empMap = Object.fromEntries(emps.map(e => [e.id, e]));

        const rows = payrolls.map(p => {
            const emp = empMap[p.employee_id] || {};
            const { gross_salary, total_deductions, net_salary, actual_payable } = computeSalary(p);
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
                provident_fund: p.provident_fund, esi_deduction: p.esi_deduction, other_deductions: p.other_deductions,
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
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });

        const REQUIRED = ['employee_id', 'month', 'year', 'basic'];
        let imported = 0, skipped = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            const missing = REQUIRED.filter(f => !String(row[f] || '').trim());
            if (missing.length > 0) {
                errors.push(`Row ${rowNum}: Missing required fields: ${missing.join(', ')}`);
                skipped++; continue;
            }

            const emp = await Employee.findOne({ id: String(row.employee_id).trim().toUpperCase() }).lean();
            if (!emp) {
                errors.push(`Row ${rowNum}: Employee "${row.employee_id}" not found.`);
                skipped++; continue;
            }

            const exists = await Payroll.findOne({ employee_id: emp.id, month: +row.month, year: +row.year });
            if (exists) {
                errors.push(`Row ${rowNum}: Payroll for ${emp.id} on ${row.month}/${row.year} already exists.`);
                skipped++; continue;
            }

            await Payroll.create({
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
                status: 'pending',
            });
            imported++;
        }

        res.json({ success: true, message: `Payroll import complete. ${imported} imported, ${skipped} skipped.`, imported, skipped, errors });
    } catch (err) {
        console.error('[importPayroll]', err);
        res.status(500).json({ success: false, message: 'Import failed: ' + err.message });
    }
};

module.exports = { getEmployeePayroll, getAllPayroll, getAnalytics, createPayroll, markAsPaid, bulkMarkAsPaid, exportPayroll, importPayroll, downloadPayrollTemplate };
