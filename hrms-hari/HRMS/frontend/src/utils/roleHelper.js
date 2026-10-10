/**
 * Shared helper to check if a user possesses manager/admin privileges.
 * Recognizes: 'admin', 'hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'
 * Accepts either a user object ({ role: '...' }) or a role string ('admin').
 */
export const isManagerRole = (userOrRole) => {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    const roleLower = (role || '').toLowerCase().replace(/\s+/g, '');
    return ['admin', 'hrmanager', 'hrmanger', 'hr_manager', 'hr_manger'].includes(roleLower);
};

