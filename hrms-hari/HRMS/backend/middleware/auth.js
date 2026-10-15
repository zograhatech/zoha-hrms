const jwt = require('jsonwebtoken');
const Setting = require('../models/Setting');
const Employee = require('../models/Employee');

/**
 * Authorization Middleware
 * Validates the JWT and checks if the user has the required individual module access.
 * Strict Individual Override: If any individual modules are granted, they completely replace role-based defaults.
 */
const auth = (rolesOrPermissions = []) => {
    return async (req, res, next) => {
        const authHeader = req.headers['authorization'];
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'Access denied. Please login to continue.' });
        }

        const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;

        // ── Device Token Handling (for Idle Companion) ───────────────
        if (token.startsWith('dev_')) {
            const crypto = require('crypto');
            const DeviceToken = require('../models/DeviceToken');

            // Whitelist: strictly GET /api/attendance/idle-policy and POST /api/attendance/auto-clock-out
            const cleanPath = (req.baseUrl || '') + (req.path || '');
            const method = req.method.toUpperCase();

            const isIdlePolicy = method === 'GET' && cleanPath === '/api/attendance/idle-policy';
            const isAutoClockOut = method === 'POST' && cleanPath === '/api/attendance/auto-clock-out';

            if (!isIdlePolicy && !isAutoClockOut) {
                return res.status(403).json({
                    success: false,
                    message: 'Device token unauthorized for this route.'
                });
            }

            const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
            const now = new Date();

            const deviceTokenDoc = await DeviceToken.findOne({
                token_hash: tokenHash,
                revoked: false,
                expires_at: { $gt: now }
            });

            if (!deviceTokenDoc) {
                return res.status(401).json({
                    success: false,
                    message: 'Invalid, revoked, or expired device token.'
                });
            }

            // Load employee, require status active
            const employee = await Employee.findOne({ id: deviceTokenDoc.employee_id }).select('role status').lean();
            if (!employee || employee.status !== 'active') {
                return res.status(403).json({
                    success: false,
                    message: 'Your account is deactivated or not found.'
                });
            }

            // Keep the existing IP check
            const { checkIpAccess } = require('./ipAccess');
            const ipAllowed = await checkIpAccess(req, res, employee.role);
            if (!ipAllowed) return;

            // Set req.user
            req.user = {
                id: deviceTokenDoc.employee_id,
                _id: employee._id,
                role: employee.role,
                is_device_token: true
            };

            // Update last_used_at at most once per hour
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (!deviceTokenDoc.last_used_at || deviceTokenDoc.last_used_at < oneHourAgo) {
                DeviceToken.updateOne({ _id: deviceTokenDoc._id }, { $set: { last_used_at: new Date() } }).catch(err => {
                    console.error('[auth] Failed to update device token last_used_at:', err);
                });
            }

            return next();
        }

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;

            // 1. Super Admin Bypass - Complete System Access for admin only
            const roleLower = (decoded.role || '').toLowerCase().replace(/\s+/g, '');
            if (roleLower === 'admin') return next();

            // 2. Fetch required identity data in parallel for speed
            const [employee, settings] = await Promise.all([
                Employee.findOne({ id: decoded.id }).select('permissions role status emailVerified').lean(),
                Setting.findOne().lean()
            ]);

            if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found.' });
            if (employee.status !== 'active') return res.status(403).json({ success: false, message: 'Your account is deactivated.' });

            // IP Access Control Check
            const { checkIpAccess } = require('./ipAccess');
            const ipAllowed = await checkIpAccess(req, res, employee.role);
            if (!ipAllowed) return;

            // 3. Resolve requested permissions
            if (!rolesOrPermissions || rolesOrPermissions.length === 0) return next();

            // Helper to normalize legacy roles
            const normalizeRole = (role) => {
                const r = (role || '').toLowerCase().replace(/\s+/g, '');
                if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
                if (r === 'hr') return 'team_lead';
                return r;
            };

            // 3. Resolve permissions
            const rawRole = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
            const normalizedRole = normalizeRole(rawRole);
            const rolePermissions = settings?.roles_permissions?.[normalizedRole] ||
                settings?.roles_permissions?.[rawRole] ||
                (normalizedRole === 'manager' ? settings?.roles_permissions?.['hr_manager'] : undefined) ||
                (normalizedRole === 'team_lead' ? settings?.roles_permissions?.['hr'] : undefined) ||
                [];

            let userPermissions;
            if (employee.permissions && Array.isArray(employee.permissions)) {
                userPermissions = employee.permissions;
            } else {
                const isManager = ['admin', 'manager'].includes(normalizedRole);
                const isTeamLead = normalizedRole === 'team_lead';
                
                const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];
                const basePerms = (isManager || isTeamLead) ? (rolePermissions || []) : [];
                userPermissions = [...new Set([...basePerms, ...BASIC_PERMISSIONS])];
            }
            
            // Mapping for route requirements to module keys
            const REVERSE_PERMISSION_MAP = {
                'manage_employees': ['manage_employees', 'employees'],
                'manage_attendance': ['manage_attendance', 'attendance_report'],
                'attendance_user': ['attendance_user'],
                'leave_apply': ['leave_apply'],
                'payroll_user': ['payroll_user'],
                'manage_leaves': ['manage_leaves', 'analytics'],
                'manage_payroll': ['manage_payroll', 'payroll', 'analytics'],
                'payroll_admin': ['payroll', 'analytics'],
                'manage_settings': ['manage_settings', 'assets', 'inventory', 'tally_accounting', 'tally_inventory', 'zoom_settings'],
                'manage_events': ['manage_events', 'events'],
                'all_tickets': ['all_tickets', 'tickets_all', 'analytics'],
                'manage_tickets': ['all_tickets', 'tickets_all', 'analytics'],
                'tickets_user': ['tickets_user'],
                'manage_resignations': ['exit', 'exit_approve'],
                'exit_approve': ['exit_approve'],
                'exit_user': ['exit_user'],
                'view_analytics': ['analytics'],
                'manage_zoom': ['zoom_create', 'zoom_settings'],
                'recruitment': ['recruitment'],
                'lms': ['lms'],
                'fun_summary': ['fun'],
                'dashboard': ['dashboard'],
                'profile': ['profile'],
                'events': ['events'],
                'manage_documents': ['manage_documents', 'documents'],
                'documents_user': ['documents_user']
            };

            const hasAccess = rolesOrPermissions.some(requested => {
                const req = requested.toLowerCase().replace(/\s+/g, '');

                // 1. Direct permission match
                if (userPermissions.includes(requested)) return true;

                // 2. Role Identity Fallback - If the requirement is a base role (like 'manager', 'team_lead', 'employee'), 
                // allow it based on the user's actual role field, as these are not lockable 'modules'.
                const rawRole = (employee.role || '').toLowerCase().replace(/\s+/g, '');
                const userNormalized = normalizeRole(rawRole);
                const reqNormalized = normalizeRole(req);
                if (userNormalized === reqNormalized || rawRole === req) return true;

                // 3. Mapping for route requirements to module keys
                const mappedKeys = REVERSE_PERMISSION_MAP[requested] || [];
                if (mappedKeys.some(mk => userPermissions.includes(mk))) return true;

                if (requested === 'tally' && (userPermissions.some(p => p.startsWith('tally_')))) return true;
                return false;
            });

            if (hasAccess) return next();

            return res.status(403).json({
                success: false,
                message: `Individual access to this module was not granted by the HR Manager.`,
                code: 'ACCESS_RESTRICTED'
            });

        } catch (err) {
            return res.status(401).json({ success: false, message: 'Invalid session.' });
        }
    };
};

module.exports = auth;
