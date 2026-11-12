/**
 * Super Admin Authorization Test
 * Verifies that GET /api/conversations/admin/* strictly enforces genuine Super Admin access
 * and blocks HR, departmental admins, and regular employees.
 */

const { isSuperAdminUser } = require('../utils/authHelper');
const conversationController = require('../controllers/conversationController');

function runTests() {
    console.log('=== Running Super Admin Authorization Tests ===\n');

    let passed = 0;
    let failed = 0;

    function assert(cond, desc) {
        if (cond) {
            console.log(`✅ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${desc}`);
            failed++;
        }
    }

    // 1. Employee role should be rejected
    assert(isSuperAdminUser({ id: 'EMP001', role: 'employee', status: 'active' }) === false, 'Employee is not Super Admin');

    // 2. HR role should be rejected
    assert(isSuperAdminUser({ id: 'HR001', role: 'hr', status: 'active' }) === false, 'HR role is not Super Admin');

    // 3. Admin with HR designation should be rejected
    assert(isSuperAdminUser({ id: 'ADM001', role: 'admin', designation: 'HR Admin', status: 'active' }) === false, 'Admin with HR Admin designation is rejected');

    // 4. Admin with Branch Manager designation should be rejected
    assert(isSuperAdminUser({ id: 'ADM002', role: 'admin', designation: 'Branch Admin', status: 'active' }) === false, 'Admin with Branch Admin designation is rejected');

    // 5. Inactive Super Admin should be rejected
    assert(isSuperAdminUser({ id: 'SA000', role: 'super_admin', status: 'inactive' }) === false, 'Inactive Super Admin is rejected');

    // 6. Super Admin role should be accepted
    assert(isSuperAdminUser({ id: 'SA001', role: 'super_admin', status: 'active' }) === true, 'role: super_admin is accepted');

    // 7. Designation "Super Admin" should be accepted
    assert(isSuperAdminUser({ id: 'SA002', role: 'admin', designation: 'Super Admin', status: 'active' }) === true, 'designation: Super Admin is accepted');

    // 8. Controller endpoint rejection simulation
    const mockRes = () => {
        const res = {
            statusCode: null,
            body: null,
            setHeader: () => {},
            status(code) {
                this.statusCode = code;
                return this;
            },
            json(data) {
                this.body = data;
                return this;
            }
        };
        return res;
    };

    // Test getAdminConversations with HR user
    const hrReq = { user: { id: 'HR01', role: 'hr', designation: 'HR Executive', status: 'active' }, query: {} };
    const hrRes = mockRes();
    conversationController.getAdminConversations(hrReq, hrRes);
    assert(hrRes.statusCode === 403, 'Controller rejects HR user with HTTP 403');
    assert(hrRes.body?.message?.includes('Forbidden'), 'Rejection message contains Forbidden');

    // Test getAdminConversations with non-super admin
    const nonSuperAdminReq = { user: { id: 'ADM02', role: 'admin', designation: 'HR Department Admin', status: 'active' }, query: {} };
    const nonSuperAdminRes = mockRes();
    conversationController.getAdminConversations(nonSuperAdminReq, nonSuperAdminRes);
    assert(nonSuperAdminRes.statusCode === 403, 'Controller rejects Departmental Admin with HTTP 403');

    // 9. Allowlist test
    process.env.SUPER_ADMIN_ALLOWLIST = 'specialadmin@zograha.com,EMP_SUPER_99';
    assert(isSuperAdminUser({ id: 'EMP_OTHER', email: 'random@zograha.com', role: 'admin', status: 'active' }) === false, 'Allowlist blocks non-whitelisted admin');
    assert(isSuperAdminUser({ id: 'EMP_SUPER_99', email: 'user@zograha.com', role: 'admin', status: 'active' }) === true, 'Allowlist permits EMP_SUPER_99');
    assert(isSuperAdminUser({ id: 'EMP_X', email: 'SpecialAdmin@Zograha.com', role: 'admin', status: 'active' }) === true, 'Allowlist permits case-insensitive email');

    delete process.env.SUPER_ADMIN_ALLOWLIST;

    console.log(`\nResults: ${passed} passed, ${failed} failed.`);
    if (failed > 0) process.exit(1);
}

runTests();
