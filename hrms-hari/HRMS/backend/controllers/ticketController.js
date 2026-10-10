const Ticket = require('../models/Ticket');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const { sendEmail } = require('../utils/emailService');
const Setting = require('../models/Setting');

const enrich = async (tickets) => {
    const empIds = [...new Set(tickets.map(t => t.employee_id).concat(tickets.map(t => t.assigned_to).filter(Boolean)))];
    const employees = await Employee.find({ id: { $in: empIds } }).lean();
    const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
    const depts = await Department.find({ _id: { $in: deptIds } }).lean();
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));
    const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

    return tickets.map(t => {
        const emp = empMap[t.employee_id] || {};
        const assignee = t.assigned_to ? empMap[t.assigned_to] : null;
        return {
            ...t,
            employee_name: emp.name || t.employee_id,
            department_name: emp.department_id ? deptMap[emp.department_id.toString()] : null,
            assigned_to_name: assignee?.name || null,
        };
    });
};

// POST /api/tickets/create
const createTicket = async (req, res) => {
    try {
        const { employee_id, subject, description, category, priority } = req.body;
        const ticket = await Ticket.create({ employee_id, subject, description, category, priority });

        // Notify Hr Manager
        const emp = await Employee.findOne({ id: employee_id }).lean();
        const settings = await Setting.findOne().lean();
        const adminEmail = settings?.company_email;

        if (adminEmail) {
            sendEmail({
                to: adminEmail,
                subject: `New Support Ticket: ${subject}`,
                html: `
                    <h2 style="color: #6366f1;">New Support Ticket Raised</h2>
                    <p><b>From:</b> ${emp?.name} (${employee_id})</p>
                    <p><b>Category:</b> ${category}</p>
                    <p><b>Priority:</b> ${priority.toUpperCase()}</p>
                    <p><b>Subject:</b> ${subject}</p>
                    <div style="background: #f8fafc; padding: 15px; border-radius: 8px; border: 1px solid #eee; margin-top: 15px;">
                        <p style="margin: 0;"><b>Description:</b></p>
                        <p style="margin: 5px 0 0; color: #555;">${description}</p>
                    </div>
                `
            });
        }

        res.status(201).json({ success: true, message: 'Support ticket raised successfully. HR notified.', ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/tickets/:employeeId
const getEmployeeTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find({ employee_id: req.params.employeeId }).sort({ createdAt: -1 }).lean();
        const enriched = await enrich(tickets);
        res.json({ success: true, tickets: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/tickets/all
const getAllTickets = async (req, res) => {
    try {
        const { status } = req.query;
        const filter = {};
        if (status) filter.status = status;
        const tickets = await Ticket.find(filter).sort({ createdAt: -1 }).lean();
        const enriched = await enrich(tickets);
        res.json({ success: true, tickets: enriched });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/tickets/:id/update
const updateTicket = async (req, res) => {
    try {
        const { status, assigned_to } = req.body;
        const update = {};
        if (status) update.status = status;
        if (assigned_to) update.assigned_to = assigned_to;
        const ticket = await Ticket.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
        if (!ticket) return res.status(404).json({ success: false, message: 'Ticket not found.' });

        // Notify Employee if status changed
        const emp = await Employee.findOne({ id: ticket.employee_id }).lean();
        if (emp?.email) {
            let statusColor = '#6366f1';
            let statusText = ticket.status.toUpperCase();
            if (ticket.status === 'resolved') statusColor = '#10b981';
            if (ticket.status === 'closed') statusColor = '#64748b';

            sendEmail({
                to: emp.email,
                subject: `Support Ticket Update: ${ticket.subject}`,
                html: `
                    <h2 style="color: ${statusColor};">Ticket Status: ${statusText}</h2>
                    <p>Hi ${emp.name},</p>
                    <p>There is an update on your support ticket <b>#${ticket._id.toString().slice(-6)}</b>.</p>
                    <p><b>Subject:</b> ${ticket.subject}</p>
                    <p><b>New Status:</b> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
                    <hr />
                    <p>Thank you for your patience.</p>
                `
            });
        }

        res.json({ success: true, message: 'Ticket updated and employee notified.', ticket });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = { createTicket, getEmployeeTickets, getAllTickets, updateTicket };
