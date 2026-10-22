const mongoose = require('mongoose');
const Leave = require('../models/Leave');
const LeaveBalance = require('../models/LeaveBalance');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const Setting = require('../models/Setting');

const normalizeRole = (role) => {
    const r = (role || '').toLowerCase().replace(/\s+/g, '');
    if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
    if (r === 'hr') return 'team_lead';
    return r;
};

const checkLeaveApprovalAuth = async (applicantId, approverUser) => {
    const [applicant, approver] = await Promise.all([
        Employee.findOne({ id: applicantId }).lean(),
        Employee.findOne({ id: approverUser.id }).lean()
    ]);

    const applicantRole = normalizeRole(applicant?.role || 'employee');
    const approverRole = normalizeRole(approver?.role || approverUser.role || 'employee');
    const approverEmpId = approver?.id || approverUser.id;

    if (applicantRole === 'admin') {
        const otherAdmins = await Employee.countDocuments({
            role: 'admin',
            status: 'active',
            id: { $ne: applicantId }
        });
        if (otherAdmins === 0) {
            return { allowed: false, status: 400, message: 'No other Super Admin is available to approve this leave.' };
        }
        if (approverRole !== 'admin' || approverEmpId === applicantId) {
            return { allowed: false, status: 403, message: 'Only another Super Admin can approve this leave.' };
        }
        return { allowed: true };
    }

    if (approverEmpId === applicantId) {
        return { allowed: false, status: 403, message: 'You cannot approve your own leave.' };
    }

    if (applicantRole === 'manager') {
        if (approverRole !== 'admin') {
            return { allowed: false, status: 403, message: 'Only a Super Admin can approve a Manager\'s leave.' };
        }
        return { allowed: true };
    }

    if (applicantRole === 'team_lead') {
        if (['manager', 'admin'].includes(approverRole)) {
            return { allowed: true };
        }
        return { allowed: false, status: 403, message: 'A Team Lead cannot approve a Team Lead\'s leave.' };
    }

    // applicantRole === 'employee'
    if (['team_lead', 'manager', 'admin'].includes(approverRole)) {
        return { allowed: true };
    }

    return { allowed: false, status: 403, message: 'You are not authorized to approve this leave.' };
};

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
        const applicantId = employee_id || req.user?.id;

        // Only allow "sick" leave type
        if (leave_type !== 'sick') {
            return res.status(400).json({ success: false, message: 'Only sick leave applications are allowed.' });
        }

        const applicantEmp = await Employee.findOne({ id: applicantId }).lean();
        const applicantRole = normalizeRole(applicantEmp?.role || 'employee');
        if (applicantRole === 'admin') {
            const otherAdmins = await Employee.countDocuments({
                role: 'admin',
                status: 'active',
                id: { $ne: applicantId }
            });
            if (otherAdmins === 0) {
                return res.status(400).json({ success: false, message: 'No other Super Admin is available to approve this leave.' });
            }
        }

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

        // Check overlap - only count pending and approved
        const overlap = await Leave.findOne({
            employee_id: applicantId,
            status: { $ne: 'rejected' },
            $or: [
                { start_date: { $lte: end }, end_date: { $gte: start } },
            ],
        });
        if (overlap) return res.status(400).json({ success: false, message: 'You already have a leave request for overlapping dates.' });

        const leave = await Leave.create({ employee_id: applicantId, leave_type, start_date: start, end_date: end, total_days: days, reason });

        // Create notifications for manager, team lead, and Super Admins
        const applicant = await Employee.findOne({ id: applicantId }).lean();
        const recipientMap = new Map();

        // Get manager's ObjectId (resolves string id or ObjectId)
        if (applicant?.manager_id) {
            const mgr = await Employee.findOne({
                $or: [
                    { id: applicant.manager_id },
                    ...(mongoose.Types.ObjectId.isValid(applicant.manager_id) ? [{ _id: applicant.manager_id }] : [])
                ]
            }).select('_id status').lean();
            if (mgr && mgr.status !== 'inactive' && mgr.status !== 'terminated') {
                recipientMap.set(mgr._id.toString(), mgr._id);
            }
        }
        // Get team lead's ObjectId (resolves string id or ObjectId)
        if (applicant?.team_lead_id) {
            const tl = await Employee.findOne({
                $or: [
                    { id: applicant.team_lead_id },
                    ...(mongoose.Types.ObjectId.isValid(applicant.team_lead_id) ? [{ _id: applicant.team_lead_id }] : [])
                ]
            }).select('_id status').lean();
            if (tl && tl.status !== 'inactive' && tl.status !== 'terminated') {
                recipientMap.set(tl._id.toString(), tl._id);
            }
        }

        // Add all active Super Admins' ObjectIds
        const superAdmins = await Employee.find({ role: 'admin', status: 'active' }).select('_id').lean();
        superAdmins.forEach(a => recipientMap.set(a._id.toString(), a._id));

        // Don't notify the applicant
        if (applicant?._id) {
            recipientMap.delete(applicant._id.toString());
        }

        // Create notifications
        const notifications = Array.from(recipientMap.values()).map(recipientObjectId => ({
            recipient: recipientObjectId,
            sender: applicant?._id || null,
            type: 'leave',
            title: 'New Sick Leave Application',
            message: `${applicant?.name || applicantId} has applied for sick leave from ${start_date} to ${end_date} (${days} day(s)).`,
            data: { leaveId: leave._id.toString() }
        }));

        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }

        // Notify Hr Manager/HR via email
        const settings = await Setting.findOne().lean();
        const adminEmail = settings?.company_email;

        if (adminEmail) {
            sendEmail({
                to: adminEmail,
                subject: `New Sick Leave Application: ${applicant?.name || applicantId}`,
                html: `
                    <h2 style="color: #6366f1;">New Sick Leave Request</h2>
                    <p><b>Employee:</b> ${applicant?.name} (${applicantId})</p>
                    <p><b>Type:</b> Sick Leave</p>
                    <p><b>Duration:</b> ${start_date} to ${end_date} (${days} days)</p>
                    <p><b>Reason:</b> ${reason}</p>
                    <hr />
                    <p>Please log in to the HRMS portal to take action.</p>
                `
            });
        }

        res.status(201).json({ success: true, message: 'Sick leave application submitted successfully. Approvers notified.', leave });
    } catch (err) {
        console.error('[applyLeave]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/leaves/:id/approve
const approveLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ success: false, message: 'Leave not found.' });
        if (leave.status !== 'pending') return res.status(400).json({ success: false, message: 'Leave is not pending.' });

        const authCheck = await checkLeaveApprovalAuth(leave.employee_id, req.user);
        if (!authCheck.allowed) {
            return res.status(authCheck.status || 403).json({ success: false, message: authCheck.message });
        }

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

        if (emp?._id) {
            try {
                const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                    ? req.user._id
                    : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);
                await Notification.create({
                    recipient: emp._id,
                    sender: senderId,
                    type: 'leave',
                    title: 'Leave Request Approved',
                    message: `Your request for ${leave.leave_type} leave (${leave.start_date.toDateString()} to ${leave.end_date.toDateString()}) has been approved.`,
                    data: { leaveId: leave._id.toString(), status: 'approved' }
                });
            } catch (notifErr) {
                console.error('[approveLeave] In-app notification error:', notifErr.message);
            }
        }

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
            }).catch(e => console.error('[approveLeave] email error:', e.message));
        }

        res.json({ success: true, message: 'Leave approved successfully and employee notified.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/leaves/:id/reject
const rejectLeave = async (req, res) => {
    try {
        const leave = await Leave.findById(req.params.id);
        if (!leave) return res.status(404).json({ success: false, message: 'Leave not found.' });
        if (leave.status !== 'pending') return res.status(400).json({ success: false, message: 'Leave is not pending.' });

        const authCheck = await checkLeaveApprovalAuth(leave.employee_id, req.user);
        if (!authCheck.allowed) {
            return res.status(authCheck.status || 403).json({ success: false, message: authCheck.message });
        }

        leave.status = 'rejected';
        leave.approved_by = req.user.id;
        leave.approved_date = new Date();
        leave.rejection_reason = req.body.rejection_reason;
        await leave.save();

        // Notify Employee
        const emp = await Employee.findOne({ id: leave.employee_id }).lean();
        const settings = await Setting.findOne().lean();
        const compName = settings?.company_name || process.env.COMPANY_NAME || 'HRMS';

        if (emp?._id) {
            try {
                const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                    ? req.user._id
                    : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);
                await Notification.create({
                    recipient: emp._id,
                    sender: senderId,
                    type: 'leave',
                    title: 'Leave Request Rejected',
                    message: `Your request for ${leave.leave_type} leave (${leave.start_date.toDateString()} to ${leave.end_date.toDateString()}) has been rejected.${req.body.rejection_reason ? ' Reason: ' + req.body.rejection_reason : ''}`,
                    data: { leaveId: leave._id.toString(), status: 'rejected' }
                });
            } catch (notifErr) {
                console.error('[rejectLeave] In-app notification error:', notifErr.message);
            }
        }

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
            }).catch(e => console.error('[rejectLeave] email error:', e.message));
        }

        res.json({ success: true, message: 'Leave rejected and employee notified.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { getEmployeeLeaves, getPendingLeaves, applyLeave, approveLeave, rejectLeave };
