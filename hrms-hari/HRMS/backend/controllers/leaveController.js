const Leave = require('../models/Leave');
const LeaveBalance = require('../models/LeaveBalance');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { sendEmail } = require('../utils/emailService');
const Setting = require('../models/Setting');

// GET /api/leaves/:employeeId
const getEmployeeLeaves = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const currentYear = new Date().getFullYear();
        const leaves = await Leave.find({ employee_id: employeeId }).sort({ createdAt: -1 }).lean();

        let balance = await LeaveBalance.findOne({ employee_id: employeeId, year: currentYear }).lean();

        // If no balance record exists, create one from global settings
        if (!balance) {
            const settings = await Setting.findOne().lean();
            const policies = settings?.leave_policies || {
                casual_leave: 12, sick_leave: 12, earned_leave: 15, maternity_leave: 0, paternity_leave: 0
            };

            balance = await LeaveBalance.create({
                employee_id: employeeId,
                year: currentYear,
                ...policies
            });
            balance = balance.toObject();
        }

        const settings = await Setting.findOne().lean();
        res.json({ success: true, leaves, balance, policies: settings?.leave_policies });
    } catch (err) {
        console.error('[getEmployeeLeaves]', err);
        res.status(500).json({ success: false, message: 'Server error fetching leaves.' });
    }
};

// GET /api/leaves/pending  (all pending leaves for HR/Hr Manager)
const getPendingLeaves = async (req, res) => {
    try {
        const leaves = await Leave.find({ status: 'pending' }).sort({ createdAt: 1 }).lean();

        // Enrich with employee + department info
        const empIds = [...new Set(leaves.map(l => l.employee_id))];
        const employees = await Employee.find({ id: { $in: empIds } }).lean();
        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        const enriched = leaves.map(l => {
            const emp = empMap[l.employee_id] || {};
            return {
                ...l,
                employee_name: emp.name || l.employee_id,
                department_name: emp.department_id ? deptMap[emp.department_id.toString()] : null,
                designation: emp.designation,
            };
        });

        res.json({ success: true, leaves: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/leaves/apply
const applyLeave = async (req, res) => {
    try {
        const { employee_id, leave_type, start_date, end_date, reason } = req.body;

        const start = new Date(start_date);
        const end = new Date(end_date);
        if (start > end) return res.status(400).json({ success: false, message: 'Start date must be before end date.' });

        // Calculate working days
        let days = 0;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dow = d.getDay();
            if (dow !== 0 && dow !== 6) days++;
        }
        if (days === 0) return res.status(400).json({ success: false, message: 'No working days in the selected range.' });

        // Check overlap
        const overlap = await Leave.findOne({
            employee_id,
            status: { $ne: 'rejected' },
            $or: [
                { start_date: { $lte: end }, end_date: { $gte: start } },
            ],
        });
        if (overlap) return res.status(400).json({ success: false, message: 'You already have a leave request for overlapping dates.' });

        // Check balance for tracked leave types
        const TRACKED = { casual: 'casual_leave', sick: 'sick_leave', earned: 'earned_leave', maternity: 'maternity_leave', paternity: 'paternity_leave' };
        if (TRACKED[leave_type]) {
            const bal = await LeaveBalance.findOne({ employee_id, year: new Date().getFullYear() });
            if (!bal || bal[TRACKED[leave_type]] < days) {
                return res.status(400).json({ success: false, message: `Insufficient ${leave_type} leave balance. Available: ${bal?.[TRACKED[leave_type]] ?? 0} day(s).` });
            }
        }

        const leave = await Leave.create({ employee_id, leave_type, start_date: start, end_date: end, total_days: days, reason });

        // Notify Hr Manager/HR
        const emp = await Employee.findOne({ id: employee_id }).lean();
        const settings = await Setting.findOne().lean();
        const adminEmail = settings?.company_email;

        if (adminEmail) {
            sendEmail({
                to: adminEmail,
                subject: `New Leave Application: ${emp?.name || employee_id}`,
                html: `
                    <h2 style="color: #6366f1;">New Leave Request</h2>
                    <p><b>Employee:</b> ${emp?.name} (${employee_id})</p>
                    <p><b>Type:</b> ${leave_type.toUpperCase()}</p>
                    <p><b>Duration:</b> ${start_date} to ${end_date} (${days} days)</p>
                    <p><b>Reason:</b> ${reason}</p>
                    <hr />
                    <p>Please log in to the HRMS portal to take action.</p>
                `
            });
        }

        res.status(201).json({ success: true, message: 'Leave application submitted successfully. HR notified.', leave });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/leaves/:id/approve
const approveLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ success: false, message: 'Leave not found.' });
        if (leave.status !== 'pending') return res.status(400).json({ success: false, message: 'Leave is not pending.' });

        leave.status = 'approved';
        leave.approved_by = req.user.id;
        leave.approved_date = new Date();
        await leave.save();

        // Deduct balance
        const TRACKED = { casual: 'casual_leave', sick: 'sick_leave', earned: 'earned_leave', maternity: 'maternity_leave', paternity: 'paternity_leave' };
        if (TRACKED[leave.leave_type]) {
            await LeaveBalance.findOneAndUpdate(
                { employee_id: leave.employee_id, year: leave.start_date.getFullYear() },
                { $inc: { [TRACKED[leave.leave_type]]: -leave.total_days } }
            );
        }

        // Notify Employee
        const emp = await Employee.findOne({ id: leave.employee_id }).lean();
        const settings = await Setting.findOne().lean();
        const compName = settings?.company_name || process.env.COMPANY_NAME || 'HRMS';
        if (emp?.email) {
            sendEmail({
                to: emp.email,
                subject: `Leave Request Approved - ${compName}`,
                html: `
                    <h2 style="color: #10b981;">✅ Leave Approved</h2>
                    <p>Hi ${emp.name},</p>
                    <p>Your request for <b>${leave.leave_type} leave</b> has been <b>approved</b>.</p>
                    <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; border-left: 4px solid #10b981;">
                        <p style="margin: 0;"><b>Dates:</b> ${leave.start_date.toDateString()} to ${leave.end_date.toDateString()}</p>
                        <p style="margin: 5px 0 0;"><b>Total Days:</b> ${leave.total_days}</p>
                    </div>
                    <p>Enjoy your time off!</p>
                `
            });
        }

        res.json({ success: true, message: 'Leave approved successfully and employee notified.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/leaves/:id/reject
const rejectLeave = async (req, res) => {
    try {
        const leave = await Leave.findByIdAndUpdate(req.params.id,
            { status: 'rejected', approved_by: req.user.id, approved_date: new Date(), rejection_reason: req.body.rejection_reason },
            { returnDocument: 'after' }
        );
        if (!leave) return res.status(404).json({ success: false, message: 'Leave not found.' });

        // Notify Employee
        const emp = await Employee.findOne({ id: leave.employee_id }).lean();
        const settings = await Setting.findOne().lean();
        const compName = settings?.company_name || process.env.COMPANY_NAME || 'HRMS';
        if (emp?.email) {
            sendEmail({
                to: emp.email,
                subject: `Leave Request Update - ${compName}`,
                html: `
                    <h2 style="color: #ef4444;">❌ Leave Rejected</h2>
                    <p>Hi ${emp.name},</p>
                    <p>Your request for <b>${leave.leave_type} leave</b> (${leave.start_date.toDateString()} to ${leave.end_date.toDateString()}) has been <b>rejected</b>.</p>
                    ${req.body.rejection_reason ? `<p><b>Reason:</b> ${req.body.rejection_reason}</p>` : ''}
                    <p>If you have any questions, please contact the HR department.</p>
                `
            });
        }

        res.json({ success: true, message: 'Leave rejected and employee notified.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getEmployeeLeaves, getPendingLeaves, applyLeave, approveLeave, rejectLeave };
