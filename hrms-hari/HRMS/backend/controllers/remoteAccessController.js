const mongoose = require('mongoose');
const RemoteAccess = require('../models/RemoteAccess');
const AuditLog = require('../models/AuditLog');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');
const { getClientIp, validateCidr, parseIp } = require('../middleware/ipAccess');

// GET /api/remote-access (SuperAdmin only)
const getRemoteAccessList = async (req, res) => {
    try {
        const exceptions = await RemoteAccess.find().sort({ createdAt: -1 }).lean();
        return res.json({
            success: true,
            data: exceptions
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve remote access exceptions: ' + err.message
        });
    }
};

// POST /api/remote-access (SuperAdmin only)
const grantRemoteAccess = async (req, res) => {
    try {
        const { employee_id, expiresAt, allowedIp } = req.body;

        if (!employee_id || typeof employee_id !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'employee_id is required.'
            });
        }

        // Validate allowedIp if provided (must be valid IP or CIDR)
        if (allowedIp) {
            const trimmed = allowedIp.trim();
            const isValid = validateCidr(trimmed) || parseIp(trimmed) !== null;
            if (!isValid) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid IP or CIDR format for allowedIp: "${allowedIp}".`
                });
            }
        }

        let parsedExpiry = null;
        if (expiresAt) {
            parsedExpiry = new Date(expiresAt);
            if (isNaN(parsedExpiry.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid date format for expiresAt.'
                });
            }
        }

        const grantedBy = req.user.id || req.user.name || 'SuperAdmin';

        const record = await RemoteAccess.create({
            employee_id: employee_id.trim(),
            grantedBy,
            expiresAt: parsedExpiry,
            allowedIp: allowedIp ? allowedIp.trim() : null,
            active: true
        });

        // AuditLog entry
        try {
            await AuditLog.create({
                user_id: req.user._id || req.user.id,
                action: 'CREATE',
                resource: 'RemoteAccess',
                resource_id: record._id,
                new_value: {
                    employee_id: record.employee_id,
                    grantedBy: record.grantedBy,
                    expiresAt: record.expiresAt,
                    allowedIp: record.allowedIp,
                    active: record.active
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('[grantRemoteAccess] AuditLog creation failed:', auditErr.message);
        }

        // In-app notification & Email to employee
        try {
            const emp = await Employee.findOne({
                $or: [
                    { id: record.employee_id },
                    ...(mongoose.Types.ObjectId.isValid(record.employee_id) ? [{ _id: record.employee_id }] : [])
                ]
            }).lean();

            if (emp) {
                await Notification.create({
                    recipient: emp._id,
                    type: 'general',
                    title: 'Remote Access Granted',
                    message: `You have been granted remote access${record.expiresAt ? ` until ${new Date(record.expiresAt).toLocaleString()}` : ' until revoked'}.`,
                    data: { status: 'granted' }
                });

                if (emp.email) {
                    sendEmail({
                        to: emp.email,
                        subject: 'Remote Access Granted',
                        text: `Hello ${emp.name || ''},\n\nYou have been granted remote access${record.expiresAt ? ` until ${new Date(record.expiresAt).toLocaleString()}` : ' until revoked'}.\n\nRegards,\nHRMS Team`
                    }).catch(emailErr => console.error('[grantRemoteAccess] Email send failed:', emailErr.message));
                }
            }
        } catch (notifErr) {
            console.error('[grantRemoteAccess] Notification creation failed:', notifErr.message);
        }

        return res.status(201).json({
            success: true,
            data: record
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to grant remote access: ' + err.message
        });
    }
};

// DELETE /api/remote-access/:id or /api/remote-access (SuperAdmin only)
const revokeRemoteAccess = async (req, res) => {
    try {
        const id = req.params.id || req.body.id;
        const employeeId = req.body.employee_id || req.query.employee_id;

        let query = {};
        if (id) {
            query._id = id;
        } else if (employeeId) {
            query.employee_id = employeeId;
            query.active = true;
        } else {
            return res.status(400).json({
                success: false,
                message: 'Exception ID or employee_id is required to revoke remote access.'
            });
        }

        const record = await RemoteAccess.findOneAndUpdate(
            query,
            { $set: { active: false } },
            { new: true }
        );

        if (!record) {
            return res.status(404).json({
                success: false,
                message: 'Remote access record not found.'
            });
        }

        // AuditLog entry
        try {
            await AuditLog.create({
                user_id: req.user._id || req.user.id,
                action: 'DELETE',
                resource: 'RemoteAccess',
                resource_id: record._id,
                new_value: {
                    employee_id: record.employee_id,
                    active: false
                },
                ip_address: getClientIp(req),
                user_agent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('[revokeRemoteAccess] AuditLog creation failed:', auditErr.message);
        }

        // In-app notification & Email to employee
        try {
            const emp = await Employee.findOne({
                $or: [
                    { id: record.employee_id },
                    ...(mongoose.Types.ObjectId.isValid(record.employee_id) ? [{ _id: record.employee_id }] : [])
                ]
            }).lean();

            if (emp) {
                await Notification.create({
                    recipient: emp._id,
                    type: 'general',
                    title: 'Remote Access Revoked',
                    message: 'Your remote access exception has been revoked.',
                    data: { status: 'revoked' }
                });

                if (emp.email) {
                    sendEmail({
                        to: emp.email,
                        subject: 'Remote Access Revoked',
                        text: `Hello ${emp.name || ''},\n\nYour remote access exception has been revoked.\n\nRegards,\nHRMS Team`
                    }).catch(emailErr => console.error('[revokeRemoteAccess] Email send failed:', emailErr.message));
                }
            }
        } catch (notifErr) {
            console.error('[revokeRemoteAccess] Notification creation failed:', notifErr.message);
        }

        return res.json({
            success: true,
            message: 'Remote access exception revoked.',
            data: record
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to revoke remote access: ' + err.message
        });
    }
};

module.exports = {
    getRemoteAccessList,
    grantRemoteAccess,
    revokeRemoteAccess
};

