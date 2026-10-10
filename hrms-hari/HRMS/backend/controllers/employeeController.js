const Employee = require('../models/Employee');
const Department = require('../models/Department');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('../utils/emailService');
const LeaveBalance = require('../models/LeaveBalance');
const Setting = require('../models/Setting');
const XLSX = require('xlsx');

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
        const { status, search, department, page = 1, limit = 50 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        
        const filter = {};
        if (status) filter.status = status;
        if (department) filter.department_id = department;
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
        const emp = await Employee.findOne({ id: req.params.id }).lean();
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });

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
            id, name, email, password, role, department_id, phone, designation,
            date_of_joining, date_of_birth, gender, address, pan, uan, pf_account_no, salary_details
        } = req.body;
        const emailLower = String(email).toLowerCase().trim();
        const existing = await Employee.findOne({ $or: [{ id }, { email: emailLower }] });
        if (existing) return res.status(400).json({ success: false, message: 'Employee ID or email already exists.' });

        const password_hash = await bcrypt.hash(password || 'emp123', 10);
        const employee = await Employee.create({
            id, name, email: emailLower, password_hash, role,
            department_id: department_id || null,
            phone: phone || undefined,
            designation: designation || undefined,
            date_of_joining: date_of_joining || undefined,
            date_of_birth: date_of_birth || undefined,
            gender: gender || undefined,
            address: address || undefined,
            pan: pan || undefined,
            uan: uan || undefined,
            pf_account_no: pf_account_no || undefined,
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
                employee_id: id,
                year: new Date().getFullYear(),
                ...policies
            });
        } catch (balErr) {
            console.error('Failed to initialize leave balance:', balErr);
        }

        const { password_hash: _, ...rest } = employee.toObject();

        // Send Welcome Email
        sendEmail({
            to: email,
            subject: 'Welcome to Hari Hrms - Your Login Credentials',
            html: `
                <h2 style="color: #6366f1;">Welcome to the Team, ${name}!</h2>
                <p>An account has been created for you on the <b>Hari Hrms Portal</b>.</p>
                <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                    <p style="margin: 0;"><b>Login URL:</b> <a href="${process.env.FRONTEND_URL || 'https://hrms-delta-eight.vercel.app'}/login">Click here to Sign In</a></p>
                    <p style="margin: 10px 0 0;"><b>Employee ID:</b> ${id}</p>
                    <p style="margin: 5px 0 0;"><b>Password:</b> ${password || 'emp123'}</p>
                </div>
                <p>Please log in and update your profile and password immediately.</p>
            `
        });

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
        const userPerms = settings?.roles_permissions?.[loggedInUser.role] || [];

        // HR default if MISSING in DB
        const isHR = loggedInUser.role === 'hr';
        const canManage = loggedInUser.role === 'hr_manager' || userPerms.includes('manage_employees') || (isHR && userPerms.length === 0);
        const isSelf = loggedInUser.id === id;

        if (!canManage && !isSelf) {
            return res.status(403).json({ success: false, message: 'Access denied. You can only update your own profile.' });
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
            const isManagerRole = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes((loggedInUser.role || '').toLowerCase().replace(/\s+/g, ''));
            
            if (permissions !== undefined && !isManagerRole) {
                return res.status(403).json({ success: false, message: 'Only HR Managers can grant individual module access.' });
            }

            updateFields = {
                name, phone, designation: designation || undefined,
                department_id: department_id || null,
                shift_id: shift_id || null,
                manager_id: manager_id || null,
                role, status, gender, address,
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
            { id: id },
            updateFields,
            { returnDocument: 'after', runValidators: true }
        ).select('-password_hash');

        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });
        res.json({ success: true, message: 'Employee updated successfully.', employee: emp });
    } catch (err) {
        console.error('[updateEmployee]', err);
        res.status(500).json({ success: false, message: err.message || 'Server error.' });
    }
};

// DELETE /api/employee/:id
const deleteEmployee = async (req, res) => {
    try {
        const emp = await Employee.findOneAndUpdate({ id: req.params.id }, { status: 'terminated' }, { returnDocument: 'after' });
        if (!emp) return res.status(404).json({ success: false, message: 'Employee not found.' });
        res.json({ success: true, message: 'Employee deactivated.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
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
        const m = now.getMonth() + 1;
        const y = now.getFullYear();

        const [leaveData, attendanceData, ticketData, upcomingEventsData, companyEventsData, settingsData] = await Promise.all([
            LeaveBalance.findOne({ employee_id: empId, year: y }).lean(),
            require('../models/Attendance').find({ 
                employee_id: empId, 
                date: { $gte: new Date(y, m-1, 1), $lt: new Date(y, m, 1) } 
            }).lean(),
            require('../models/Ticket').find({ employee_id: empId }).limit(5).sort({ createdAt: -1 }).lean(),
            Employee.find({
                status: 'active',
                $or: [{ date_of_birth: { $ne: null } }, { date_of_joining: { $ne: null } }]
            }, { id: 1, name: 1, profile_image: 1, date_of_birth: 1, date_of_joining: 1 }).limit(10).lean(),
            require('../models/Event').find({ date: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } }).limit(5).lean(),
            Setting.findOne().lean()
        ]);

        // Process attendance for summary
        const statuses = attendanceData.map(a => a.status);
        const attendanceSummary = {
            present: statuses.filter(s => s === 'present').length,
            absent: statuses.filter(s => s === 'absent').length,
            late: statuses.filter(s => s === 'late').length,
            halfDay: statuses.filter(s => s === 'half-day').length,
            total: statuses.length
        };

        res.json({
            success: true,
            dashboard: {
                leave: { balance: leaveData },
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
                subject: 'Welcome to Hari Hrms - Your Login Credentials',
                html: `
                    <h2 style="color: #6366f1;">Welcome to the Team, ${empName}!</h2>
                    <p>An account has been created for you on the <b>Hari Hrms Portal</b>.</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #6366f1; margin: 20px 0;">
                        <p style="margin: 0;"><b>Login URL:</b> <a href="${process.env.FRONTEND_URL || 'https://hrms-delta-eight.vercel.app'}/login">Click here to Sign In</a></p>
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

module.exports = { 
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, 
    getStats, getUpcomingEvents, getDashboardOverview,
    exportEmployees, importEmployees, downloadEmployeeTemplate 
};
