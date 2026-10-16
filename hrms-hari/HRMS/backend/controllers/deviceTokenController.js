const crypto = require('crypto');
const DeviceToken = require('../models/DeviceToken');
const Employee = require('../models/Employee');
const AuditLog = require('../models/AuditLog');

// POST /api/devices/tokens
// Body: { employee_id, device_name }
const issueDeviceToken = async (req, res) => {
    try {
        const { employee_id, device_name } = req.body;
        if (!employee_id) {
            return res.status(400).json({ success: false, message: 'employee_id is required.' });
        }

        const employee = await Employee.findOne({ id: employee_id }).lean();
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Generate "dev_" + 32 random bytes as hex
        const plainToken = 'dev_' + crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

        const deviceTokenDoc = await DeviceToken.create({
            employee_id: employee.id,
            token_hash: tokenHash,
            device_name: device_name || 'Windows PC',
            created_by: req.user.id || req.user.username || 'admin',
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            revoked: false
        });

        // AuditLog
        try {
            await AuditLog.create({
                user_id: req.user._id || employee._id,
                action: 'CREATE',
                resource: 'DeviceToken',
                resource_id: deviceTokenDoc._id,
                new_value: {
                    employee_id: employee.id,
                    device_name: deviceTokenDoc.device_name,
                    expires_at: deviceTokenDoc.expires_at
                },
                ip_address: req.ip
            });
        } catch (auditErr) {
            console.error('[issueDeviceToken] Failed to log audit:', auditErr);
        }

        res.status(201).json({
            success: true,
            message: 'Device token issued successfully. Store this token securely; it will not be shown again.',
            token: plainToken,
            device: {
                id: deviceTokenDoc._id,
                employee_id: deviceTokenDoc.employee_id,
                device_name: deviceTokenDoc.device_name,
                expires_at: deviceTokenDoc.expires_at,
                created_at: deviceTokenDoc.createdAt
            }
        });
    } catch (err) {
        console.error('[issueDeviceToken]', err);
        res.status(500).json({ success: false, message: 'Server error issuing device token.' });
    }
};

// DELETE /api/devices/tokens/:id
const revokeDeviceToken = async (req, res) => {
    try {
        const { id } = req.params;
        const deviceToken = await DeviceToken.findById(id);
        if (!deviceToken) {
            return res.status(404).json({ success: false, message: 'Device token not found.' });
        }

        deviceToken.revoked = true;
        await deviceToken.save();

        try {
            await AuditLog.create({
                user_id: req.user._id,
                action: 'UPDATE',
                resource: 'DeviceToken',
                resource_id: deviceToken._id,
                old_value: { revoked: false },
                new_value: { revoked: true },
                ip_address: req.ip
            });
        } catch (auditErr) {
            console.error('[revokeDeviceToken] Failed to log audit:', auditErr);
        }

        res.json({
            success: true,
            message: 'Device token revoked successfully.'
        });
    } catch (err) {
        console.error('[revokeDeviceToken]', err);
        res.status(500).json({ success: false, message: 'Server error revoking device token.' });
    }
};

// GET /api/devices/tokens
// Returns metadata only, never hash or token
const listDeviceTokens = async (req, res) => {
    try {
        const tokens = await DeviceToken.find()
            .select('-token_hash')
            .sort({ createdAt: -1 })
            .lean();

        const empIds = [...new Set(tokens.map(t => t.employee_id).filter(Boolean))];
        const employees = await Employee.find({ id: { $in: empIds } }).select('id name').lean();
        const empMap = Object.fromEntries(employees.map(e => [e.id, e.name]));

        const enrichedTokens = tokens.map(t => ({
            ...t,
            employee_name: empMap[t.employee_id] || t.employee_id
        }));

        res.json({
            success: true,
            tokens: enrichedTokens
        });
    } catch (err) {
        console.error('[listDeviceTokens]', err);
        res.status(500).json({ success: false, message: 'Server error listing device tokens.' });
    }
};

const ENROLL_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const generateEnrollmentCode = () => {
    let code = '';
    for (let i = 0; i < 10; i++) {
        const idx = crypto.randomInt(0, ENROLL_ALPHABET.length);
        code += ENROLL_ALPHABET[idx];
    }
    return code;
};

// POST /api/devices/enrollment-codes (role admin only)
const sendSetupCode = async (req, res) => {
    try {
        const { employee_id } = req.body;
        if (!employee_id) {
            return res.status(400).json({ success: false, message: 'employee_id is required.' });
        }

        const Setting = require('../models/Setting');
        const settings = await Setting.findOne().lean();
        const downloadUrl = (settings?.companion_download_url || '').trim();
        if (!downloadUrl) {
            return res.status(400).json({
                success: false,
                message: 'Set the companion download link in Settings first.'
            });
        }

        const employee = await Employee.findOne({ id: employee_id }).lean();
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        if (employee.status !== 'active') {
            return res.status(400).json({ success: false, message: 'Employee is not active.' });
        }

        const EnrollmentCode = require('../models/EnrollmentCode');
        const { sendEmail } = require('../utils/emailService');

        // Invalidate older unused codes for this employee
        await EnrollmentCode.updateMany(
            { employee_id: employee.id, used_at: null },
            { $set: { used_at: new Date(), expires_at: new Date(0) } }
        );

        // Generate 10-char code from unambiguous alphabet
        const plainCode = generateEnrollmentCode();
        const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

        const enrollmentDoc = await EnrollmentCode.create({
            employee_id: employee.id,
            code_hash: codeHash,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
            used_at: null,
            created_by: req.user.id || req.user.username || 'admin'
        });

        // Email the employee
        const subject = 'Set up Zograha Idle Companion';
        const text = `Hello ${employee.name},

You have been invited to set up the Zograha Idle Companion on your Windows PC.

Download Link: ${downloadUrl}
One-time Enrollment Code: ${plainCode}
Expiry: This code expires in 24 hours (${enrollmentDoc.expires_at.toISOString()}).

Two-step setup instructions:
1. Run the file: Download and run the companion file from the link above.
2. Enter the code: When prompted, enter your one-time enrollment code (${plainCode}).

If you did not request this, please contact your administrator.`;

        const html = `
            <div style="font-size: 1rem; color: #1e293b;">
                <h2>Set up Zograha Idle Companion</h2>
                <p>Hello <strong>${employee.name}</strong>,</p>
                <p>You have been invited to set up the Zograha Idle Companion on your Windows PC.</p>
                <div style="background: #f1f5f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
                    <p style="margin: 6px 0;"><strong>Download Link:</strong> <a href="${downloadUrl}">${downloadUrl}</a></p>
                    <p style="margin: 6px 0;"><strong>One-time Code:</strong> <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; letter-spacing: 2px;">${plainCode}</span></p>
                    <p style="margin: 6px 0; font-size: 0.85rem; color: #64748b;">Expires in 24 hours (${enrollmentDoc.expires_at.toUTCString()})</p>
                </div>
                <h3>Two setup steps:</h3>
                <ol style="line-height: 1.8;">
                    <li><strong>Step 1 (Run the file):</strong> Download and run the companion installer from the link above.</li>
                    <li><strong>Step 2 (Enter the code):</strong> When prompted, enter your one-time code: <strong style="font-family: monospace;">${plainCode}</strong>.</li>
                </ol>
            </div>
        `;

        let emailSent = false;
        try {
            emailSent = await sendEmail({
                to: employee.email,
                subject,
                text,
                html,
                code: plainCode
            });
        } catch (e) {
            emailSent = false;
        }

        if (!emailSent) {
            await EnrollmentCode.updateOne(
                { _id: enrollmentDoc._id },
                { $set: { used_at: new Date(), expires_at: new Date(0) } }
            );
            return res.status(500).json({
                success: false,
                message: 'Failed to send setup email to employee. The enrollment code has been invalidated. Please try again.'
            });
        }

        // AuditLog
        try {
            await AuditLog.create({
                user_id: req.user._id || req.user.id,
                action: 'CREATE',
                resource: 'EnrollmentCode',
                resource_id: enrollmentDoc._id,
                new_value: {
                    employee_id: employee.id,
                    expires_at: enrollmentDoc.expires_at
                },
                ip_address: req.ip
            });
        } catch (auditErr) {
            console.error('[sendSetupCode] Failed to log audit:', auditErr);
        }

        // Return { success, expires_at }. Never return code or hash.
        return res.status(201).json({
            success: true,
            expires_at: enrollmentDoc.expires_at
        });
    } catch (err) {
        console.error('[sendSetupCode]', err);
        return res.status(500).json({ success: false, message: 'Server error creating setup code.' });
    }
};

// POST /api/devices/enroll (public, rate limited)
const enrollDevice = async (req, res) => {
    try {
        const { code, device_name } = req.body;
        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired code.'
            });
        }

        const EnrollmentCode = require('../models/EnrollmentCode');
        const codeHash = crypto.createHash('sha256').update(code.trim()).digest('hex');
        const now = new Date();

        const enrollmentDoc = await EnrollmentCode.findOne({
            code_hash: codeHash,
            used_at: null,
            expires_at: { $gt: now }
        });

        if (!enrollmentDoc) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired code.'
            });
        }

        const employee = await Employee.findOne({ id: enrollmentDoc.employee_id }).select('id name status').lean();
        if (!employee || employee.status !== 'active') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired code.'
            });
        }

        // Mark code used
        enrollmentDoc.used_at = new Date();
        await enrollmentDoc.save();

        // Create DeviceToken
        const plainToken = 'dev_' + crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');

        const rawDeviceName = typeof device_name === 'string' ? device_name.trim().slice(0, 60) : '';
        const finalDeviceName = rawDeviceName || 'Windows PC';

        const deviceTokenDoc = await DeviceToken.create({
            employee_id: employee.id,
            token_hash: tokenHash,
            device_name: finalDeviceName,
            created_by: 'enrollment',
            expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            revoked: false
        });

        return res.status(201).json({
            success: true,
            message: 'Device enrolled successfully.',
            token: plainToken,
            device: {
                id: deviceTokenDoc._id,
                employee_id: deviceTokenDoc.employee_id,
                device_name: deviceTokenDoc.device_name,
                expires_at: deviceTokenDoc.expires_at,
                created_at: deviceTokenDoc.createdAt
            }
        });
    } catch (err) {
        console.error('[enrollDevice]', err);
        return res.status(500).json({
            success: false,
            message: 'Server error during device enrollment.'
        });
    }
};

module.exports = {
    issueDeviceToken,
    revokeDeviceToken,
    listDeviceTokens,
    sendSetupCode,
    enrollDevice
};

