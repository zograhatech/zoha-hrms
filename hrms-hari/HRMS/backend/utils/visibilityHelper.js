const Employee = require('../models/Employee');
const Department = require('../models/Department');

/**
 * Normalizes role string to canonical role: admin, manager, team_lead, employee.
 */
function normalizeRole(role) {
    const r = (role || '').toLowerCase().replace(/\s+/g, '');
    if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(r)) return 'manager';
    if (r === 'hr') return 'team_lead';
    return r;
}

/**
 * Resolves the list of employee IDs (string IDs, e.g. "EMP001") visible to the calling user.
 * - admin: all employees (returns null, meaning unrestricted)
 * - manager: employees whose department_id is in departments where Department.manager_id is caller.id
 * - team_lead: employees whose team_lead_id is caller.id
 * - employee: only caller.id
 *
 * @param {Object} user Decoded JWT user or Employee object
 * @returns {Promise<{ isAll: boolean, visibleIds: string[] }>}
 */
async function getVisibleEmployeeScope(user) {
    if (!user) return { isAll: false, visibleIds: [] };

    const role = normalizeRole(user.role);

    // 1. Super Admin: all employees
    if (role === 'admin') {
        return { isAll: true, visibleIds: [] };
    }

    // 2. Manager: employees whose department_id is in departments where Department.manager_id is caller.id
    if (role === 'manager') {
        const managedDepts = await Department.find({ manager_id: user.id }).select('_id').lean();
        const deptIds = managedDepts.map(d => d._id);
        const emps = await Employee.find({
            $or: [
                { department_id: { $in: deptIds } },
                { id: user.id } // Manager can always see self
            ]
        }).select('id').lean();
        return { isAll: false, visibleIds: emps.map(e => e.id) };
    }

    // 3. Team Lead: employees in the team lead's department, or whose team_lead_id is caller.id, plus self
    if (role === 'team_lead') {
        const tlIds = [user.id];
        if (user._id) tlIds.push(user._id.toString());

        // Resolve team lead's department_id
        let userDeptId = user.department_id;
        if (!userDeptId) {
            const tlDoc = await Employee.findOne({
                $or: [
                    { id: user.id },
                    ...(user._id ? [{ _id: user._id }] : [])
                ]
            }).select('department_id').lean();
            userDeptId = tlDoc?.department_id;
        }

        const orConditions = [
            { team_lead_id: { $in: tlIds } },
            { id: user.id } // Team Lead can always see self
        ];

        if (userDeptId) {
            orConditions.push({ department_id: userDeptId });
        }

        const emps = await Employee.find({ $or: orConditions }).select('id').lean();
        return { isAll: false, visibleIds: emps.map(e => e.id) };
    }

    // 4. Employee: only self
    return { isAll: false, visibleIds: [user.id] };
}

/**
 * Validates if the requested employeeId is visible to the user.
 * Throws an error or returns false if out of scope.
 */
async function isEmployeeVisible(user, targetEmployeeId) {
    const scope = await getVisibleEmployeeScope(user);
    if (scope.isAll) return true;
    return scope.visibleIds.includes(targetEmployeeId);
}

module.exports = {
    normalizeRole,
    getVisibleEmployeeScope,
    isEmployeeVisible
};

