const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Setting = require('../models/Setting');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');


// POST /api/auth/login
const login = async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, message: 'Email and password are required.' });
        }

        const employee = await Employee.findOne({ 
            $or: [
                { email: email.toLowerCase() },
                { id: email }
            ]
        });
        
        if (!employee)
            return res.status(401).json({ success: false, message: 'Invalid ID/Email or password.' });

        const isMatch = await employee.matchPassword(password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        // Populate department name
        let department_name = null;
        if (employee.department_id) {
            const dept = await Department.findById(employee.department_id).select('name');
            department_name = dept?.name || null;
        }

        // Fetch current role permissions from Settings
        const settings = await Setting.findOne();
        const roleKey = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
        // Standardize role key lookup (case-insensitive and typo tolerant)
        const matchedKey = Object.keys(settings?.roles_permissions || {}).find(k => k.toLowerCase().replace(/\s+/g, '') === roleKey) || employee.role;
        const rolePermissions = settings?.roles_permissions?.[matchedKey] || [];
        
        // Strict Override: Individual override permissions take complete precedence.
        // HOWEVER, "Basic Workspace" modules are always granted to all staff.
        const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];
        
        let combinedPermissions;
        if (employee.permissions && Array.isArray(employee.permissions)) {
            // STRICT MODE: Use ONLY individual selections
            combinedPermissions = employee.permissions;
        } else {
            // DEFAULT MODE: Only top-level managers get all modules by default.
            // Everyone else only gets the BASIC modules (Workspace) by default.
            const roleKey = (employee.role || '').toLowerCase().replace(/\s+/g, '');
            const isManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleKey);
            
            const basePerms = isManager ? (rolePermissions || []) : [];
            combinedPermissions = [...new Set([...basePerms, ...BASIC_PERMISSIONS])];
        }

        const token = jwt.sign(
            { 
                id: employee.id, 
                _id: employee._id, 
                name: employee.name, 
                email: employee.email, 
                role: employee.role,
                permissions: combinedPermissions
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' } // Short-lived access token
        );

        const refreshToken = jwt.sign(
            { id: employee.id },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: rememberMe ? '30d' : '1d' } // Dynamic refresh token lifespan
        );

        // Store refresh token
        employee.refresh_tokens.push(refreshToken);
        await employee.save();

        const { password_hash, refresh_tokens, ...rest } = employee.toObject();
        res.json({
            success: true,
            message: 'Login successful',
            token,
            refreshToken,
            user: { ...rest, department_name, permissions: combinedPermissions },
        });

    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({
            success: false,
            message: 'Server error. Please try again.',
            error: err.message
        });
    }
};

// POST /api/auth/logout
const logout = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (refreshToken) {
            // Remove specific refresh token from DB
            await Employee.updateOne(
                { id: req.user.id },
                { $pull: { refresh_tokens: refreshToken } }
            );
        }
        res.json({ success: true, message: 'Logged out successfully.' });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Logout failed.' });
    }
};

// GET /api/auth/me
const getMe = async (req, res) => {
    try {
        const employee = await Employee.findOne({ id: req.user.id }).select('-password_hash');
        if (!employee) return res.status(404).json({ success: false, message: 'User not found.' });

        let department_name = null;
        let department_id = null;
        if (employee.department_id) {
            const dept = await Department.findById(employee.department_id).select('name');
            department_name = dept?.name || null;
            department_id = employee.department_id;
        }

        // Fetch current role permissions from Settings
        const settings = await Setting.findOne();
        const roleKey = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
        const matchedKey = Object.keys(settings?.roles_permissions || {}).find(k => k.toLowerCase().replace(/\s+/g, '') === roleKey) || employee.role;
        const rolePermissions = settings?.roles_permissions?.[matchedKey] || [];
        
        // Same permission resolution logic as login for session refresh
        const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];
        
        let combinedPermissions;
        if (employee.permissions && Array.isArray(employee.permissions)) {
            combinedPermissions = employee.permissions;
        } else {
            const roleKey = (employee.role || '').toLowerCase().replace(/\s+/g, '');
            const isManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleKey);
            
            const basePerms = isManager ? (rolePermissions || []) : [];
            combinedPermissions = [...new Set([...basePerms, ...BASIC_PERMISSIONS])];
        }

        const newToken = jwt.sign(
            { 
                id: employee.id, 
                _id: employee._id, 
                name: employee.name, 
                email: employee.email, 
                role: employee.role,
                permissions: combinedPermissions
            },
            process.env.JWT_SECRET,
            { expiresIn: '15m' }
        );

        res.json({ 
            success: true, 
            token: newToken, 
            user: { ...employee.toObject(), department_name, department_id, permissions: combinedPermissions } 
        });

    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/auth/refresh
const refreshToken = async (req, res) => {
    try {
        const { refreshToken: token } = req.body;
        if (!token) return res.status(401).json({ success: false, message: 'Refresh token required.' });

        const employee = await Employee.findOne({ refresh_tokens: token });
        if (!employee) return res.status(403).json({ success: false, message: 'Invalid refresh token.' });

        try {
            const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);

            // Issue new tokens
            const newAccessToken = jwt.sign(
                { id: employee.id, _id: employee._id, name: employee.name, email: employee.email, role: employee.role },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );

            const newRefreshToken = jwt.sign(
                { id: employee.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );

            // Rotate refresh token (replace old with new)
            employee.refresh_tokens = employee.refresh_tokens.filter(t => t !== token);
            employee.refresh_tokens.push(newRefreshToken);
            await employee.save();

            res.json({ success: true, token: newAccessToken, refreshToken: newRefreshToken });
        } catch (err) {
            // Token expired or invalid - cleanup database
            employee.refresh_tokens = employee.refresh_tokens.filter(t => t !== token);
            await employee.save();
            return res.status(403).json({ success: false, message: 'Invalid or expired refresh token.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, message: 'Email is required.' });

        const employee = await Employee.findOne({ email: email.toLowerCase() });
        if (!employee) {
            // Generic message for security
            return res.json({ success: true, message: 'If an account exists with this email, an OTP has been sent.' });
        }

        // Generate 6 digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        employee.reset_otp = otp;
        employee.reset_otp_expiry = expiry;
        await employee.save();

        const settings = await Setting.findOne().lean();
        const companyName = settings?.company_name || 'HRMS';

        await sendEmail({
            to: employee.email,
            subject: `Password Reset OTP - ${companyName}`,
            html: `
                <div style="text-align: center; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
                    <h2 style="color: #6366f1;">Password Reset Request</h2>
                    <p>You requested to reset your password. Use the following OTP to proceed:</p>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; font-size: 2rem; font-weight: 800; letter-spacing: 5px; color: #1e293b;">
                        ${otp}
                    </div>
                    <p style="color: #64748b; font-size: 0.875rem;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email.</p>
                </div>
            `
        });

        res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
        console.error('[forgotPassword]', err);
        res.status(500).json({ success: false, message: 'Server error sending OTP.' });
    }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        if (!email || !otp || !newPassword) {
            return res.status(400).json({ success: false, message: 'Email, OTP and New Password are required.' });
        }

        const employee = await Employee.findOne({
            email: email.toLowerCase(),
            reset_otp: otp,
            reset_otp_expiry: { $gt: Date.now() }
        });

        if (!employee) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP.' });
        }

        // Reset password
        employee.password_hash = newPassword; // Presave hook handles hashing
        employee.reset_otp = undefined;
        employee.reset_otp_expiry = undefined;
        // Invalidate all sessions on password change
        employee.refresh_tokens = [];
        await employee.save();

        res.json({ success: true, message: 'Password reset successful. You can now login.' });
    } catch (err) {
        console.error('[resetPassword]', err);
        res.status(500).json({ success: false, message: 'Server error resetting password.' });
    }
};

module.exports = { login, logout, getMe, refreshToken, forgotPassword, resetPassword };
