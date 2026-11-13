/**
 * Strict Super Admin Authorization Helper
 * Validates that the user is genuinely a Super Admin, not an HR admin or regular admin.
 */

function isSuperAdminUser(user) {
    if (!user) return false;
    const status = (user.status || 'active').toLowerCase();
    if (status !== 'active') return false;

    const email = (user.email || '').toLowerCase().trim();
    const empId = (user.id || '').toUpperCase().trim();
    const designation = (user.designation || '').trim();
    const role = (user.role || '').toLowerCase().replace(/\s+/g, '');

    // Permanent Super Admins for the organization (never locked out by allowlist typos)
    const PERMANENT_SUPER_ADMINS = ['zograhatechnologies@gmail.com', 'adm002', 'admin@zograha.com'];
    if (PERMANENT_SUPER_ADMINS.includes(email) || PERMANENT_SUPER_ADMINS.includes(empId.toLowerCase())) {
        return true;
    }

    const allowlistStr = process.env.SUPER_ADMIN_ALLOWLIST || '';
    const allowlist = allowlistStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

    // If explicit allowlist is configured, user must match email or ID
    if (allowlist.length > 0) {
        return allowlist.includes(email) || allowlist.includes(empId.toLowerCase());
    }

    // Role or designation checks
    if (role === 'super_admin' || role === 'superadmin') return true;
    if (designation === 'Super Admin') return true;
    
    // An admin role is only Super Admin if they are NOT designated as a departmental or HR admin
    if (role === 'admin') {
        const lowerDesig = designation.toLowerCase();
        if (lowerDesig.includes('hr') || lowerDesig.includes('department') || lowerDesig.includes('branch')) {
            return false;
        }
        return true;
    }

    return false;
}

module.exports = {
    isSuperAdminUser
};
