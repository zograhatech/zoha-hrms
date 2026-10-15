const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/emailService');
const LeaveBalance = require('../models/LeaveBalance');
const Leave = require('../models/Leave');
const Holiday = require('../models/Holiday');
const Setting = require('../models/Setting');
const Notification = require('../models/Notification');
const XLSX = require('xlsx');
const { getVisibleEmployeeScope } = require('../utils/visibilityHelper');
const { toISTDateString, getISTDayStart, getISTDayEnd } = require('../utils/istDate');

// Helper to populate department name into employee object
const withDeptName = async (emp) => {
    const obj = emp.toObject ? emp.toObject() : emp;
    if (obj.department_id) {
        const dept = await Department.findById(obj.department_id).select('name');
        obj.department_name = dept?.name || null;
    } else {
        obj.department_name = null;
    }
    delete obj.password_hash;
    return obj;
};

// GET /api/employees
const getEmployees = async (req, res) => {
    try {
        const { status, search, department, role, page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (status) filter.status = status;
        if (department) filter.department_id = department;
        if (role) {
            // Map legacy roles if needed
            const rLower = role.toLowerCase().replace(/\s+/g, '');
            if (['manager', 'hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(rLower)) {
                filter.role = { $in: ['manager', 'hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'] };
            } else if (['team_lead', 'hr'].includes(rLower)) {
                filter.role = { $in: ['team_lead', 'hr'] };
            } else {
                filter.role = rLower;
            }
        }

        // Apply visibility scoping for calling user if authenticated
        if (req.user) {
            const scope = await getVisibleEmployeeScope(req.user);
            if (!scope.isAll) {
                filter.id = { $in: scope.visibleIds };
            }
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { id: { $regex: search, $options: 'i' } },
            ];
        }


        // Project only necessary fields for performance
        const projection = {
            _id: 1, id: 1, name: 1, email: 1, designation: 1, department_id: 1,
            profile_image: 1, role: 1, status: 1, permissions: 1, 
            date_of_joining: 1, salary_details: 1
        };

        const total = await Employee.countDocuments(filter);
        const employees = await Employee.find(filter, projection)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).select('name').lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        const result = employees.map(e => ({
            ...e,
            department_name: e.department_id ? deptMap[e.department_id.toString()] : null
        }));

        res.json({ 
            success: true, 
            employees: result,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / parseInt(limit))
            }
        });
    } catch (err) {
        console.error('[getEmployees]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// GET /api/employee/:id
const getEmployee = async (req, res) => {
    try {
        const emp = await Employee.findOne({
            $or: [
                { id: req.params.id },
                ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])
            ]
        }).lean();
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Group 4: Managers cannot view a Super Admin. Attempts return HTTP 403.
        const requesterRole = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
        const isSelf = req.user?.id === emp.id || req.user?._id?.toString() === emp._id?.toString();
        if (emp.role === 'admin' && requesterRole !== 'admin' && !isSelf) {
            return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot view a Super Admin.' });
        }

        let department_name = null;
        if (emp.department_id) {
            const dept = await Department.findById(emp.department_id).select('name');
            department_name = dept?.name || null;
        }
        const { password_hash, ...rest } = emp;
        res.json({ success: true, employee: { ...rest, department_name } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/employee
const createEmployee = async (req, res) => {
    try {
        const settings = await Setting.findOne();

        const {
            id, name, email, password, role, department_id, shift_id, manager_id, phone, designation,
            date_of_joining, date_of_birth, gender, address, pan, uan, pf_account_no, salary_details
        } = req.body;

        if (!id || !String(id).trim()) {
            return res.status(400).json({ success: false, message: 'Employee ID is required.' });
        }
        if (!name || !String(name).trim()) {
            return res.status(400).json({ success: false, message: 'Full name is required.' });
        }
        if (!email || !String(email).trim()) {
            return res.status(400).json({ success: false, message: 'Email is required.' });
        }

        const emailLower = String(email).toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailLower)) {
            return res.status(400).json({ success: false, message: 'Invalid email format.' });
        }

        if (!password || !String(password).trim()) {
            return res.status(400).json({ success: false, message: 'Password is required' });
        }

        // Phone: digits only, 10 to 15 characters, optional
        if (phone && String(phone).trim()) {
            const phoneClean = String(phone).trim();
            if (!/^\d{10,15}$/.test(phoneClean)) {
                return res.status(400).json({ success: false, message: 'Phone must be between 10 and 15 digits.' });
            }
        }

        // PAN: 10 chars AAAAA9999A, optional
        if (pan && String(pan).trim()) {
            const panClean = String(pan).trim().toUpperCase();
            if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panClean)) {
                return res.status(400).json({ success: false, message: 'PAN must be in format AAAAA9999A.' });
            }
        }

        // UAN: 12 digits, optional
        if (uan && String(uan).trim()) {
            const uanClean = String(uan).trim();
            if (!/^\d{12}$/.test(uanClean)) {
                return res.status(400).json({ success: false, message: 'UAN must be exactly 12 digits.' });
            }
        }

        // Date fields: DOB must be strictly before Joining Date
        if (date_of_birth && date_of_joining) {
            const dob = new Date(date_of_birth);
            const doj = new Date(date_of_joining);
            if (dob >= doj) {
                return res.status(400).json({ success: false, message: 'Date of birth must be before joining date.' });
            }
        }

        // Salary fields: numbers only, default 0, never negative
        if (salary_details && typeof salary_details === 'object') {
            for (const [key, val] of Object.entries(salary_details)) {
                if (['bank_ac_no', 'bank_ifsc_code', 'bank_name'].includes(key)) continue;
                if (val !== undefined && val !== null && val !== '') {
                    const numVal = Number(val);
                    if (isNaN(numVal) || numVal < 0) {
                        return res.status(400).json({ success: false, message: `Salary field ${key} cannot be negative.` });
                    }
                }
            }
        }

        // Role: strictly supported 4 roles (mapping legacy roles before validation)
        const allowedRoles = ['admin', 'manager', 'team_lead', 'employee'];
        let targetRole = role !== undefined ? String(role).toLowerCase().trim() : undefined;
        if (targetRole) {
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(targetRole)) {
                targetRole = 'manager';
            } else if (targetRole === 'hr') {
                targetRole = 'team_lead';
            }
            if (!allowedRoles.includes(targetRole)) {
                return res.status(400).json({ success: false, message: 'Invalid role specified. Allowed roles: admin, manager, team_lead, employee.' });
            }
        } else {
            targetRole = 'employee';
        }

        // Role hierarchy creation checks
        const reqRole = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
        const normReqRole = (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(reqRole)) ? 'manager' : (reqRole === 'hr' ? 'team_lead' : reqRole);

        if (normReqRole === 'team_lead' && targetRole !== 'employee') {
            return res.status(403).json({ success: false, message: 'Forbidden. Team Leads can create employees only.' });
        }
        if (normReqRole !== 'admin' && targetRole === 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can create a Super Admin.' });
        }

        const existing = await Employee.findOne({ $or: [{ id: String(id).trim().toUpperCase() }, { email: emailLower }] });
        if (existing) return res.status(400).json({ success: false, message: 'Employee ID or email already exists.' });

        const password_hash = await bcrypt.hash(password, 10);
        const employee = await Employee.create({
            id: String(id).trim().toUpperCase(),
            name: String(name).trim(),
            email: emailLower,
            password_hash,
            role: targetRole,
            department_id: department_id || null,
            shift_id: shift_id || null,
            manager_id: manager_id || null,
            phone: phone ? String(phone).trim() : undefined,
            designation: designation ? String(designation).trim() : undefined,
            date_of_joining: date_of_joining || undefined,
            date_of_birth: date_of_birth || undefined,
            gender: gender || undefined,
            address: address ? String(address).trim() : undefined,
            pan: pan ? String(pan).trim().toUpperCase() : undefined,
            uan: uan ? String(uan).trim() : undefined,
            pf_account_no: pf_account_no ? String(pf_account_no).trim() : undefined,
            salary_details: salary_details || undefined
        });

        // Initialize Leave Balance from Global Settings
        try {
            const policies = settings?.leave_policies || {
                casual_leave: 12,
                sick_leave: 12,
                earned_leave: 15,
                maternity_leave: 0,
                paternity_leave: 0
            };

            await LeaveBalance.create({
                employee_id: employee.id,
                year: new Date().getFullYear(),
                ...policies
            });
        } catch (balErr) {
            console.error('Failed to initialize leave balance:', balErr);
        }

        const { password_hash: _, ...rest } = employee.toObject();
        const companyName = settings?.company_name || process.env.COMPANY_NAME || 'HRMS';

        // Send Welcome Email
        sendEmail({
            to: emailLower,
            subject: `Welcome to ${companyName} - Your Login Credentials`,
            html: `
                <h2 style="color: #6366f1;">Welcome to the Team, ${name}!</h2>
                <p>An account has been created for you on the <b>${companyName} Portal</b>.</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                    <p style="margin: 0;"><b>Login URL:</b> <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Click here to Sign In</a></p>
                    <p style="margin: 10px 0 0;"><b>Employee ID:</b> ${id}</p>
                    <p style="margin: 5px 0 0;"><b>Password:</b> ${password}</p>
                </div>
                <p>Please log in and update your profile and password immediately.</p>
            `
        });

        // Send Welcome Notification
        try {
            const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                ? req.user._id
                : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);
            await Notification.create({
                recipient: employee._id,
                sender: senderId,
                type: 'general',
                title: 'Welcome to Zograha Technologies',
                message: `Your employee account has been created. Your ID is ${employee.id}.`,
                data: { status: 'created' }
            });
        } catch (notifErr) {
            console.error('[createEmployee] Welcome notification error:', notifErr.message);
        }

        res.status(201).json({ success: true, message: 'Employee created successfully. Welcome email sent.', employee: rest });
    } catch (err) {
        console.error('[createEmployee]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// PUT /api/employee/:id
const updateEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const loggedInUser = req.user;

        // Fetch settings for dynamic permissions
        const settings = await Setting.findOne();
        const roleClean = (loggedInUser.role || '').toLowerCase().replace(/\s+/g, '');
        const normalizeRole = (role) => {
            const r = (role || '').toLowerCase().replace(/\s+/g, '');
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
            if (r === 'hr') return 'team_lead';
            return r;
        };
        const normalizedUserRole = normalizeRole(roleClean);
        const userPerms = settings?.roles_permissions?.[normalizedUserRole] || settings?.roles_permissions?.[loggedInUser.role] || [];

        const isManager = ['admin', 'manager'].includes(normalizedUserRole);
        const isTeamLead = normalizedUserRole === 'team_lead';
        const canManage = isManager || isTeamLead || userPerms.includes('manage_employees');
        const isSelf = loggedInUser.id === id || loggedInUser._id?.toString() === id;

        if (!canManage && !isSelf) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only update your own profile.' });
        }

        const targetEmp = await Employee.findOne({
            $or: [{ id: id }, ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])]
        });
        if (!targetEmp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        const targetNormRole = normalizeRole(targetEmp.role);

        // 1. Role Whitelist check: map legacy values before validation
        if (req.body.role !== undefined) {
            let requestedRole = String(req.body.role).toLowerCase().trim();
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(requestedRole)) {
                requestedRole = 'manager';
            } else if (requestedRole === 'hr') {
                requestedRole = 'team_lead';
            }
            req.body.role = requestedRole;

            const allowedRoles = ['admin', 'manager', 'team_lead', 'employee'];
            if (!allowedRoles.includes(requestedRole)) {
                return res.status(400).json({ success: false, message: 'Invalid role specified. Allowed roles: admin, manager, team_lead, employee.' });
            }
            // 2. Manager cannot grant admin: only Super Admins can set role admin
            if (requestedRole === 'admin' && normalizedUserRole !== 'admin') {
                return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can assign the Super Admin role.' });
            }
        }

        // 4 & 6. Hierarchy checks apply regardless of permissions:
        // Non-Super-Admins cannot edit a Super Admin
        if (targetNormRole === 'admin' && normalizedUserRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot edit Super Admins.' });
        }

        // 3. Team Leads can edit employees only (self-edit excluded so TL can update their own profile)
        if (normalizedUserRole === 'team_lead' && !isSelf) {
            if (targetNormRole !== 'employee') {
                return res.status(403).json({ success: false, message: 'Forbidden. Team Leads can edit employees only.' });
            }
        }

        // Deactivation / Termination rules (same as delete)
        const requestedStatus = req.body.status !== undefined ? String(req.body.status).toLowerCase().trim() : undefined;
        const isDeactivating = requestedStatus !== undefined && ['inactive', 'terminated'].includes(requestedStatus);

        if (isDeactivating) {
            // Team Lead cannot deactivate anyone
            if (normalizedUserRole === 'team_lead') {
                return res.status(403).json({ success: false, message: 'Forbidden. Team Leads cannot deactivate employees.' });
            }
            // Manager cannot deactivate another manager
            if (normalizedUserRole === 'manager' && targetNormRole === 'manager') {
                return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot deactivate other managers.' });
            }
            // Manager cannot deactivate a Super Admin
            if (normalizedUserRole === 'manager' && targetNormRole === 'admin') {
                return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot edit Super Admins.' });
            }
            // Non-admin, non-manager callers cannot deactivate
            if (!['admin', 'manager'].includes(normalizedUserRole)) {
                return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to deactivate employees.' });
            }
        }

        // 5. Always keep at least one active Super Admin.
        // Triggers when status changes away from active or role changes away from admin on an active admin
        if (targetNormRole === 'admin' && targetEmp.status === 'active') {
            const requestedRole = req.body.role !== undefined ? String(req.body.role).toLowerCase().trim() : undefined;
            const isDemoting = requestedRole !== undefined && requestedRole !== 'admin';
            if (isDemoting || isDeactivating) {
                const otherActiveAdmins = await Employee.countDocuments({ role: 'admin', status: 'active', _id: { $ne: targetEmp._id } });
                if (otherActiveAdmins === 0) {
                    return res.status(400).json({ success: false, message: 'At least one Super Admin must exist.' });
                }
            }
        }

        let updateFields = {};
        if (canManage) {
            // Full update allowed for admins/managers
            const {
                name, phone, designation, department_id, date_of_joining,
                date_of_birth, gender, address, status, role, shift_id,
                manager_id, pan, uan, pf_account_no, salary_details, password,
                permissions
            } = req.body;

            // Security: Only high-level managers can set Individual Module Access overrides
            const isManagerRole = ['admin', 'manager', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleClean);
            
            if (permissions !== undefined && !isManagerRole) {
                return res.status(403).json({ success: false, message: 'Only HR Managers can grant individual module access.' });
            }

            // Validations
            if (phone && String(phone).trim()) {
                const phoneClean = String(phone).trim();
                if (!/^\d{10,15}$/.test(phoneClean)) {
                    return res.status(400).json({ success: false, message: 'Phone must be between 10 and 15 digits.' });
                }
            }
            if (pan && String(pan).trim()) {
                const panClean = String(pan).trim().toUpperCase();
                if (!/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(panClean)) {
                    return res.status(400).json({ success: false, message: 'PAN must be in format AAAAA9999A.' });
                }
            }
            if (uan && String(uan).trim()) {
                const uanClean = String(uan).trim();
                if (!/^\d{12}$/.test(uanClean)) {
                    return res.status(400).json({ success: false, message: 'UAN must be exactly 12 digits.' });
                }
            }
            if (date_of_birth && date_of_joining) {
                const dob = new Date(date_of_birth);
                const doj = new Date(date_of_joining);
                if (dob >= doj) {
                    return res.status(400).json({ success: false, message: 'Date of birth must be before joining date.' });
                }
            }
            if (salary_details && typeof salary_details === 'object') {
                for (const [key, val] of Object.entries(salary_details)) {
                    if (['bank_ac_no', 'bank_ifsc_code', 'bank_name'].includes(key)) continue;
                    if (val !== undefined && val !== null && val !== '') {
                        const numVal = Number(val);
                        if (isNaN(numVal) || numVal < 0) {
                            return res.status(400).json({ success: false, message: `Salary field ${key} cannot be negative.` });
                        }
                    }
                }
            }

            updateFields = {
                name, phone, designation: designation || undefined,
                department_id: department_id !== undefined ? (department_id || null) : undefined,
                shift_id: shift_id !== undefined ? (shift_id || null) : undefined,
                manager_id: manager_id !== undefined ? (manager_id || null) : undefined,
                role: role !== undefined ? String(role).toLowerCase().trim() : undefined,
                status, gender, address,
                pan, uan, pf_account_no,
                date_of_joining: date_of_joining || undefined,
                date_of_birth: date_of_birth || undefined,
                salary_details: salary_details || undefined,
                permissions: permissions === undefined ? undefined : permissions
            };

            if (password && password.trim()) {
                const salt = await bcrypt.genSalt(10);
                updateFields.password_hash = await bcrypt.hash(password, salt);
            }

            // Remove undefined fields
            Object.keys(updateFields).forEach(key => {
                if (updateFields[key] === undefined) delete updateFields[key];
            });
        } else {
            // Restricted update for employees (self only)
            const { phone, gender, address, password } = req.body;
            updateFields = { phone, gender, address };
            if (password && password.trim()) {
                const salt = await bcrypt.genSalt(10);
                updateFields.password_hash = await bcrypt.hash(password, salt);
            }
        }

        if (req.file) {
            const b64 = req.file.buffer.toString('base64');
            updateFields.profile_image = `data:${req.file.mimetype};base64,${b64}`;
        }

        const emp = await Employee.findOneAndUpdate(
            { _id: targetEmp._id },
            updateFields,
            { returnDocument: 'after', runValidators: true }
        ).select('-password_hash');

        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // If role was changed, save an in-app notification to the employee
        if (targetEmp.role !== emp.role) {
            try {
                const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                    ? req.user._id
                    : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);
                await Notification.create({
                    recipient: emp._id,
                    sender: senderId,
                    type: 'general',
                    title: 'Role Updated',
                    message: `Your role has been changed from ${targetEmp.role} to ${emp.role}.`,
                    data: { status: emp.role }
                });
            } catch (notifErr) {
                console.error('[updateEmployee] Role change notification error:', notifErr.message);
            }
        }

        // If department was changed, save an in-app notification to the employee
        const storedDeptId = targetEmp.department_id ? String(targetEmp.department_id) : '';
        const incomingDeptId = req.body.department_id !== undefined ? (req.body.department_id ? String(req.body.department_id) : '') : storedDeptId;

        if (req.body.department_id !== undefined && incomingDeptId !== storedDeptId) {
            try {
                let oldDeptName = 'Unassigned';
                let newDeptName = 'Unassigned';

                if (storedDeptId) {
                    const oldDept = mongoose.Types.ObjectId.isValid(storedDeptId)
                        ? await Department.findById(storedDeptId).select('name').lean()
                        : await Department.findOne({ name: storedDeptId }).select('name').lean();
                    if (oldDept?.name) oldDeptName = oldDept.name;
                }
                if (incomingDeptId) {
                    const newDept = mongoose.Types.ObjectId.isValid(incomingDeptId)
                        ? await Department.findById(incomingDeptId).select('name').lean()
                        : await Department.findOne({ name: incomingDeptId }).select('name').lean();
                    if (newDept?.name) newDeptName = newDept.name;
                }

                const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                    ? req.user._id
                    : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

                await Notification.create({
                    recipient: emp._id,
                    sender: senderId,
                    type: 'general',
                    title: 'Department Updated',
                    message: `Your department has been changed from ${oldDeptName} to ${newDeptName}.`,
                    data: { status: 'updated' }
                });
            } catch (notifErr) {
                console.error('[updateEmployee] Department change notification error:', notifErr.message);
            }
        }

        res.json({ success: true, message: 'Employee updated successfully.', employee: emp });
    } catch (err) {
        console.error('[updateEmployee]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// DELETE /api/employee/:id
const deleteEmployee = async (req, res) => {
    try {
        const emp = await Employee.findOne({
            $or: [{ id: req.params.id }, ...(mongoose.Types.ObjectId.isValid(req.params.id) ? [{ _id: req.params.id }] : [])]
        });
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        const requesterRole = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
        const normalizeRole = (role) => {
            const r = (role || '').toLowerCase().replace(/\s+/g, '');
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
            if (r === 'hr') return 'team_lead';
            return r;
        };
        const normalizedRequester = normalizeRole(requesterRole);
        const targetNormalized = normalizeRole(emp.role);

        // 1. Team Leads cannot delete anyone
        if (normalizedRequester === 'team_lead') {
            return res.status(403).json({ success: false, message: 'Forbidden. Team Leads cannot delete employees.' });
        }

        // 2. Non-admin, non-manager callers have no delete rights
        if (!['admin', 'manager'].includes(normalizedRequester)) {
            return res.status(403).json({ success: false, message: 'Forbidden. You do not have permission to delete employees.' });
        }

        // 3. Managers cannot delete Super Admins
        if (targetNormalized === 'admin' && normalizedRequester !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot delete Super Admins.' });
        }

        // 4. Managers cannot delete other managers
        if (normalizedRequester === 'manager' && targetNormalized === 'manager') {
            return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot delete other managers.' });
        }

        // Group 3: Always keep at least one active Super Admin.
        if (targetNormalized === 'admin' && emp.status === 'active') {
            const otherActiveAdmins = await Employee.countDocuments({ role: 'admin', status: 'active', _id: { $ne: emp._id } });
            if (otherActiveAdmins === 0) {
                return res.status(400).json({ success: false, message: 'At least one Super Admin must exist.' });
            }
        }

        emp.status = 'terminated';
        await emp.save();
        res.json({ success: true, message: 'Employee deactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// PATCH /api/employees/:id/super-admin
const setSuperAdminStatus = async (req, res) => {
    try {
        const requesterRole = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
        if (requesterRole !== 'admin') {
            return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can manage Super Admin status.' });
        }

        const { id } = req.params;
        const { isSuperAdmin } = req.body;

        if (typeof isSuperAdmin !== 'boolean') {
            return res.status(400).json({ success: false, message: 'isSuperAdmin must be a boolean (true or false).' });
        }

        const emp = await Employee.findOne({
            $or: [
                { id: id },
                ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])
            ]
        });

        if (!emp) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        if (isSuperAdmin) {
            // Granting Super Admin status sets the role to "admin"
            if (emp.role !== 'admin') {
                emp.previous_role = emp.role;
                emp.role = 'admin';
            }
        } else {
            // Removing Super Admin status
            if (emp.role === 'admin') {
                if (emp.status === 'active') {
                    const activeSuperAdmins = await Employee.countDocuments({ role: 'admin', status: 'active', _id: { $ne: emp._id } });
                    if (activeSuperAdmins === 0) {
                        return res.status(400).json({ success: false, message: 'At least one Super Admin must exist.' });
                    }
                }
                const prev = (emp.previous_role || '').toLowerCase().replace(/\s+/g, '');
                const wasManager = ['manager', 'hr_manager', 'hrmanager'].includes(prev);
                emp.role = wasManager ? 'manager' : 'employee';
            }
        }

        await emp.save();
        const { password_hash, ...rest } = emp.toObject();
        return res.json({ success: true, message: 'Super Admin status updated successfully.', employee: rest });
    } catch (err) {
        console.error('[setSuperAdminStatus]', err);
        return res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/employees/stats
const getStats = async (req, res) => {
    try {
        // More robust count: include 'active' case-insensitively and also count if status is missing
        const total = await Employee.countDocuments({ status: { $ne: 'terminated' } });

        const now = new Date();
        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        // Robust date check: if date_of_joining exists and is on or after the 1st of this month
        const newJoineesThisMonth = await Employee.countDocuments({ 
            status: { $ne: 'terminated' }, 
            date_of_joining: { $gte: firstOfMonth } 
        });

        const byRoleAgg = await Employee.aggregate([
            { $match: { status: { $ne: 'terminated' } } },
            { $group: { _id: '$role', count: { $sum: 1 } } },
            { $project: { _id: 0, role: '$_id', count: 1 } },
        ]);

        const byDeptAgg = await Employee.aggregate([
            { $match: { status: { $ne: 'terminated' }, department_id: { $ne: null } } },
            { $group: { _id: '$department_id', count: { $sum: 1 } } },
        ]);
        const deptIds = byDeptAgg.map(d => d._id);
        const depts = await Department.find({ _id: { $in: deptIds } }).select('name').lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));
        const byDepartment = byDeptAgg.map(d => ({ name: deptMap[d._id?.toString()] || 'Unknown', count: d.count }));

        res.json({ success: true, stats: { total, newJoineesThisMonth, byRole: byRoleAgg, byDepartment } });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/employees/upcoming-events (Optimized: Queries only relevant employees)
const getUpcomingEvents = async (req, res) => {
    try {
        const today = new Date();
        const currentMonth = today.getUTCMonth(); // 0-11
        const currentDate = today.getUTCDate();
        
        // Strategy: Query employees whose birthday or joining month is current or next month
        // This is still a bit broad but much better than fetching ALL employees.
        // For production, a more complex aggregation or storing month/day as separate fields is better.
        const employees = await Employee.find({
            status: { $ne: 'terminated' },
            $or: [
                { date_of_birth: { $ne: null } },
                { date_of_joining: { $ne: null } }
            ]
        }, {
            id: 1, name: 1, profile_image: 1, designation: 1,
            department_id: 1, date_of_birth: 1, date_of_joining: 1
        }).populate('department_id', 'name').lean();

        const events = employees.map(emp => {
            const list = [];
            if (emp.date_of_birth) {
                const dob = new Date(emp.date_of_birth);
                // Check if birthday falls in current or next 30 days
                // Simplified for brevity: just return birthdays in current month
                if (dob.getUTCMonth() === currentMonth || dob.getUTCMonth() === (currentMonth + 1) % 12) {
                    list.push({ type: 'birthday', date: emp.date_of_birth });
                }
            }
            if (emp.date_of_joining) {
                const doj = new Date(emp.date_of_joining);
                if (doj.getUTCMonth() === currentMonth || doj.getUTCMonth() === (currentMonth + 1) % 12) {
                    list.push({ 
                        type: 'anniversary', 
                        date: emp.date_of_joining, 
                        years: today.getFullYear() - doj.getFullYear() 
                    });
                }
            }
            return list.length > 0 ? {
                id: emp.id,
                name: emp.name,
                image: emp.profile_image,
                designation: emp.designation,
                department: emp.department_id?.name || 'General',
                events: list
            } : null;
        }).filter(Boolean);

        res.status(200).json({ success: true, events });
    } catch (error) {
        console.error('[getUpcomingEvents]', error);
        res.status(500).json({ success: false, message: 'Error fetching upcoming events' });
    }
};

// GET /api/employees/dashboard-overview (Unified endpoint for fast data load)
const getDashboardOverview = async (req, res) => {
    try {
        const empId = req.user.id;
        const now = new Date();
        const todayISTStr = toISTDateString(now);
        const [yearStr, monthStr] = todayISTStr.split('-');
        const istYear = parseInt(yearStr);
        const istMonth = parseInt(monthStr);
        const daysInMonth = new Date(istYear, istMonth, 0).getDate();
        const monthStart = getISTDayStart(`${istYear}-${String(istMonth).padStart(2, '0')}-01`);
        const monthEnd = getISTDayEnd(`${istYear}-${String(istMonth).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`);

        const todayStart = getISTDayStart(todayISTStr);
        const [leaveData, attendanceData, ticketData, upcomingEventsData, companyEventsData, settingsData, sickLeaveCount, upcomingHolidaysData, eventHolidaysData, employeeLeaves] = await Promise.all([
            LeaveBalance.findOne({ employee_id: empId, year: istYear }).lean(),
            require('../models/Attendance').find({ 
                employee_id: empId, 
                date: { $gte: monthStart, $lt: monthEnd } 
            }).lean(),
            require('../models/Ticket').find({ employee_id: empId }).limit(5).sort({ createdAt: -1 }).lean(),
            Employee.find({
                status: 'active',
                $or: [{ date_of_birth: { $ne: null } }, { date_of_joining: { $ne: null } }]
            }, { id: 1, name: 1, profile_image: 1, date_of_birth: 1, date_of_joining: 1 }).limit(10).lean(),
            require('../models/Event').find({ date: { $gte: monthStart } }).limit(5).lean(),
            Setting.findOne().lean(),
            Leave.countDocuments({
                employee_id: empId,
                leave_type: 'sick',
                status: { $in: ['pending', 'approved'] },
                start_date: { $gte: monthStart, $lt: monthEnd }
            }),
            Holiday.find({ date: { $gte: todayISTStr } }).sort({ date: 1 }).limit(10).lean(),
            require('../models/Event').find({ type: 'holiday', date: { $gte: todayStart } }).sort({ date: 1 }).limit(10).lean(),
            Leave.find({ employee_id: empId }).sort({ start_date: -1 }).limit(10).lean()
        ]);

        const seenHolidayDates = new Set();
        const upcomingHolidays = [];
        for (const h of upcomingHolidaysData) {
            const d = toISTDateString(h.date);
            if (!seenHolidayDates.has(d)) {
                seenHolidayDates.add(d);
                upcomingHolidays.push({ _id: h._id, name: h.name, date: d });
            }
        }
        for (const e of eventHolidaysData) {
            const d = toISTDateString(e.date);
            if (!seenHolidayDates.has(d)) {
                seenHolidayDates.add(d);
                upcomingHolidays.push({ _id: e._id, name: e.title, date: d });
            }
        }
        upcomingHolidays.sort((a, b) => a.date.localeCompare(b.date));

        // Process attendance for summary: group by calendar day first to avoid double counting
        const groupedByDay = {};
        attendanceData.forEach(rec => {
            const d = toISTDateString(rec.date);
            if (!groupedByDay[d]) {
                groupedByDay[d] = rec.status;
            } else {
                const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
                if ((priority[rec.status] || 0) > (priority[groupedByDay[d]] || 0)) {
                    groupedByDay[d] = rec.status;
                }
            }
        });
        const dayStatuses = Object.values(groupedByDay);
        const attendanceSummary = {
            present: dayStatuses.filter(s => s === 'present').length,
            absent: dayStatuses.filter(s => s === 'absent').length,
            late: dayStatuses.filter(s => s === 'late').length,
            halfDay: dayStatuses.filter(s => s === 'half-day').length,
            total: dayStatuses.length
        };

        res.json({
            success: true,
            dashboard: {
                leave: {
                    balance: leaveData,
                    leaves: employeeLeaves,
                    sickLeaveThisMonth: {
                        used: sickLeaveCount,
                        total: 1,
                        text: `Sick leave this month: ${sickLeaveCount} of 1 used`
                    }
                },
                upcomingHolidays,
                attendance: { summary: attendanceSummary, list: attendanceData },
                tickets: ticketData,
                upcomingEvents: upcomingEventsData.map(e => {
                    const evs = [];
                    if (e.date_of_birth) evs.push({ type: 'birthday', date: e.date_of_birth });
                    if (e.date_of_joining) evs.push({ type: 'anniversary', date: e.date_of_joining, years: now.getFullYear() - new Date(e.date_of_joining).getFullYear() });
                    return { id: e.id, name: e.name, image: e.profile_image, events: evs };
                }),
                companyEvents: companyEventsData,
                globalPolicies: settingsData?.leave_policies || {}
            }
        });
    } catch (err) {
        console.error('[getDashboardOverview]', err);
        res.status(500).json({ success: false, message: 'Failed to fetch dashboard overview.' });
    }
};

// GET /api/employees/export
const exportEmployees = async (req, res) => {
    try {
        const employees = await Employee.find({}).lean();
        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        const rows = employees.map(e => ({
            id: e.id,
            name: e.name,
            email: e.email,
            phone: e.phone || '',
            gender: e.gender || '',
            date_of_birth: e.date_of_birth ? new Date(e.date_of_birth).toISOString().split('T')[0] : '',
            address: e.address || '',
            pan: e.pan || '',
            uan: e.uan || '',
            pf_account_no: e.pf_account_no || '',
            role: e.role,
            designation: e.designation || '',
            department_name: e.department_id ? deptMap[e.department_id.toString()] || '' : '',
            date_of_joining: e.date_of_joining ? new Date(e.date_of_joining).toISOString().split('T')[0] : '',
            basic_salary: e.salary_details?.basic || 0,
            da: e.salary_details?.da || 0,
            oa: e.salary_details?.oa || 0,
            bank_account_no: e.salary_details?.bank_ac_no || '',
            bank_ifsc_code: e.salary_details?.bank_ifsc_code || '',
            bank_name: e.salary_details?.bank_name || '',
            status: e.status,
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Employees');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', 'attachment; filename="employees_export.xlsx"');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('[exportEmployees]', err);
        res.status(500).json({ success: false, message: 'Export failed.' });
    }
};

// GET /api/employees/template  (sample import template)
const downloadEmployeeTemplate = (req, res) => {
    const sample = [{
        id: 'EMP005',
        name: 'John Doe',
        email: 'john.doe@company.com',
        password: 'password123',
        phone: '9999999999',
        gender: 'male',
        date_of_birth: '1998-05-20',
        address: '123 Main Street, City',
        pan: 'ABCDE1234F',
        uan: '100000000001',
        pf_account_no: 'MH/BAN/00000/000/0000001',
        role: 'employee',
        designation: 'Software Engineer',
        department_name: 'Engineering',
        date_of_joining: '2026-01-15',
        basic_salary: 15000,
        da: 3000,
        oa: 2000,
        bank_account_no: '1234567890',
        bank_ifsc_code: 'BANK0001',
        bank_name: 'Example Bank'
    }];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="employee_import_template.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
};

// POST /api/employees/import
const importEmployees = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });

        // Check subscription limit
        const employeeCount = await Employee.countDocuments({ status: 'active' });
        const settings = await Setting.findOne();
        const maxEmployees = settings?.subscription?.max_employees || 5;
        const companyName = settings?.company_name || process.env.COMPANY_NAME || 'HRMS';

        if (employeeCount >= maxEmployees) {
            return res.status(403).json({ 
                success: false, 
                message: `Employee Limit Reached: Your current ${settings?.subscription?.plan || 'free'} plan allows a maximum of ${maxEmployees} active employees. Please upgrade your subscription to add more.`,
                limit_reached: true
            });
        }

        const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (rows.length === 0) return res.status(400).json({ success: false, message: 'The uploaded file is empty.' });

        const allowedRoles = ['admin', 'manager', 'team_lead', 'employee'];
        const requesterRole = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
        const isRequesterAdmin = requesterRole === 'admin';

        for (let i = 0; i < rows.length; i++) {
            const rowRole = String(rows[i].role || 'employee').toLowerCase().trim();
            if (!allowedRoles.includes(rowRole)) {
                return res.status(400).json({ success: false, message: `Invalid role "${rows[i].role}" in row ${i + 2}. Allowed roles: admin, manager, team_lead, employee.` });
            }
            if (rowRole === 'admin' && !isRequesterAdmin) {
                return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins can import employees with the Super Admin role.' });
            }
        }

        // All fields required per user's requirement
        const REQUIRED = ['name', 'email', 'password', 'phone', 'gender', 'date_of_birth', 'address', 'role', 'designation', 'department_name', 'date_of_joining', 'basic_salary', 'bank_account_no', 'bank_ifsc_code', 'bank_name'];
        // Optional but allowed: da, oa, pan, uan, pf_account_no

        // Build dept map
        const allDepts = await Department.find({}).lean();
        const deptByName = Object.fromEntries(allDepts.map(d => [d.name.toLowerCase().trim(), d._id]));

        // Get global leave settings
        const policies = settings?.leave_policies || { casual_leave: 12, sick_leave: 12, earned_leave: 15, maternity_leave: 0, paternity_leave: 0 };

        // Get next ID counter
        const lastEmp = await Employee.findOne({}).sort({ id: -1 }).lean();
        let idCounter = 1;
        if (lastEmp?.id) {
            const num = parseInt(lastEmp.id.replace(/[^0-9]/g, '')) || 0;
            idCounter = num + 1;
        }

        let imported = 0, skipped = 0;
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // Excel row number (1-based header + 1)

            // Validate required fields
            const missing = REQUIRED.filter(f => !String(row[f] || '').trim());
            if (missing.length > 0) {
                errors.push(`Row ${rowNum}: Missing required fields: ${missing.join(', ')}`);
                skipped++;
                continue;
            }

            // Check if email already exists
            const exists = await Employee.findOne({ email: String(row.email).toLowerCase().trim() });
            if (exists) {
                errors.push(`Row ${rowNum}: Email "${row.email}" already exists — skipped.`);
                skipped++;
                continue;
            }

            // Resolve department
            const deptId = deptByName[String(row.department_name).toLowerCase().trim()] || null;
            if (!deptId) {
                errors.push(`Row ${rowNum}: Department "${row.department_name}" not found — row skipped.`);
                skipped++;
                continue;
            }

            // Generate or use provided ID
            const empId = String(row.id || '').trim() || `EMP${String(idCounter).padStart(3, '0')}`;
            idCounter++;

            const plainPassword = String(row.password).trim();
            const hashedPassword = await bcrypt.hash(plainPassword, 10);
            const empName = String(row.name).trim();
            const empEmail = String(row.email).toLowerCase().trim();
            const finalEmpId = empId.toUpperCase();

            try {
                await Employee.create({
                    id: finalEmpId,
                    name: empName,
                    email: empEmail,
                    password_hash: hashedPassword,
                    role: row.role || 'employee',
                    designation: String(row.designation).trim(),
                    department_id: deptId,
                    phone: String(row.phone).trim(),
                    gender: String(row.gender).toLowerCase().trim(),
                    date_of_joining: new Date(row.date_of_joining),
                    date_of_birth: new Date(row.date_of_birth),
                    address: String(row.address).trim(),
                    pan: String(row.pan || '').trim().toUpperCase(),
                    uan: String(row.uan || '').trim(),
                    pf_account_no: String(row.pf_account_no || '').trim(),
                    salary_details: {
                        basic: parseFloat(row.basic_salary) || 0,
                        da: parseFloat(row.da) || 0,
                        oa: parseFloat(row.oa) || 0,
                        bank_ac_no: String(row.bank_account_no || '').trim(),
                        bank_ifsc_code: String(row.bank_ifsc_code || '').trim(),
                        bank_name: String(row.bank_name || '').trim(),
                    },
                    status: 'active',
                });
                imported++;
            } catch (createErr) {
                errors.push(`Row ${rowNum}: Database error — ${createErr.message}`);
                skipped++;
                continue;
            }

            // Initialize leave balance
            await LeaveBalance.create({
                employee_id: finalEmpId,
                year: new Date().getFullYear(),
                ...policies
            }).catch(() => { });

            // Send Welcome Email
            sendEmail({
                to: empEmail,
                subject: `Welcome to ${companyName} - Your Login Credentials`,
                html: `
                    <h2 style="color: #6366f1;">Welcome to the Team, ${empName}!</h2>
                    <p>An account has been created for you on the <b>${companyName} Portal</b>.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                        <p style="margin: 0;"><b>Login URL:</b> <a href="${process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/login">Click here to Sign In</a></p>
                        <p style="margin: 10px 0 0;"><b>Employee ID:</b> ${finalEmpId}</p>
                        <p style="margin: 5px 0 0;"><b>Password:</b> ${plainPassword}</p>
                    </div>
                    <p>Please log in and update your profile and password immediately.</p>
                `
            }).catch(emailErr => console.error(`Failed to send welcome email to ${empEmail}:`, emailErr));

            imported++;
        }

        res.json({
            success: true,
            message: `Import complete. ${imported} imported, ${skipped} skipped.`,
            imported, skipped, errors
        });
    } catch (err) {
        console.error('[importEmployees]', err);
        res.status(500).json({ success: false, message: 'Import failed: ' + err.message });
    }
};

// PATCH /api/employees/:id/assignments - Set manager_id and team_lead_id
const updateAssignments = async (req, res) => {
    try {
        const { id } = req.params;
        const { manager_id, team_lead_id } = req.body;
        const loggedInUser = req.user;

        const normalizeRole = (role) => {
            const r = (role || '').toLowerCase().replace(/\s+/g, '');
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
            if (r === 'hr') return 'team_lead';
            return r;
        };

        const requesterRole = normalizeRole(loggedInUser?.role || '');

        // Fetch target employee
        const targetEmp = await Employee.findOne({
            $or: [{ id: id }, ...(mongoose.Types.ObjectId.isValid(id) ? [{ _id: id }] : [])]
        });
        if (!targetEmp) return res.status(404).json({ success: false, message: 'Employee not found.' });

        // Super Admin can set both manager_id and team_lead_id
        if (requesterRole === 'admin') {
            if (manager_id !== undefined) {
                if (manager_id !== null) {
                    const mgr = await Employee.findOne({ id: manager_id }).lean();
                    if (!mgr) return res.status(400).json({ success: false, message: 'Manager not found.' });
                    const mgrRole = normalizeRole(mgr.role);
                    if (mgrRole !== 'manager') {
                        return res.status(400).json({ success: false, message: 'Referenced employee must have role "manager".' });
                    }
                }
                targetEmp.manager_id = manager_id;
            }
            if (team_lead_id !== undefined) {
                if (team_lead_id !== null) {
                    const tl = await Employee.findOne({ id: team_lead_id }).lean();
                    if (!tl) return res.status(400).json({ success: false, message: 'Team Lead not found.' });
                    const tlRole = normalizeRole(tl.role);
                    if (tlRole !== 'team_lead') {
                        return res.status(400).json({ success: false, message: 'Referenced employee must have role "team_lead".' });
                    }
                }
                targetEmp.team_lead_id = team_lead_id;
            }
            await targetEmp.save();
            const { password_hash, ...rest } = targetEmp.toObject();
            return res.json({ success: true, message: 'Assignments updated successfully.', employee: rest });
        }

        // Manager can only set team_lead_id for employees in departments they manage
        if (requesterRole === 'manager') {
            if (manager_id !== undefined) {
                return res.status(403).json({ success: false, message: 'Forbidden. Managers cannot set manager_id.' });
            }
            if (team_lead_id === undefined) {
                return res.status(400).json({ success: false, message: 'team_lead_id is required.' });
            }

            // Get departments managed by this manager (support string id and ObjectId)
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

            const managedDepts = await Department.find({ manager_id: { $in: validManagerIds } }).select('_id').lean();
            const managedDeptIds = new Set(managedDepts.map(d => d._id.toString()));

            // Check if target employee is in a managed department
            if (!targetEmp.department_id || !managedDeptIds.has(targetEmp.department_id.toString())) {
                return res.status(403).json({ success: false, message: 'Forbidden. You can only assign team leads to employees in your departments.' });
            }

            if (team_lead_id !== null) {
                const tl = await Employee.findOne({ id: team_lead_id }).lean();
                if (!tl) return res.status(400).json({ success: false, message: 'Team Lead not found.' });
                const tlRole = normalizeRole(tl.role);
                if (tlRole !== 'team_lead') {
                    return res.status(400).json({ success: false, message: 'Referenced employee must have role "team_lead".' });
                }
            }
            targetEmp.team_lead_id = team_lead_id;
            await targetEmp.save();
            const { password_hash, ...rest } = targetEmp.toObject();
            return res.json({ success: true, message: 'Team lead assigned successfully.', employee: rest });
        }

        return res.status(403).json({ success: false, message: 'Forbidden. Only Super Admins and Managers can update assignments.' });
    } catch (err) {
        console.error('[updateAssignments]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

module.exports = {
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
    setSuperAdminStatus,
    updateAssignments,
    getStats, getUpcomingEvents, getDashboardOverview,
    exportEmployees, importEmployees, downloadEmployeeTemplate
};
