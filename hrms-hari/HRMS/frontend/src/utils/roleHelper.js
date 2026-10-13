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


