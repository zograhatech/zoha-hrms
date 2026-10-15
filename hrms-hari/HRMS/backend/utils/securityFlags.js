/**
 * Checks whether a security feature flag is enabled for a given employee.
 * Returns true if the flag is globally true in settings OR if the employee's ID is in security_pilot_employee_ids.
 *
 * @param {Object} settings - Settings document or object
 * @param {string} flag - Flag name, e.g. 'require_2fa' or 'require_email_verification'
 * @param {string} employeeId - Employee ID or _id
 * @returns {boolean}
 */
const isSecurityFlagOn = (settings, flag, employeeId) => {
    if (!settings) return false;
    if (Boolean(settings[flag])) return true;

    if (employeeId && Array.isArray(settings.security_pilot_employee_ids)) {
        const idStr = String(employeeId).trim();
        return settings.security_pilot_employee_ids.some(pid => String(pid).trim() === idStr);
    }

    return false;
};

/**
 * Checks whether browser push notifications are enabled for a given employee.
 * Returns true if enable_browser_push is true OR employee ID is in push_pilot_employee_ids.
 */
const isPushEnabled = (settings, employeeId) => {
    if (!settings) return false;
    if (Boolean(settings.enable_browser_push)) return true;

    if (employeeId && Array.isArray(settings.push_pilot_employee_ids)) {
        const idStr = String(employeeId).trim();
        return settings.push_pilot_employee_ids.some(pid => String(pid).trim() === idStr);
    }

    return false;
};

module.exports = { isSecurityFlagOn, isPushEnabled };

