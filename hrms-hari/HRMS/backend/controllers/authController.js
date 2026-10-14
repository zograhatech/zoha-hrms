const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Setting = require('../models/Setting');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../utils/emailService');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const hashSha256 = (val) => crypto.createHash('sha256').update(String(val)).digest('hex');

// Helper to generate standard JWT auth tokens and user payload
const generateAuthPayload = async (employee, rememberMe, settings) => {
    let department_name = null;
    if (employee.department_id) {
        const dept = await Department.findById(employee.department_id).select('name');
        department_name = dept?.name || null;
    }

    const rawRoleKey = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
    const normalizeRole = (role) => {
        const r = (role || '').toLowerCase().replace(/\s+/g, '');
        if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
        if (r === 'hr') return 'team_lead';
        return r;
    };
    const normalizedRole = normalizeRole(rawRoleKey);
    const rolePermissions = settings?.roles_permissions?.[normalizedRole] ||
        settings?.roles_permissions?.[rawRoleKey] ||
        (normalizedRole === 'manager' ? settings?.roles_permissions?.['hr_manager'] : undefined) ||
        (normalizedRole === 'team_lead' ? settings?.roles_permissions?.['hr'] : undefined) ||
        [];

    const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];

    let combinedPermissions;
    if (employee.permissions && Array.isArray(employee.permissions)) {
        combinedPermissions = employee.permissions;
    } else {
        const isManager = ['admin', 'manager'].includes(normalizedRole);
        const isTeamLead = normalizedRole === 'team_lead';
        const basePerms = (isManager || isTeamLead) ? (rolePermissions || []) : [];
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
        { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
        { id: employee.id },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: rememberMe ? '30d' : '1d' }
    );

    employee.refresh_tokens.push(refreshToken);
    await employee.save();

    const { password_hash, refresh_tokens, ...rest } = employee.toObject();
    return {
        token,
        refreshToken,
        user: { ...rest, department_name, permissions: combinedPermissions }
    };
};

// POST /api/auth/login
const login = async (req, res) => {
    try {
        if (!process.env.JWT_SECRET || !process.env.JWT_REFRESH_SECRET) {
            console.error('FATAL: JWT_SECRET or JWT_REFRESH_SECRET is not configured on the server.');
            return res.status(500).json({
                success: false,
                message: 'Server configuration error: Authentication secrets are not configured in environment variables.'
            });
        }

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

        // Check if 2FA is locked
        if (employee.twofaLockedUntil && new Date() < new Date(employee.twofaLockedUntil)) {
            return res.status(403).json({
                success: false,
                message: 'Account locked due to too many failed 2FA attempts. Please try again later.'
            });
        }

        const isMatch = await employee.matchPassword(password);
        if (!isMatch)
            return res.status(401).json({ success: false, message: 'Invalid email or password.' });

        const settings = await Setting.findOne();

        // Check 2FA requirement
        if (settings?.require_2fa) {
            const code = Math.floor(100000 + Math.random() * 900000).toString();
            employee.twofaCodeHash = hashSha256(code);
            employee.twofaCodeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
            employee.twofaAttempts = 0;

            let emailSent = false;
            try {
                emailSent = await sendEmail({
                    to: employee.email,
                    subject: 'Your Two-Factor Authentication (2FA) Code',
                    text: `Your login verification code is: ${code}. It expires in 10 minutes.`
                });
            } catch (e) {
                console.error('[login 2FA] sendEmail failed:', e.message);
                emailSent = false;
            }

            if (!emailSent) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to send 2FA verification code. Please try again later.'
                });
            }

            await employee.save();
            return res.json({
                success: true,
                requires2fa: true,
                requires_2fa: true,
                employee_id: employee.id,
                message: '2FA code sent to your email.'
            });
        }

        const authData = await generateAuthPayload(employee, rememberMe, settings);
        const needsEmailVerification = settings?.require_email_verification && !employee.emailVerified && employee.role !== 'admin';

        res.json({
            success: true,
            message: 'Login successful',
            token: authData.token,
            refreshToken: authData.refreshToken,
            user: authData.user,
            email_verification_required: needsEmailVerification ? true : undefined,
            verify_email_prompt: needsEmailVerification ? true : undefined
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
        const rawRoleKey = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
        const normalizeRole = (role) => {
            const r = (role || '').toLowerCase().replace(/\s+/g, '');
            if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
            if (r === 'hr') return 'team_lead';
            return r;
        };
        const normalizedRole = normalizeRole(rawRoleKey);
        const rolePermissions = settings?.roles_permissions?.[normalizedRole] ||
            settings?.roles_permissions?.[rawRoleKey] ||
            (normalizedRole === 'manager' ? settings?.roles_permissions?.['hr_manager'] : undefined) ||
            (normalizedRole === 'team_lead' ? settings?.roles_permissions?.['hr'] : undefined) ||
            [];
        
        // Same permission resolution logic as login for session refresh
        const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];
        
        let combinedPermissions;
        if (employee.permissions && Array.isArray(employee.permissions)) {
            combinedPermissions = employee.permissions;
        } else {
            const isManager = ['admin', 'manager'].includes(normalizedRole);
            const isTeamLead = normalizedRole === 'team_lead';
            
            const basePerms = (isManager || isTeamLead) ? (rolePermissions || []) : [];
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

// POST /api/auth/verify-email
const verifyEmail = async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, message: 'Verification token is required.' });
        }

        const tokenHash = hashSha256(String(token).trim());
        const employee = await Employee.findOne({
            emailVerificationTokenHash: tokenHash
        });

        if (!employee) {
            return res.status(400).json({ success: false, message: 'Invalid or already used verification token.' });
        }

        if (!employee.emailVerificationExpiry || new Date() > new Date(employee.emailVerificationExpiry)) {
            return res.status(400).json({ success: false, message: 'Verification token has expired.' });
        }

        employee.emailVerified = true;
        employee.emailVerificationTokenHash = null;
        employee.emailVerificationExpiry = null;
        await employee.save();

        return res.json({
            success: true,
            message: 'Email verified successfully.'
        });
    } catch (err) {
        console.error('verifyEmail error:', err);
        return res.status(500).json({ success: false, message: 'Server error verifying email.' });
    }
};

// POST /api/auth/resend-verification
const resendVerification = async (req, res) => {
    const GENERIC_RESPONSE = {
        success: true,
        message: 'If an account exists with this email, a verification link has been sent.'
    };

    try {
        const { email } = req.body;
        if (!email) {
            return res.json(GENERIC_RESPONSE);
        }

        const employee = await Employee.findOne({
            $or: [
                { email: email.toLowerCase().trim() },
                { id: email.trim() }
            ]
        });

        if (!employee) {
            return res.json(GENERIC_RESPONSE);
        }

        if (employee.emailVerified) {
            return res.json(GENERIC_RESPONSE);
        }

        const now = new Date();
        const windowStart = employee.verificationWindowStart ? new Date(employee.verificationWindowStart) : null;
        const lastSent = employee.lastVerificationSentAt ? new Date(employee.lastVerificationSentAt) : null;

        let sentCount = employee.verificationSentCount || 0;
        let currentWindowStart = windowStart;
        if (!windowStart || (now.getTime() - windowStart.getTime()) > 24 * 60 * 60 * 1000) {
            currentWindowStart = now;
            sentCount = 0;
        }

        // 1 per 5 minutes
        if (lastSent && (now.getTime() - lastSent.getTime()) < 5 * 60 * 1000) {
            return res.status(429).json({
                success: false,
                message: 'Please wait at least 5 minutes before requesting another verification email.'
            });
        }

        // 3 per 24 hours
        if (sentCount >= 3) {
            return res.status(429).json({
                success: false,
                message: 'Maximum verification email requests reached for today.'
            });
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashSha256(rawToken);

        employee.emailVerificationTokenHash = tokenHash;
        employee.emailVerificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
        employee.verificationSentCount = sentCount + 1;
        employee.verificationWindowStart = currentWindowStart;
        employee.lastVerificationSentAt = now;
        await employee.save();

        // Send email & in-app Notification for verification required
        try {
            const port = process.env.PORT || 5001;
            const baseUrl = process.env.FRONTEND_URL || `http://localhost:${port}`;
            const verifyLink = `${baseUrl}/verify-email?token=${rawToken}`;
            await sendEmail({
                to: employee.email,
                subject: 'Verify Your Email Address',
                text: `Please verify your email address by visiting: ${verifyLink}\nThis link expires in 24 hours.`
            });
        } catch (e) {
            console.error('[resendVerification] email send failed:', e.message);
        }

        const Notification = require('../models/Notification');
        try {
            await Notification.create({
                recipient: employee._id,
                type: 'general',
                title: 'Email Verification Required',
                message: 'A verification link has been sent to your registered email address.'
            });
        } catch (e) {
            console.error('[resendVerification] in-app notification error:', e.message);
        }

        return res.json(GENERIC_RESPONSE);
    } catch (err) {
        console.error('resendVerification error:', err);
        return res.status(500).json({ success: false, message: 'Server error requesting verification email.' });
    }
};

// POST /api/auth/2fa/verify
const verify2fa = async (req, res) => {
    try {
        const { employee_id, email, code, rememberMe } = req.body;
        if (!code || (!employee_id && !email)) {
            return res.status(400).json({ success: false, message: 'Employee ID/Email and 2FA code are required.' });
        }

        const employee = await Employee.findOne({
            $or: [
                { id: employee_id || email },
                { email: (email || employee_id || '').toLowerCase().trim() }
            ]
        });

        if (!employee) {
            return res.status(401).json({ success: false, message: 'Invalid employee or session.' });
        }

        if (employee.twofaLockedUntil && new Date() < new Date(employee.twofaLockedUntil)) {
            return res.status(403).json({
                success: false,
                message: 'Account locked due to too many failed 2FA attempts. Please try again later.'
            });
        }

        if (!employee.twofaCodeHash || !employee.twofaCodeExpiry) {
            return res.status(400).json({ success: false, message: 'No active 2FA session. Please request a new code.' });
        }

        if (new Date() > new Date(employee.twofaCodeExpiry)) {
            return res.status(400).json({ success: false, message: '2FA code has expired. Please request a new code.' });
        }

        const inputHash = hashSha256(String(code).trim());
        if (inputHash !== employee.twofaCodeHash) {
            employee.twofaAttempts = (employee.twofaAttempts || 0) + 1;
            if (employee.twofaAttempts >= 5) {
                employee.twofaLockedUntil = new Date(Date.now() + 15 * 60 * 1000);
                await employee.save();
                return res.status(403).json({
                    success: false,
                    message: 'Account locked for 15 minutes due to 5 failed 2FA attempts.'
                });
            }
            await employee.save();
            return res.status(400).json({
                success: false,
                message: 'Invalid 2FA code.',
                attemptsRemaining: 5 - employee.twofaAttempts
            });
        }

        // Code matched
        employee.twofaCodeHash = null;
        employee.twofaCodeExpiry = null;
        employee.twofaAttempts = 0;
        employee.twofaLockedUntil = null;
        await employee.save();

        const settings = await Setting.findOne();
        const authData = await generateAuthPayload(employee, rememberMe, settings);
        const needsEmailVerification = settings?.require_email_verification && !employee.emailVerified && employee.role !== 'admin';

        return res.json({
            success: true,
            message: '2FA verification successful',
            token: authData.token,
            refreshToken: authData.refreshToken,
            user: authData.user,
            email_verification_required: needsEmailVerification ? true : undefined,
            verify_email_prompt: needsEmailVerification ? true : undefined
        });
    } catch (err) {
        console.error('2FA verify error:', err);
        return res.status(500).json({ success: false, message: 'Server error during 2FA verification.' });
    }
};

// POST /api/auth/2fa/resend
const resend2fa = async (req, res) => {
    const GENERIC_RESPONSE = {
        success: true,
        message: 'If an account exists, a code has been sent.'
    };

    try {
        const { employee_id, email } = req.body;
        if (!employee_id && !email) {
            return res.json(GENERIC_RESPONSE);
        }

        const employee = await Employee.findOne({
            $or: [
                { id: employee_id || email },
                { email: (email || employee_id || '').toLowerCase().trim() }
            ]
        });

        if (!employee) {
            return res.json(GENERIC_RESPONSE);
        }

        if (employee.twofaLockedUntil && new Date() < new Date(employee.twofaLockedUntil)) {
            return res.json(GENERIC_RESPONSE);
        }

        const now = new Date();
        const window = employee.twofaSendWindow || {};
        const windowStart = window.windowStart ? new Date(window.windowStart) : null;
        const lastSent = window.lastSentAt ? new Date(window.lastSentAt) : null;

        let sentCount = window.sentCount || 0;
        let currentWindowStart = windowStart;
        if (!windowStart || (now.getTime() - windowStart.getTime()) > 60 * 60 * 1000) {
            currentWindowStart = now;
            sentCount = 0;
        }

        // Rate limits apply internally but do not alter response
        if (lastSent && (now.getTime() - lastSent.getTime()) < 60 * 1000) {
            return res.json(GENERIC_RESPONSE);
        }

        if (sentCount >= 5) {
            return res.json(GENERIC_RESPONSE);
        }

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        employee.twofaCodeHash = hashSha256(code);
        employee.twofaCodeExpiry = new Date(Date.now() + 10 * 60 * 1000);
        employee.twofaSendWindow = {
            sentCount: sentCount + 1,
            windowStart: currentWindowStart,
            lastSentAt: now
        };

        try {
            await sendEmail({
                to: employee.email,
                subject: 'Your Two-Factor Authentication (2FA) Code',
                text: `Your login verification code is: ${code}. It expires in 10 minutes.`
            });
        } catch (e) {
            console.error('[resend2fa] sendEmail failed:', e.message);
        }

        await employee.save();
        return res.json(GENERIC_RESPONSE);
    } catch (err) {
        console.error('2FA resend error:', err);
        return res.status(500).json({ success: false, message: 'Server error resending 2FA code.' });
    }
};

module.exports = { 
    login, 
    logout, 
    getMe, 
    refreshToken, 
    forgotPassword, 
    resetPassword,
    verifyEmail,
    resendVerification,
    verify2fa,
    resend2fa
};
