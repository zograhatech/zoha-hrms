/**
 * Shared helper to check if a user possesses manager/admin privileges.
 * Recognizes: 'admin' (Super Admin), 'hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'
 * Accepts either a user object ({ role: '...' }) or a role string ('admin').
 */
export const isManagerRole = (userOrRole) => {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
    return ['admin', 'manager', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleLower);
};

/**
 * Get display label for a role value.
 * Stored values: 'admin', 'manager', 'team_lead', 'employee'
 * Display labels: 'Super Admin', 'Manager', 'Team Lead', 'Employee'
 */
export const getRoleDisplayLabel = (role) => {
    const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
    const labels = {
        'admin': 'Super Admin',
        'manager': 'Manager',
        'team_lead': 'Team Lead',
        'employee': 'Employee',
        // Legacy roles - map to new roles for display
        'hr_manager': 'Manager',
        'hrmanager': 'Manager',
        'hrmanger': 'Manager',
        'hr_manger': 'Manager',
        'hr': 'Team Lead'
    };
    return labels[roleLower] || role;
};

/**
 * Check if a role is a Super Admin (stored as 'admin')
 */
export const isSuperAdmin = (userOrRole) => {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    return (role || '').toLowerCase().replace(/\s+/g, '') === 'admin';
};

/**
 * Check if a role is a Team Lead (stored as 'team_lead' or legacy 'hr')
 */
export const isTeamLead = (userOrRole) => {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
    return ['team_lead', 'hr'].includes(roleLower);
};

/**
 * Normalize role mapping legacy to new standard
 */
export const normalizeRole = (role) => {
    const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
    if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(roleLower)) return 'manager';
    if (roleLower === 'hr') return 'team_lead';
    return roleLower;
};

/**
 * Check if a user can access a specific module based on role grants or individual permissions.
 */
export const canAccessModule = (user, module) => {
    // 1. Manager and Admin bypass: keep existing full access
    if (isManagerRole(user)) return true;

    const role = typeof user === 'string' ? user : user?.role;
    const userRole = normalizeRole(role || '');
    const modulesToCheck = Array.isArray(module) ? module : [module];

    // 2. Role grants for team_lead: attendance_report, leave, employees, performance
    if (userRole === 'team_lead') {
        const tlGranted = ['attendance_report', 'leave', 'employees', 'performance'];
        if (modulesToCheck.some(m => tlGranted.includes(m))) {
            return true;
        }
    }

    // 3. Fallback to existing permission logic
    const userPermissions = (typeof user === 'object' && user?.permissions) ? user.permissions : [];
    if (userPermissions.length === 0) {
        return true; // Empty permissions fallback to role defaults
    }

    return modulesToCheck.some(m => {
        if (userPermissions.includes(m)) return true;
        if (m === 'attendance' && userPermissions.includes('attendance_user')) return true;
        if (m === 'leave' && userPermissions.includes('leave_apply')) return true;
        if (m === 'payroll' && userPermissions.includes('payroll_user')) return true;
        if (m === 'tickets' && userPermissions.includes('tickets_user')) return true;
        if (m === 'chat' && (userPermissions.includes('chat') || userPermissions.includes('live_chat'))) return true;
        if (m === 'employees' && userPermissions.includes('manage_employees')) return true;
        if (m === 'payroll_admin' && userPermissions.includes('payroll')) return true;
        if (m === 'attendance_report' && userPermissions.includes('manage_attendance')) return true;
        if (m === 'tickets_all' && userPermissions.includes('all_tickets')) return true;
        if (m === 'fun' && userPermissions.includes('fun_summary')) return true;
        if (m === 'shifts' && userPermissions.includes('manage_shifts')) return true;
        if (m === 'lms' && userPermissions.includes('lms')) return true;
        if (m === 'exit' && (userPermissions.includes('exit') || userPermissions.includes('exit_approve'))) return true;
        return false;
    });
};



