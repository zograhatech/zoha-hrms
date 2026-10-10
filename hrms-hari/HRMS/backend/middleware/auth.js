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

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            req.user = decoded;

            // 1. HR Manager / Admin Bypass - Complete System Access
            const roleLower = (decoded.role || '').toLowerCase().replace(/\s+/g, '');
            const isPowerfulRole = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleLower);
            if (isPowerfulRole) return next();

            // 1. Resolve requested permissions
            if (!rolesOrPermissions || rolesOrPermissions.length === 0) return next();

            // 2. Fetch required identity data in parallel for speed
            const [employee, settings] = await Promise.all([
                Employee.findOne({ id: decoded.id }).select('permissions role status').lean(),
                Setting.findOne().lean()
            ]);

            if (!employee) return res.status(404).json({ success: false, message: 'Employee profile not found.' });
            if (employee.status !== 'active') return res.status(403).json({ success: false, message: 'Your account is deactivated.' });

            // 3. Resolve permissions
            const roleKey = (employee.role || 'employee').toLowerCase().replace(/\s+/g, '');
            const matchedKey = Object.keys(settings?.roles_permissions || {}).find(k => k.toLowerCase().replace(/\s+/g, '') === roleKey) || employee.role;
            const rolePermissions = settings?.roles_permissions?.[matchedKey] || [];

            let userPermissions;
            if (employee.permissions && Array.isArray(employee.permissions)) {
                userPermissions = employee.permissions;
            } else {
                const roleKeyTrimmed = (employee.role || '').toLowerCase().replace(/\s+/g, '');
                const isManager = ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleKeyTrimmed);
                
                const BASIC_PERMISSIONS = ['dashboard', 'profile', 'attendance_user', 'leave_apply', 'payroll_user', 'tickets_user', 'events', 'exit_user'];
                const basePerms = isManager ? (rolePermissions || []) : [];
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

                // 2. Role Identity Fallback - If the requirement is a base role (like 'hr' or 'employee'), 
                // allow it based on the user's actual role field, as these are not lockable 'modules'.
                const roleKeyTrimmed = (employee.role || '').toLowerCase().replace(/\s+/g, '');
                if (roleKeyTrimmed === req) return true;

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
