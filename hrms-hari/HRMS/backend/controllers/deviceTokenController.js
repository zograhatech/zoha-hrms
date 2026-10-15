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

        res.json({
            success: true,
            tokens
        });
    } catch (err) {
        console.error('[listDeviceTokens]', err);
        res.status(500).json({ success: false, message: 'Server error listing device tokens.' });
    }
};

module.exports = {
    issueDeviceToken,
    revokeDeviceToken,
    listDeviceTokens
};

