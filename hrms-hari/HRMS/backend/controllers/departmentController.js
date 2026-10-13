const mongoose = require('mongoose');
const Department = require('../models/Department');
const Employee = require('../models/Employee');

const { normalizeRole } = require('../utils/visibilityHelper');

// GET /api/departments
const getDepartments = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role || '');
        if (!['admin', 'manager', 'team_lead'].includes(callerRole)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to view departments.' });
        }

        const departments = await Department.find().sort({ name: 1 }).lean();


        // Count employees per department
        const counts = await Employee.aggregate([
            { $match: { status: 'active', department_id: { $ne: null } } },
            { $group: { _id: '$department_id', count: { $sum: 1 } } },
        ]);
        const countMap = Object.fromEntries(counts.map(c => [c._id?.toString(), c.count]));

        // Resolve manager and team lead names in batch queries
        const managerIds = [...new Set(departments.map(d => d.manager_id).filter(Boolean))];
        const teamLeadIds = [...new Set(departments.map(d => d.team_lead_id).filter(Boolean))];
        const allStaffIds = [...new Set([...managerIds, ...teamLeadIds])];
        const staff = allStaffIds.length
            ? await Employee.find({ id: { $in: allStaffIds } }).select('id name').lean()
            : [];
        const staffMap = Object.fromEntries(staff.map(m => [m.id, m.name]));

        const result = departments.map(d => ({
            ...d,
            employee_count: countMap[d._id?.toString()] || 0,
            manager_name: d.manager_id ? (staffMap[d.manager_id] || null) : null,
            team_lead_name: d.team_lead_id ? (staffMap[d.team_lead_id] || null) : null,
        }));

        res.json({ success: true, departments: result });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};
// POST /api/departments
const createDepartment = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role || '');
        if (!['admin', 'manager', 'team_lead'].includes(callerRole)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to create departments.' });
        }

        const { name, description, manager_id, team_lead_id } = req.body;
        const existing = await Department.findOne({ name: { $regex: `^${name}$`, $options: 'i' } });
        if (existing) return res.status(400).json({ success: false, message: 'Department with this name already exists.' });

        const dept = await Department.create({ name, description, manager_id, team_lead_id });
        res.status(201).json({ success: true, message: 'Department created.', department: { ...dept.toObject(), employee_count: 0 } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PUT /api/departments/:id
const updateDepartment = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role || '');
        if (!['admin', 'manager'].includes(callerRole)) {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Managers and Super Admins can edit departments.' });
        }

        const { name, description, manager_id, team_lead_id } = req.body;
        const dept = await Department.findByIdAndUpdate(req.params.id, { name, description, manager_id, team_lead_id }, { returnDocument: 'after', runValidators: true });
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
        res.json({ success: true, message: 'Department updated.', department: dept });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// DELETE /api/departments/:id
const deleteDepartment = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role || '');
        if (callerRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can delete departments.' });
        }

        const empCount = await Employee.countDocuments({ department_id: req.params.id });
        if (empCount > 0) {
            return res.status(400).json({ success: false, message: 'Department still has employees assigned. Reassign them first.' });
        }
        const dept = await Department.findByIdAndDelete(req.params.id);
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });
        res.json({ success: true, message: 'Department deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};


// GET /api/departments/:id/employees - Get employees in a department (for managers of that department and Super Admins)
const getDepartmentEmployees = async (req, res) => {
    try {
        const { id } = req.params;
        const loggedInUser = req.user;

        const normalizeRole = (role) => {
            const r = (role || '').toLowerCase().replace(/\s+/g, '');
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
            if (r === 'hr') return 'team_lead';
            return r;
        };

        const requesterRole = normalizeRole(loggedInUser?.role || '');

        // Verify department exists
        const dept = await Department.findById(id).lean();
        if (!dept) return res.status(404).json({ success: false, message: 'Department not found.' });

        // Super Admin can view any department's employees
        if (requesterRole === 'admin') {
            const employees = await Employee.find({ department_id: id, status: 'active' })
                .select('id name email designation role department_id manager_id team_lead_id profile_image date_of_joining')
                .lean();
            return res.json({ success: true, employees });
        }

        // Manager can only view employees in departments they manage
        if (requesterRole === 'manager') {
            const mgrEmp = await Employee.findOne({
                $or: [
                    { id: loggedInUser.id },
                    ...(mongoose.Types.ObjectId.isValid(loggedInUser.id) ? [{ _id: loggedInUser.id }] : []),
                    ...(loggedInUser._id && mongoose.Types.ObjectId.isValid(loggedInUser._id) ? [{ _id: loggedInUser._id }] : [])
                ]
            }).select('id _id').lean();

            const validManagerIds = [loggedInUser.id];
            if (loggedInUser._id) validManagerIds.push(loggedInUser._id.toString());
            if (mgrEmp) {
                if (mgrEmp.id) validManagerIds.push(mgrEmp.id);
                if (mgrEmp._id) validManagerIds.push(mgrEmp._id.toString());
            }

            if (!dept.manager_id || !validManagerIds.includes(dept.manager_id.toString())) {
                return res.status(403).json({ success: false, message: 'Forbidden. You can only view employees in departments you manage.' });
            }
            const employees = await Employee.find({ department_id: id, status: 'active' })
                .select('id name email designation role department_id manager_id team_lead_id profile_image date_of_joining')
                .lean();
            return res.json({ success: true, employees });
        }

        return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins and department managers can view department employees.' });
    } catch (err) {
        console.error('[getDepartmentEmployees]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

module.exports = { getDepartments, createDepartment, updateDepartment, deleteDepartment, getDepartmentEmployees };
