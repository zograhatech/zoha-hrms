const Employee = require('../models/Employee');
const VerificationRequest = require('../models/VerificationRequest');
const Resignation = require('../models/Resignation');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');


exports.requestVerification = async (req, res) => {
    const { employeeId, requestorName, requestorEmail, requestorCompany } = req.body;
    try {
        // Find employee by ID
        const employee = await Employee.findOne({ id: employeeId.toUpperCase().trim() });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Avoid duplicate pending requests from same company for same email
        const existing = await VerificationRequest.findOne({
            employee_id: employee.id,
            requestor_company: requestorCompany,
            status: 'pending'
        });
        if (existing) return res.status(400).json({ success: false, message: 'A pending request already exists for this employee.' });

        const request = await VerificationRequest.create({
            employee_id: employee.id,
            requestor_name: requestorName,
            requestor_email: requestorEmail,
            requestor_company: requestorCompany
        });

        res.status(201).json({ success: true, message: 'Consent request sent to ex-employee.', requestId: request._id });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getMyRequests = async (req, res) => {
    try {
        const requests = await VerificationRequest.find({ employee_id: req.user.id }).sort('-createdAt');
        res.json({ success: true, requests });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.respondToRequest = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // 'approved' or 'rejected'
    try {
        const request = await VerificationRequest.findById(id);
        if (!request || request.employee_id !== req.user.id) {
            return res.status(404).json({ success: false, message: 'Request not found.' });
        }

        request.status = status;
        if (status === 'approved') request.approved_at = new Date();
        else request.rejected_at = new Date();
        await request.save();

        res.json({ success: true, message: `Request ${status} successfully.` });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getVerifiedData = async (req, res) => {
    const { id } = req.params;
    try {
        const request = await VerificationRequest.findById(id);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
        
        if (request.status !== 'approved') {
            return res.json({ 
                success: false, 
                message: 'Verification is currently ' + request.status,
                status: request.status
            });
        }

        // Fetch ex-employee data
        const employee = await Employee.findOne({ id: request.employee_id });
        if (!employee) return res.status(404).json({ success: false, message: 'Employee records no longer exist.' });

        const resignation = await Resignation.findOne({ employee: employee._id, status: 'approved' }).sort('-createdAt');
        const leaves = await Leave.find({ employee_id: employee.id }).sort('-createdAt');
        const payrolls = await Payroll.find({ employee_id: employee.id }).sort('-year -month');

        // Subset of verified data
        const verifiedData = {
            name: employee.name,
            employee_id: employee.id,
            designation: employee.designation,
            department: employee.department_id,
            joining_date: employee.date_of_joining,
            exit_date: resignation ? resignation.last_working_day : null,
            email: employee.email,
            phone: employee.phone,
            address: employee.address || 'N/A',
            status: employee.status,
            documents: resignation ? (resignation.documents || []).map(d => ({ _id: d._id, name: d.name })) : [],
            resignation_id: resignation ? resignation._id : null,
            verification_id: request._id,
            verified_at: request.approved_at,
            company: request.requestor_company,
            leaves: leaves.map(l => ({
                id: l._id,
                type: l.leave_type,
                from: l.from_date,
                to: l.to_date,
                status: l.status,
                days: l.duration
            })),
            payrolls: payrolls.map(p => ({
                id: p._id,
                month: p.month,
                year: p.year,
                net_salary: p.net_salary,
                status: p.status
            }))
        };


        res.json({ success: true, data: verifiedData });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
