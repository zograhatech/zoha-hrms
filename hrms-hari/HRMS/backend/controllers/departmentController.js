const mongoose = require('mongoose');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const { normalizeRole } = require('../utils/visibilityHelper');

// GET /api/departments
const getDepartments = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
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
        console.error('[getDepartments]', err);
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
        const cleanName = (name || '').trim();
        if (!cleanName) {
            return res.status(400).json({ success: false, message: 'Department name is required.' });
        }

        const existing = await Department.findOne({ name: { $regex: `^${cleanName}$`, $options: 'i' } });
        if (existing) return res.status(400).json({ success: false, message: 'Department with this name already exists.' });

        const dept = await Department.create({ name: cleanName, description, manager_id, team_lead_id });

        const callerUserId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)) 
            ? req.user._id 
            : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

        if (callerUserId) {
            try {
                await AuditLog.create({
                    user_id: callerUserId,
                    action: 'CREATE',
                    resource: 'department',
                    resource_id: dept._id,
                    new_value: { name: dept.name, description, manager_id },
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            } catch (auditErr) {
                console.error('[createDepartment audit error]', auditErr.message);
            }
        }

        res.status(201).json({ success: true, message: 'Department created.', department: { ...dept.toObject(), employee_count: 0 } });
    } catch (err) {
        console.error('[createDepartment]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// PUT /api/departments/:id
const updateDepartment = async (req, res) => {
    try {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        const callerRole = normalizeRole(req.user?.role || '');
        if (!['admin', 'manager'].includes(callerRole)) {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Managers and Super Admins can edit departments.' });
        }

        const oldDept = await Department.findById(req.params.id);
        if (!oldDept) return res.status(404).json({ success: false, message: 'Department not found.' });

        const { name, description, manager_id, team_lead_id } = req.body;
        const cleanName = (name || '').trim();
        if (!cleanName) {
            return res.status(400).json({ success: false, message: 'Department name is required.' });
        }

        const dept = await Department.findByIdAndUpdate(
            req.params.id, 
            { name: cleanName, description, manager_id, team_lead_id }, 
            { returnDocument: 'after', runValidators: true }
        );

        const callerUserId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)) 
            ? req.user._id 
            : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

        if (callerUserId) {
            try {
                await AuditLog.create({
                    user_id: callerUserId,
                    action: 'UPDATE',
                    resource: 'department',
                    resource_id: dept._id,
                    old_value: { name: oldDept.name, manager_id: oldDept.manager_id },
                    new_value: { name: dept.name, manager_id: dept.manager_id },
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            } catch (auditErr) {
                console.error('[updateDepartment audit error]', auditErr.message);
            }
        }

        // Notify assigned manager if set or changed
        const adminName = req.user?.name || 'Super Admin';
        if (dept.manager_id && dept.manager_id !== oldDept.manager_id) {
            try {
                const mgrEmp = await Employee.findOne({ id: dept.manager_id }).select('_id');
                if (mgrEmp) {
                    await Notification.create({
                        recipient: mgrEmp._id,
                        sender: callerUserId,
                        type: 'admin_update',
                        title: 'Department Assigned',
                        message: `You have been assigned as Manager for "${dept.name}" by ${adminName}.`,
                        data: { field: 'department_manager', status: 'updated' }
                    });
                }
            } catch (notifErr) {
                console.error('[updateDepartment notification error]', notifErr.message);
            }
        }

        res.json({ success: true, message: 'Department updated.', department: dept });
    } catch (err) {
        console.error('[updateDepartment]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
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

        const callerUserId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id)) 
            ? req.user._id 
            : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

        if (callerUserId) {
            try {
                await AuditLog.create({
                    user_id: callerUserId,
                    action: 'DELETE',
                    resource: 'department',
                    resource_id: dept._id,
                    old_value: { name: dept.name },
                    ip_address: req.ip || req.connection?.remoteAddress,
                    user_agent: req.get('user-agent')
                });
            } catch (auditErr) {
                console.error('[deleteDepartment audit error]', auditErr.message);
            }
        }

        res.json({ success: true, message: 'Department deleted.' });
    } catch (err) {
        console.error('[deleteDepartment]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/departments/:id/employees - Get employees in a department
const getDepartmentEmployees = async (req, res) => {
    try {
        const { id } = req.params;
        const loggedInUser = req.user;

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

        return res.status(403).json({ success: false, message: 'Forbidden.' });
    } catch (err) {
        console.error('[getDepartmentEmployees]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

module.exports = {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getDepartmentEmployees
};
