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
