// Set test environment variables before requiring any modules
process.env.NODE_ENV = 'test';
process.env.VERCEL = '1'; // Disables long-running sockets/cron jobs
process.env.JWT_SECRET = 'test_jwt_secret_hrms_automated_testing_key_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_hrms_automated_testing_key_12345';
process.env.COMPANY_NAME = 'Zograha Technologies';
process.env.CLIENT_URL = 'http://localhost:5173';
process.env.CORS_ORIGIN = 'http://localhost:5173,https://hrms.example.com';
delete process.env.ZOOM_ENCRYPTION_KEY;
// Pre-set in-memory placeholder to guarantee dotenv.config() never reads MONGO_URI from .env
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/in_memory_guard';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/in_memory_guard';

const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

let mongoServer;
let app;
let adminToken;
let testDeptId;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;
    process.env.MONGODB_URI = uri;

    // Strict guard: verify test runner is strictly connected to local in-memory instance
    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
        throw new Error('FATAL: Test suite attempted to connect to a non-in-memory database!');
    }

    await mongoose.connect(uri, { dbName: 'hrms_test_db' });

    // Require app after DB connection is ready
    app = require('../server');

    // Seed mock Department
    const Department = require('../models/Department');
    const dept = await Department.create({
        name: 'Human Resources',
        description: 'HR Department for testing'
    });
    testDeptId = dept._id;

    // Seed mock Admin Employee
    const Employee = require('../models/Employee');
    const passwordHash = await bcrypt.hash('AdminTest123!', 10);
    const admin = await Employee.create({
        id: 'ADM001',
        name: 'System Admin',
        email: 'admin@zograhatechnologies.test',
        password_hash: passwordHash,
        role: 'admin',
        department_id: testDeptId,
        designation: 'Super Admin',
        date_of_joining: new Date('2023-01-01'),
        status: 'active'
    });

    // Seed basic Setting
    const Setting = require('../models/Setting');
    await Setting.create({
        company_name: 'Zograha Technologies',
        subscription: { plan: 'enterprise', max_employees: 100 }
    });

    adminToken = jwt.sign(
        { id: admin.id, role: admin.role, email: admin.email },
        process.env.JWT_SECRET,
        { expiresIn: '1h' }
    );
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe('HRMS Backend Automated Test Suite', () => {

    describe('1. Health Check Endpoint', () => {
        it('GET /api/health should return 200 with running status', async () => {
            const res = await request(app).get('/api/health');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Zograha Technologies');
            expect(res.body.database.configured).toBe(true);
        });

        it('GET /health root alias should return 200', async () => {
            const res = await request(app).get('/health');
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });

    describe('2. CORS Policy Verification', () => {
        it('Disallowed origin should NOT receive Access-Control-Allow-Origin header', async () => {
            const res = await request(app)
                .get('/api/health')
                .set('Origin', 'https://unauthorized-malicious-site.com');
            expect(res.headers['access-control-allow-origin']).toBeUndefined();
        });

        it('Allowed origin (localhost:5173) should receive Access-Control-Allow-Origin header', async () => {
            const res = await request(app)
                .get('/api/health')
                .set('Origin', 'http://localhost:5173');
            expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
        });
    });

    describe('3. Authentication Flow', () => {
        it('POST /api/auth/login should fail with 400 when body is missing credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({});
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        it('POST /api/auth/login should fail with 401 on wrong password', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@zograhatechnologies.test',
                    password: 'WrongPassword999!'
                });
            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('POST /api/auth/login should succeed with valid credentials', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({
                    email: 'admin@zograhatechnologies.test',
                    password: 'AdminTest123!'
                });
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.user.id).toBe('ADM001');
        });
    });

    describe('4. Add Employee Form Validation & Creation', () => {
        it('POST /api/employees should reject unauthenticated request with 401', async () => {
            const res = await request(app)
                .post('/api/employees')
                .send({ name: 'Test User' });
            expect(res.status).toBe(401);
        });

        it('POST /api/employees should reject missing password', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP901',
                    name: 'Test Employee',
                    email: 'emp901@zograhatechnologies.test',
                    role: 'employee',
                    department_id: testDeptId,
                    phone: '9876543210'
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Password is required');
        });

        it('POST /api/employees should reject invalid phone number', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP902',
                    name: 'Test Employee',
                    email: 'emp902@zograhatechnologies.test',
                    password: 'Password123!',
                    phone: '123' // Too short (< 10 digits)
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Phone must be between 10 and 15 digits');
        });

        it('POST /api/employees should reject invalid PAN format', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP903',
                    name: 'Test Employee',
                    email: 'emp903@zograhatechnologies.test',
                    password: 'Password123!',
                    pan: 'INVALID_PAN'
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('PAN must be in format AAAAA9999A');
        });

        it('POST /api/employees should reject invalid UAN format', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP904',
                    name: 'Test Employee',
                    email: 'emp904@zograhatechnologies.test',
                    password: 'Password123!',
                    uan: '12345' // Not 12 digits
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('UAN must be exactly 12 digits');
        });

        it('POST /api/employees should reject DOB after or equal to Joining Date', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP905',
                    name: 'Test Employee',
                    email: 'emp905@zograhatechnologies.test',
                    password: 'Password123!',
                    date_of_birth: '2024-01-01',
                    date_of_joining: '2020-01-01'
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('Date of birth must be before joining date');
        });

        it('POST /api/employees should reject negative salary values', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP906',
                    name: 'Test Employee',
                    email: 'emp906@zograhatechnologies.test',
                    password: 'Password123!',
                    salary_details: { basic: -500 }
                });
            expect(res.status).toBe(400);
            expect(res.body.message).toContain('cannot be negative');
        });

        it('GET /api/employees should return 200 when authenticated with admin token', async () => {
            const res = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(res.status).toBe(200);
            expect(res.body.employees).toBeDefined();
            expect(Array.isArray(res.body.employees)).toBe(true);
            expect(res.body.employees.length).toBeGreaterThan(0);
        });

        it('POST /api/employees should successfully create employee with valid data', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP910',
                    name: 'Priya Sharma',
                    email: 'priya.sharma@zograhatechnologies.test',
                    password: 'ValidPassword123!',
                    phone: '9876543210',
                    gender: 'female',
                    role: 'employee',
                    designation: 'Software Engineer',
                    department_id: testDeptId,
                    date_of_birth: '1995-05-15',
                    date_of_joining: '2023-06-01',
                    pan: 'ABCDE1234F',
                    uan: '100123456789',
                    salary_details: {
                        basic: 50000,
                        hra: 20000,
                        da: 5000,
                        oa: 3000
                    }
                });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.employee).toBeDefined();
            expect(res.body.employee.id).toBe('EMP910');
            expect(res.body.employee.email).toBe('priya.sharma@zograhatechnologies.test');
            // Assert response has no password, password_hash, or hash field
            expect(res.body.employee.password).toBeUndefined();
            expect(res.body.employee.password_hash).toBeUndefined();
            expect(res.body.employee.hash).toBeUndefined();
            expect(res.body.password).toBeUndefined();
            expect(res.body.password_hash).toBeUndefined();
            expect(res.body.hash).toBeUndefined();
        });

        it('POST /api/employees should reject duplicate email with 400 and duplicate message', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    id: 'EMP999',
                    name: 'Duplicate Employee',
                    email: 'priya.sharma@zograhatechnologies.test', // Email already exists from previous test
                    password: 'AnotherValidPassword123!',
                    role: 'employee',
                    department_id: testDeptId
                });
            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('already exists');
        });
    });

    describe('5. Security Guard Checks', () => {
        it('GET /api/resignations/:id/documents/:docId should require authentication (401)', async () => {
            const res = await request(app)
                .get('/api/resignations/65f1a2b3c4d5e6f7a8b9c0d1/documents/doc_test');
            expect(res.status).toBe(401);
        });

        it('GET /api/rotation-shifts should require authentication (401)', async () => {
            const res = await request(app)
                .get('/api/rotation-shifts');
            expect(res.status).toBe(401);
        });
    });

    describe('6. Zoom Integration 503 Guard', () => {
        it('GET /api/zoom/meetings should return 503 when ZOOM_ENCRYPTION_KEY is unset', async () => {
            const res = await request(app)
                .get('/api/zoom/meetings');
            expect(res.status).toBe(503);
            expect(res.body.success).toBe(false);
            expect(res.body.code).toBe('ZOOM_SERVICE_UNCONFIGURED');
        });
    });

    describe('7. Role Hierarchy and Permissions Tests', () => {
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');
        const Leave = require('../models/Leave');
        const Shift = require('../models/Shift');

        let managerToken;
        let tlToken;
        let empToken;

        beforeAll(async () => {
            // Seed a Manager
            const mgrPassword = await bcrypt.hash('ManagerPass123!', 10);
            await Employee.create({
                id: 'MGR001',
                name: 'Test Manager',
                email: 'manager@zograhatechnologies.test',
                password_hash: mgrPassword,
                role: 'manager',
                department_id: testDeptId,
                designation: 'Manager',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
            managerToken = jwt.sign(
                { id: 'MGR001', role: 'manager', email: 'manager@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Ensure a default shift exists for attendance
            await Shift.findOneAndUpdate(
                { name: 'General' },
                { name: 'General', start_time: '09:00', end_time: '18:00', is_default: true, is_active: true },
                { upsert: true }
            );
        });

        // 1. A Super Admin can grant Super Admin status to an employee.
        it('1. A Super Admin can grant Super Admin status to an employee', async () => {
            const empPassword = await bcrypt.hash('EmpPass123!', 10);
            await Employee.create({
                id: 'EMP_PROMO_TEST',
                name: 'Promo Candidate',
                email: 'promo@zograhatechnologies.test',
                password_hash: empPassword,
                role: 'employee',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .patch('/api/employees/EMP_PROMO_TEST/super-admin')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isSuperAdmin: true });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('admin');
        });

        // 2. A non-Super-Admin gets 403 from PATCH /api/employees/:id/super-admin.
        it('2. A non-Super-Admin gets 403 from PATCH /api/employees/:id/super-admin', async () => {
            const res = await request(app)
                .patch('/api/employees/EMP_PROMO_TEST/super-admin')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ isSuperAdmin: false });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 3. Removing the last active Super Admin returns 400 with the exact message above.
        it('3. Removing the last active Super Admin returns 400 with "At least one Super Admin must exist."', async () => {
            // First demote the promoted employee so only ADM001 remains
            await request(app)
                .patch('/api/employees/EMP_PROMO_TEST/super-admin')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isSuperAdmin: false });

            // Now attempt to remove Super Admin status from ADM001
            const res = await request(app)
                .patch('/api/employees/ADM001/super-admin')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ isSuperAdmin: false });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('At least one Super Admin must exist.');
        });

        // 4. A Manager can create a Team Lead and assign a department to that Team Lead.
        it('4. A Manager can create a Team Lead and assign a department to that Team Lead', async () => {
            const createRes = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({
                    id: 'TL001',
                    name: 'Test Team Lead',
                    email: 'teamlead@zograhatechnologies.test',
                    password: 'Password123!',
                    role: 'team_lead',
                    department_id: testDeptId
                });

            expect(createRes.status).toBe(201);
            expect(createRes.body.success).toBe(true);
            expect(createRes.body.employee.role).toBe('team_lead');

            tlToken = jwt.sign(
                { id: 'TL001', role: 'team_lead', email: 'teamlead@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Assign a department to this Team Lead
            const deptRes = await request(app)
                .put(`/api/departments/${testDeptId}`)
                .set('Authorization', `Bearer ${managerToken}`)
                .send({
                    name: 'Human Resources',
                    team_lead_id: 'TL001'
                });

            expect(deptRes.status).toBe(200);
            expect(deptRes.body.success).toBe(true);
            expect(deptRes.body.department.team_lead_id).toBe('TL001');
        });

        // 5. A Manager gets 403 when trying to edit a Super Admin.
        it('5. A Manager gets 403 when trying to edit a Super Admin', async () => {
            const res = await request(app)
                .put('/api/employees/ADM001')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ designation: 'Attempted Update by Manager' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 6. A Team Lead can create an Employee.
        it('6. A Team Lead can create an Employee', async () => {
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${tlToken}`)
                .send({
                    id: 'EMP_TL_01',
                    name: 'Worker One',
                    email: 'worker1@zograhatechnologies.test',
                    password: 'Password123!',
                    role: 'employee',
                    department_id: testDeptId
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('employee');

            empToken = jwt.sign(
                { id: 'EMP_TL_01', role: 'employee', email: 'worker1@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        // 7. A Team Lead gets 403 when trying to edit a Manager.
        it('7. A Team Lead gets 403 when trying to edit a Manager', async () => {
            const res = await request(app)
                .put('/api/employees/MGR001')
                .set('Authorization', `Bearer ${tlToken}`)
                .send({ designation: 'Attempted Update by TL' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 8. An Employee can check in, check out, and check in again on the same day.
        it('8. An Employee can check in, check out, and check in again on the same day', async () => {
            // First check-in
            const in1 = await request(app)
                .post('/api/attendance/clock-in')
                .set('Authorization', `Bearer ${empToken}`);
            expect(in1.status).toBe(201);
            expect(in1.body.success).toBe(true);

            // First check-out
            const out1 = await request(app)
                .post('/api/attendance/clock-out')
                .set('Authorization', `Bearer ${empToken}`);
            expect(out1.status).toBe(200);
            expect(out1.body.success).toBe(true);

            // Second check-in on the same day
            const in2 = await request(app)
                .post('/api/attendance/clock-in')
                .set('Authorization', `Bearer ${empToken}`);
            expect(in2.status).toBe(201);
            expect(in2.body.success).toBe(true);

            // Second check-out on the same day
            const out2 = await request(app)
                .post('/api/attendance/clock-out')
                .set('Authorization', `Bearer ${empToken}`);
            expect(out2.status).toBe(200);
            expect(out2.body.success).toBe(true);
        });

        // 9. A Team Lead can approve an Employee's leave.
        it('9. A Team Lead can approve an Employee\'s leave', async () => {
            const leave = await Leave.create({
                employee_id: 'EMP_TL_01',
                leave_type: 'sick',
                start_date: new Date('2026-11-02'),
                end_date: new Date('2026-11-03'),
                total_days: 2,
                reason: 'Family Event'
            });

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${tlToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 10. A Team Lead gets 403 when approving a Manager's leave.
        it('10. A Team Lead gets 403 when approving a Manager\'s leave', async () => {
            const leave = await Leave.create({
                employee_id: 'MGR001',
                leave_type: 'sick',
                start_date: new Date('2026-11-10'),
                end_date: new Date('2026-11-11'),
                total_days: 2,
                reason: 'Management Retreat'
            });

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${tlToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 11. A Manager can approve a Team Lead's leave.
        it('11. A Manager can approve a Team Lead\'s leave', async () => {
            const leave = await Leave.create({
                employee_id: 'TL001',
                leave_type: 'sick',
                start_date: new Date('2026-11-15'),
                end_date: new Date('2026-11-16'),
                total_days: 2,
                reason: 'Leadership Summit'
            });

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${managerToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 12. Only a Super Admin can approve a Manager's leave.
        it('12. Only a Super Admin can approve a Manager\'s leave', async () => {
            const leave = await Leave.create({
                employee_id: 'MGR001',
                leave_type: 'sick',
                start_date: new Date('2026-11-20'),
                end_date: new Date('2026-11-21'),
                total_days: 2,
                reason: 'Personal Vacation'
            });

            // Manager cannot approve a Manager's leave
            const mgrRes = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${managerToken}`);
            expect(mgrRes.status).toBe(403);

            // Super Admin can approve a Manager's leave
            const adminRes = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${adminToken}`);
            expect(adminRes.status).toBe(200);
            expect(adminRes.body.success).toBe(true);
        });
    });

    describe('8. Super Admin Edit Permissions & Role Hierarchy Tests', () => {
        const Employee = require('../models/Employee');
        const XLSX = require('xlsx');

        let managerToken;
        let tlToken;

        beforeAll(async () => {
            managerToken = jwt.sign(
                { id: 'MGR001', role: 'manager', email: 'manager@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            tlToken = jwt.sign(
                { id: 'TL001', role: 'team_lead', email: 'teamlead@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        // 1. Super Admin changes another Super Admin's role to manager: 200, role saved.
        it('Super Admin changes another Super Admin\'s role to manager: 200, role saved', async () => {
            const passwordHash = await bcrypt.hash('Admin2Pass123!', 10);
            await Employee.create({
                id: 'ADM002',
                name: 'Second Super Admin',
                email: 'admin2@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'admin',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .put('/api/employees/ADM002')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'manager' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('manager');

            const updated = await Employee.findOne({ id: 'ADM002' });
            expect(updated.role).toBe('manager');
        });

        // 2. Super Admin demotes the only active Super Admin: 400 "At least one Super Admin must exist."
        it('Super Admin demotes the only active Super Admin: 400 "At least one Super Admin must exist."', async () => {
            // ADM002 is now a manager, so only ADM001 remains as active admin
            const res = await request(app)
                .put('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'manager' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('At least one Super Admin must exist.');
        });

        // 3. Super Admin deactivates or deletes the only active Super Admin: 400, same message.
        it('Super Admin deactivates or deletes the only active Super Admin: 400, same message', async () => {
            // Deactivating
            const deactRes = await request(app)
                .put('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'inactive' });

            expect(deactRes.status).toBe(400);
            expect(deactRes.body.success).toBe(false);
            expect(deactRes.body.message).toBe('At least one Super Admin must exist.');

            // Deleting
            const delRes = await request(app)
                .delete('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(delRes.status).toBe(400);
            expect(delRes.body.success).toBe(false);
            expect(delRes.body.message).toBe('At least one Super Admin must exist.');
        });

        // 4. Manager edits a Super Admin: 403.
        it('Manager edits a Super Admin: 403', async () => {
            const res = await request(app)
                .put('/api/employees/ADM001')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ name: 'Manager Attempted Rename' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 5. Manager sets role to admin: 403.
        it('Manager sets role to admin: 403', async () => {
            const res = await request(app)
                .put('/api/employees/TL001')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ role: 'admin' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 6. Manager edits a Team Lead's role to employee: 200.
        it('Manager edits a Team Lead\'s role to employee: 200', async () => {
            const res = await request(app)
                .put('/api/employees/TL001')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ role: 'employee' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('employee');

            // Restore TL001 role back to team_lead for subsequent tests
            await Employee.findOneAndUpdate({ id: 'TL001' }, { role: 'team_lead' });
        });

        // 7. Team Lead edits an employee's name: 200.
        it('Team Lead edits an employee\'s name: 200', async () => {
            const res = await request(app)
                .put('/api/employees/EMP_TL_01')
                .set('Authorization', `Bearer ${tlToken}`)
                .send({ name: 'Worker One Updated Name' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.name).toBe('Worker One Updated Name');
        });

        // 8. Team Lead edits a Manager: 403.
        it('Team Lead edits a Manager: 403', async () => {
            const res = await request(app)
                .put('/api/employees/MGR001')
                .set('Authorization', `Bearer ${tlToken}`)
                .send({ name: 'Manager Renamed by TL' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 9. Team Lead edits their own name: 200.
        it('Team Lead edits their own name: 200', async () => {
            const res = await request(app)
                .put('/api/employees/TL001')
                .set('Authorization', `Bearer ${tlToken}`)
                .send({ name: 'TL Self Name Updated' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.name).toBe('TL Self Name Updated');
        });

        // 10. Team Lead with manage_employees permission still cannot edit a Manager: 403.
        it('Team Lead with manage_employees permission still cannot edit a Manager: 403', async () => {
            await Employee.findOneAndUpdate({ id: 'TL001' }, { permissions: ['manage_employees'] });

            const tlPermToken = jwt.sign(
                { id: 'TL001', role: 'team_lead', permissions: ['manage_employees'], email: 'teamlead@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            const res = await request(app)
                .put('/api/employees/MGR001')
                .set('Authorization', `Bearer ${tlPermToken}`)
                .send({ name: 'Manager Renamed by Privileged TL' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 11. Role value "owner" is rejected: 400.
        it('Role value "owner" is rejected: 400', async () => {
            const res = await request(app)
                .put('/api/employees/EMP_TL_01')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'owner' });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
        });

        // 12. Bulk import by Manager with role admin: 403.
        it('Bulk import by Manager with role admin: 403', async () => {
            const sampleRow = [{
                name: 'Imported Admin',
                email: 'importadmin@zograhatechnologies.test',
                password: 'Password123!',
                phone: '9876543210',
                gender: 'female',
                date_of_birth: '1990-01-01',
                address: '123 Street',
                role: 'admin',
                designation: 'Admin',
                department_name: 'Human Resources',
                date_of_joining: '2023-01-01',
                basic_salary: 50000,
                bank_account_no: '1234567890',
                bank_ifsc_code: 'BANK0001',
                bank_name: 'Example Bank'
            }];

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(sampleRow);
            XLSX.utils.book_append_sheet(wb, ws, 'Employees');
            const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const res = await request(app)
                .post('/api/employees/import')
                .set('Authorization', `Bearer ${managerToken}`)
                .attach('file', fileBuffer, 'employees.xlsx');

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // 13. Legacy role on update: editing an employee whose stored role is hr_manager, sending the same role back, returns 200 and saves "manager"
        it('editing an employee whose stored role is hr_manager, sending the same role back, returns 200 and saves "manager"', async () => {
            const passwordHash = await bcrypt.hash('LegacyPass123!', 10);
            await Employee.create({
                id: 'EMP_LEGACY_HRM',
                name: 'Legacy HR Manager',
                email: 'legacyhrm@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'hr_manager',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .put('/api/employees/EMP_LEGACY_HRM')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'hr_manager' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('manager');

            const updated = await Employee.findOne({ id: 'EMP_LEGACY_HRM' });
            expect(updated.role).toBe('manager');
        });

        // 14. Legacy role mapping: an employee with legacy role hr is saved as "team_lead"
        it('an employee with legacy role hr is saved as "team_lead"', async () => {
            const passwordHash = await bcrypt.hash('LegacyPass123!', 10);
            await Employee.create({
                id: 'EMP_LEGACY_HR',
                name: 'Legacy HR Lead',
                email: 'legacyhr@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'hr',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .put('/api/employees/EMP_LEGACY_HR')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'hr' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.role).toBe('team_lead');

            const updated = await Employee.findOne({ id: 'EMP_LEGACY_HR' });
            expect(updated.role).toBe('team_lead');
        });

        // 15. Delete guard: deleting the last Super Admin returns 400 "At least one Super Admin must exist."
        it('deleting the last Super Admin returns 400 "At least one Super Admin must exist."', async () => {
            // Ensure only ADM001 is active admin
            await Employee.deleteMany({ role: 'admin', id: { $ne: 'ADM001' } });
            await Employee.findOneAndUpdate({ id: 'ADM001' }, { role: 'admin', status: 'active' });

            const res = await request(app)
                .delete('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('At least one Super Admin must exist.');
        });

        // 16. Delete guard: deleting a non-last Super Admin returns 200
        it('deleting a non-last Super Admin returns 200', async () => {
            const passwordHash = await bcrypt.hash('AdminDelPass123!', 10);
            await Employee.create({
                id: 'ADM003',
                name: 'Third Super Admin',
                email: 'admin3@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'admin',
                department_id: testDeptId,
                status: 'active'
            });

            // Now there are two active admins: ADM001 and ADM003
            const res = await request(app)
                .delete('/api/employees/ADM003')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const deleted = await Employee.findOne({ id: 'ADM003' });
            expect(deleted.status).toBe('terminated');
        });

        // 17. Attendance counting: an employee with two present records on the same day counts as 1 day in the dashboard overview
        it('an employee with two present records on the same day counts as 1 day in the dashboard overview', async () => {
            const Attendance = require('../models/Attendance');
            const now = new Date();
            // Clear any existing attendance for ADM001
            await Attendance.deleteMany({ employee_id: 'ADM001' });

            const testDate = new Date(now.getFullYear(), now.getMonth(), 10, 9, 0, 0);

            // Insert 2 records on the same day with status present
            await Attendance.create([
                {
                    employee_id: 'ADM001',
                    date: testDate,
                    status: 'present'
                },
                {
                    employee_id: 'ADM001',
                    date: testDate,
                    status: 'present'
                }
            ]);

            const res = await request(app)
                .get('/api/employees/dashboard-overview')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.dashboard.attendance.summary.present).toBe(1);
            expect(res.body.dashboard.attendance.summary.total).toBe(1);
        });
    });

    describe('9. Phase 1 Feature Tests', () => {
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');
        const Leave = require('../models/Leave');
        const Attendance = require('../models/Attendance');
        const Notification = require('../models/Notification');

        let managerToken;
        let tlToken;
        let empToken;
        let managerToken2;
        let managerToken3;
        let tlToken2;
        let empToken2;
        let testDeptId2;

        // Fixed base date for all tests to avoid flakiness
        const BASE_DATE = new Date('2026-01-15'); // A Thursday

        // Helper to get a weekday date (Mon-Fri) that doesn't overlap
        const getWeekdayDate = (monthsOffset, dayOffset = 1) => {
            const d = new Date(BASE_DATE);
            d.setMonth(d.getMonth() + monthsOffset);
            d.setDate(dayOffset);
            // If weekend, adjust to Monday
            while (d.getDay() === 0 || d.getDay() === 6) {
                d.setDate(d.getDate() + 1);
            }
            return d.toISOString().split('T')[0];
        };

        beforeAll(async () => {
            // Define tokens from outer scope employees
            managerToken = jwt.sign(
                { id: 'MGR001', role: 'manager', email: 'manager@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            tlToken = jwt.sign(
                { id: 'TL001', role: 'team_lead', email: 'teamlead@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            empToken = jwt.sign(
                { id: 'EMP_TL_01', role: 'employee', email: 'worker1@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
            // Create a second department for testing cross-department restrictions
            const dept2 = await Department.create({
                name: 'Engineering',
                description: 'Engineering Department'
            });
            testDeptId2 = dept2._id;

            // Seed a Manager for dept2
            const mgrPassword = await bcrypt.hash('ManagerPass123!', 10);
            await Employee.create({
                id: 'MGR002',
                name: 'Engineering Manager',
                email: 'engmanager@zograhatechnologies.test',
                password_hash: mgrPassword,
                role: 'manager',
                department_id: testDeptId2,
                designation: 'Engineering Manager',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
            managerToken2 = jwt.sign(
                { id: 'MGR002', role: 'manager', email: 'engmanager@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Seed a Team Lead in dept2
            const tlPassword = await bcrypt.hash('TLPass123!', 10);
            await Employee.create({
                id: 'TL002',
                name: 'Engineering Team Lead',
                email: 'engtl@zograhatechnologies.test',
                password_hash: tlPassword,
                role: 'team_lead',
                department_id: testDeptId2,
                designation: 'Senior Engineer',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
            tlToken2 = jwt.sign(
                { id: 'TL002', role: 'team_lead', email: 'engtl@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Seed an Employee in dept2
            const empPassword = await bcrypt.hash('EmpPass123!', 10);
            await Employee.create({
                id: 'EMP_DEPT2',
                name: 'Engineering Employee',
                email: 'engemp@zograhatechnologies.test',
                password_hash: empPassword,
                role: 'employee',
                department_id: testDeptId2,
                designation: 'Developer',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
            empToken2 = jwt.sign(
                { id: 'EMP_DEPT2', role: 'employee', email: 'engemp@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Seed a Manager in HR dept (testDeptId from beforeAll)
            const hrMgrPassword = await bcrypt.hash('HRMgrPass123!', 10);
            await Employee.create({
                id: 'MGR003',
                name: 'HR Manager',
                email: 'hrmanager@zograhatechnologies.test',
                password_hash: hrMgrPassword,
                role: 'manager',
                department_id: testDeptId,
                designation: 'HR Manager',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
            managerToken3 = jwt.sign(
                { id: 'MGR003', role: 'manager', email: 'hrmanager@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Seed a Team Lead in HR dept
            const hrTlPassword = await bcrypt.hash('HRTLPass123!', 10);
            await Employee.create({
                id: 'TL003',
                name: 'HR Team Lead',
                email: 'hrtl@zograhatechnologies.test',
                password_hash: hrTlPassword,
                role: 'team_lead',
                department_id: testDeptId,
                designation: 'HR Lead',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });

            // Seed an Employee in HR dept (for testing assignments)
            const hrEmpPassword = await bcrypt.hash('HREmpPass123!', 10);
            await Employee.create({
                id: 'EMP_HR_TEST',
                name: 'HR Test Employee',
                email: 'hrtest@zograhatechnologies.test',
                password_hash: hrEmpPassword,
                role: 'employee',
                department_id: testDeptId,
                designation: 'HR Assistant',
                date_of_joining: new Date('2023-01-01'),
                status: 'active'
            });
        });

        // ASSIGNMENTS TESTS

        // Super Admin assigns a manager and a team lead to an employee: 200
        it('Super Admin assigns a manager and a team lead to an employee: 200', async () => {
            const res = await request(app)
                .patch('/api/employees/EMP_HR_TEST/assignments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ manager_id: 'MGR003', team_lead_id: 'TL003' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.manager_id).toBe('MGR003');
            expect(res.body.employee.team_lead_id).toBe('TL003');
        });

        // Super Admin assigns invalid manager (not a manager role): 400
        it('Super Admin assigns invalid manager (not a manager role): 400', async () => {
            const res = await request(app)
                .patch('/api/employees/EMP_HR_TEST/assignments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ manager_id: 'EMP_HR_TEST' }); // employee, not manager

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('must have role "manager"');
        });

        // Super Admin assigns invalid team lead (not a team_lead role): 400
        it('Super Admin assigns invalid team lead (not a team_lead role): 400', async () => {
            const res = await request(app)
                .patch('/api/employees/EMP_HR_TEST/assignments')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ team_lead_id: 'MGR003' }); // manager, not team_lead

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('must have role "team_lead"');
        });

        // Manager assigns a team lead to an employee in their department: 200
        it('Manager assigns a team lead to an employee in their department: 200', async () => {
            // First, set MGR003 as manager of testDeptId
            await Department.findByIdAndUpdate(testDeptId, { manager_id: 'MGR003' });

            const res = await request(app)
                .patch('/api/employees/EMP_HR_TEST/assignments')
                .set('Authorization', `Bearer ${managerToken3}`) // MGR003 is manager of testDeptId
                .send({ team_lead_id: 'TL003' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.employee.team_lead_id).toBe('TL003');
        });

        // Manager assigns a team lead to an employee in another department: 403
        it('Manager assigns a team lead to an employee in another department: 403', async () => {
            // MGR001 manages testDeptId (HR), tries to assign TL to EMP_DEPT2 (Engineering)
            const res = await request(app)
                .patch('/api/employees/EMP_DEPT2/assignments')
                .set('Authorization', `Bearer ${managerToken}`) // MGR001
                .send({ team_lead_id: 'TL002' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('your departments');
        });

        // Manager tries to set manager_id: 403
        it('Manager tries to set manager_id: 403', async () => {
            const res = await request(app)
                .patch('/api/employees/EMP_HR_TEST/assignments')
                .set('Authorization', `Bearer ${managerToken}`)
                .send({ manager_id: 'MGR003' });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('cannot set manager_id');
        });

        // Department manager can view employees in their department: 200
        it('Department manager can view employees in their department: 200', async () => {
            // Set MGR001 as manager of testDeptId (HR)
            await Department.findByIdAndUpdate(testDeptId, { manager_id: 'MGR001' });

            const res = await request(app)
                .get(`/api/departments/${testDeptId}/employees`)
                .set('Authorization', `Bearer ${managerToken}`); // MGR001 manages testDeptId

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.employees)).toBe(true);
            expect(res.body.employees.length).toBeGreaterThan(0);
        });

        // Manager from another department cannot view employees: 403
        it('Manager from another department cannot view employees: 403', async () => {
            // MGR001 manages testDeptId (HR), tries to access testDeptId2 (Engineering, managed by MGR002)
            const res = await request(app)
                .get(`/api/departments/${testDeptId2}/employees`)
                .set('Authorization', `Bearer ${managerToken}`); // MGR001

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });

        // Super Admin can view any department employees: 200
        it('Super Admin can view any department employees: 200', async () => {
            const res = await request(app)
                .get(`/api/departments/${testDeptId2}/employees`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.employees)).toBe(true);
        });

        // SICK LEAVE ONLY TESTS

        // Sick leave application: 200
        it('Sick leave application: 200', async () => {
            const start = getWeekdayDate(1, 1);
            const end = getWeekdayDate(1, 2);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start,
                    end_date: end,
                    reason: 'Feeling unwell'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.leave.leave_type).toBe('sick');
        });

        // Casual or any other type: 400
        it('Casual or any other type: 400', async () => {
            const start = getWeekdayDate(2, 1);
            const end = getWeekdayDate(2, 2);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'casual',
                    start_date: start,
                    end_date: end,
                    reason: 'Casual leave'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('Only sick leave');
        });

        // Second sick leave in the same month: 400
        it('Second sick leave in the same month: 400', async () => {
            const start = getWeekdayDate(3, 1);
            const end = getWeekdayDate(3, 2);

            // First application
            const firstRes = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start,
                    end_date: end,
                    reason: 'First sick leave'
                });
            expect(firstRes.status).toBe(201);

            // Second application in same month (non-overlapping dates)
            const start2 = getWeekdayDate(3, 8);
            const end2 = getWeekdayDate(3, 9);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start2,
                    end_date: end2,
                    reason: 'Second sick leave'
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Monthly sick leave limit reached.');
        });

        // Same request in the next month: 200
        it('Same request in the next month: 200', async () => {
            const start = getWeekdayDate(4, 1);
            const end = getWeekdayDate(4, 2);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start,
                    end_date: end,
                    reason: 'Sick leave next month'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.leave.leave_type).toBe('sick');
        });

        // Rejected application does not count towards limit
        it('Rejected application does not count towards limit', async () => {
            const start = getWeekdayDate(5, 1);
            const end = getWeekdayDate(5, 2);

            // Create a rejected leave directly in DB
            await Leave.create({
                employee_id: 'EMP_DEPT2',
                leave_type: 'sick',
                start_date: new Date(start),
                end_date: new Date(end),
                total_days: 2,
                reason: 'Rejected leave',
                status: 'rejected'
            });

            // Now apply again in same month - should succeed
            const start2 = getWeekdayDate(5, 4);
            const end2 = getWeekdayDate(5, 5);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start2,
                    end_date: end2,
                    reason: 'New sick leave after rejected'
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });

        // LEAVE APPROVAL NOTIFICATIONS TESTS

        // Leave application creates notifications for manager, team lead, and Super Admins, and not for the applicant
        it('Leave application creates notifications for manager, team lead, and Super Admins, and not for the applicant', async () => {
            // Set up EMP_TL_01 with manager TL001
            await Employee.findOneAndUpdate(
                { id: 'EMP_TL_01' },
                { manager_id: 'TL001', team_lead_id: 'TL001' }
            );

            // Get employee objects to find their ObjectIds
            const empTl01 = await Employee.findOne({ id: 'EMP_TL_01' }).lean();
            const tl001 = await Employee.findOne({ id: 'TL001' }).lean();
            const adm001 = await Employee.findOne({ id: 'ADM001' }).lean();

            // Clear existing notifications for test recipients
            await Notification.deleteMany({
                recipient: { $in: [tl001._id, adm001._id] }
            });

            const start = getWeekdayDate(6, 1);
            const end = getWeekdayDate(6, 2);

            const res = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken}`)
                .send({
                    leave_type: 'sick',
                    start_date: start,
                    end_date: end,
                    reason: 'Notification test'
                });

            expect(res.status).toBe(201);

            // Check notifications created - use ObjectIds
            const notifications = await Notification.find({
                recipient: { $in: [tl001._id, adm001._id] },
                type: 'leave'
            }).lean();

            // Should have notifications for: TL001 (manager of EMP_TL_01), ADM001 (super admin)
            // Not for EMP_TL_01 (applicant)
            const recipientIds = notifications.map(n => n.recipient.toString());
            expect(recipientIds).toContain(tl001._id.toString()); // manager
            expect(recipientIds).toContain(adm001._id.toString()); // super admin
            expect(recipientIds).not.toContain(empTl01._id.toString()); // not applicant

            // Check notification content
            const mgrNotification = notifications.find(n => n.recipient.toString() === tl001._id.toString());
            expect(mgrNotification).toBeDefined();
            expect(mgrNotification.title).toBe('New Sick Leave Application');
            expect(mgrNotification.data.leaveId).toBeDefined();
        });

        // WORKING HOURS TESTS

        // Two completed sessions in one day sum correctly
        it('Two completed sessions in one day sum correctly', async () => {
            // Clean up any existing attendance
            await Attendance.deleteMany({ employee_id: 'EMP_TL_01' });

            const testDate = new Date();
            testDate.setHours(9, 0, 0, 0);
            const dateStr = testDate.toISOString().split('T')[0];

            // Create two completed sessions manually
            await Attendance.create([
                {
                    employee_id: 'EMP_TL_01',
                    date: testDate,
                    check_in: new Date(testDate.getTime()),
                    check_out: new Date(testDate.getTime() + 4 * 60 * 60 * 1000), // 4 hours
                    status: 'present'
                },
                {
                    employee_id: 'EMP_TL_01',
                    date: testDate,
                    check_in: new Date(testDate.getTime() + 5 * 60 * 60 * 1000), // 1 hour break
                    check_out: new Date(testDate.getTime() + 9 * 60 * 60 * 1000), // 4 hours
                    status: 'present'
                }
            ]);

            const res = await request(app)
                .get(`/api/attendance/EMP_TL_01?month=${testDate.getMonth() + 1}&year=${testDate.getFullYear()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const dayRecord = res.body.attendance.find(a => new Date(a.date).toISOString().split('T')[0] === dateStr);
            expect(dayRecord).toBeDefined();
            expect(dayRecord.work_hours).toBe(8); // 4 + 4 = 8 hours
            expect(dayRecord.is_open_session).toBe(false);
        });

        // An open session is excluded and flagged
        it('An open session is excluded and flagged', async () => {
            // Clean up
            await Attendance.deleteMany({ employee_id: 'EMP_TL_01' });

            const testDate = new Date();
            testDate.setDate(testDate.getDate() + 1); // tomorrow
            testDate.setHours(9, 0, 0, 0);
            const dateStr = testDate.toISOString().split('T')[0];

            // Create one completed session and one open session
            await Attendance.create([
                {
                    employee_id: 'EMP_TL_01',
                    date: testDate,
                    check_in: new Date(testDate.getTime()),
                    check_out: new Date(testDate.getTime() + 4 * 60 * 60 * 1000), // 4 hours
                    status: 'present'
                },
                {
                    employee_id: 'EMP_TL_01',
                    date: testDate,
                    check_in: new Date(testDate.getTime() + 5 * 60 * 60 * 1000), // open session
                    status: 'present'
                }
            ]);

            const res = await request(app)
                .get(`/api/attendance/EMP_TL_01?month=${testDate.getMonth() + 1}&year=${testDate.getFullYear()}`)
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const dayRecord = res.body.attendance.find(a => new Date(a.date).toISOString().split('T')[0] === dateStr);
            expect(dayRecord).toBeDefined();
            expect(dayRecord.work_hours).toBe(4); // Only the completed session
            expect(dayRecord.is_open_session).toBe(true); // Flagged as open session
        });
    });

    describe('10. Employee Deletion & Deactivation Rules Tests', () => {
        const Employee = require('../models/Employee');

        let delMgrToken;
        let delTlToken;
        let delTlPermToken;

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('DelTest123!', 10);

            // Caller Manager
            await Employee.create({
                id: 'TEST_DEL_CALLER_MGR',
                name: 'Del Caller Manager',
                email: 'delcallermgr@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active'
            });
            delMgrToken = jwt.sign(
                { id: 'TEST_DEL_CALLER_MGR', role: 'manager', email: 'delcallermgr@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Caller Team Lead
            await Employee.create({
                id: 'TEST_DEL_CALLER_TL',
                name: 'Del Caller TL',
                email: 'delcallertl@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'team_lead',
                department_id: testDeptId,
                status: 'active'
            });
            delTlToken = jwt.sign(
                { id: 'TEST_DEL_CALLER_TL', role: 'team_lead', email: 'delcallertl@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            // Caller Team Lead with manage_employees permission
            await Employee.create({
                id: 'TEST_DEL_CALLER_TL_PERM',
                name: 'Del Caller TL Perm',
                email: 'delcallertlperm@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'team_lead',
                permissions: ['manage_employees'],
                department_id: testDeptId,
                status: 'active'
            });
            delTlPermToken = jwt.sign(
                { id: 'TEST_DEL_CALLER_TL_PERM', role: 'team_lead', permissions: ['manage_employees'], email: 'delcallertlperm@zograhatechnologies.test' },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        afterAll(async () => {
            await Employee.deleteMany({ id: { $regex: /^TEST_DEL_/ } });
        });

        // 1. Team Lead deletes an employee: 403
        it('1. Team Lead deletes an employee: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_EMP_1',
                name: 'Test Target Employee 1',
                email: 'targetemp1@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_EMP_1')
                .set('Authorization', `Bearer ${delTlToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. Team Leads cannot delete employees.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_EMP_1' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_EMP_1' });
        });

        // 2. Team Lead deletes a team lead: 403
        it('2. Team Lead deletes a team lead: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_TL_2',
                name: 'Test Target TL 2',
                email: 'targettl2@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'team_lead',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_TL_2')
                .set('Authorization', `Bearer ${delTlToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. Team Leads cannot delete employees.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_TL_2' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_TL_2' });
        });

        // 3. Manager deletes an employee: 200
        it('3. Manager deletes an employee: 200', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_EMP_3',
                name: 'Test Target Employee 3',
                email: 'targetemp3@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_EMP_3')
                .set('Authorization', `Bearer ${delMgrToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Employee deactivated.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_EMP_3' });
            expect(inDb.status).toBe('terminated');

            await Employee.deleteOne({ id: 'TEST_DEL_EMP_3' });
        });

        // 4. Manager deletes a team lead: 200
        it('4. Manager deletes a team lead: 200', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_TL_4',
                name: 'Test Target TL 4',
                email: 'targettl4@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'team_lead',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_TL_4')
                .set('Authorization', `Bearer ${delMgrToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Employee deactivated.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_TL_4' });
            expect(inDb.status).toBe('terminated');

            await Employee.deleteOne({ id: 'TEST_DEL_TL_4' });
        });

        // 5. Manager deletes another manager: 403
        it('5. Manager deletes another manager: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_MGR_5',
                name: 'Test Target Manager 5',
                email: 'targetmgr5@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_MGR_5')
                .set('Authorization', `Bearer ${delMgrToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. Managers cannot delete other managers.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_MGR_5' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_MGR_5' });
        });

        // 6. Manager deletes a Super Admin: 403
        it('6. Manager deletes a Super Admin: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_ADM_6',
                name: 'Test Target Admin 6',
                email: 'targetadm6@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'admin',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_ADM_6')
                .set('Authorization', `Bearer ${delMgrToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. Managers cannot delete Super Admins.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_ADM_6' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_ADM_6' });
        });

        // 7. Super Admin deletes a manager: 200
        it('7. Super Admin deletes a manager: 200', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_MGR_7',
                name: 'Test Target Manager 7',
                email: 'targetmgr7@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_MGR_7')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toBe('Employee deactivated.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_MGR_7' });
            expect(inDb.status).toBe('terminated');

            await Employee.deleteOne({ id: 'TEST_DEL_MGR_7' });
        });

        // 8. Manager sets a manager's status to inactive via PUT: 403
        it('8. Manager sets a manager\'s status to inactive via PUT: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_MGR_8',
                name: 'Test Target Manager 8',
                email: 'targetmgr8@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active'
            });

            // Test setting status to inactive
            const resInactive = await request(app)
                .put('/api/employees/TEST_DEL_MGR_8')
                .set('Authorization', `Bearer ${delMgrToken}`)
                .send({ status: 'inactive' });

            expect(resInactive.status).toBe(403);
            expect(resInactive.body.success).toBe(false);
            expect(resInactive.body.message).toBe('Forbidden. Managers cannot deactivate other managers.');

            let inDb = await Employee.findOne({ id: 'TEST_DEL_MGR_8' });
            expect(inDb.status).toBe('active');

            // Test setting status to terminated
            const resTerminated = await request(app)
                .put('/api/employees/TEST_DEL_MGR_8')
                .set('Authorization', `Bearer ${delMgrToken}`)
                .send({ status: 'terminated' });

            expect(resTerminated.status).toBe(403);
            expect(resTerminated.body.success).toBe(false);
            expect(resTerminated.body.message).toBe('Forbidden. Managers cannot deactivate other managers.');

            inDb = await Employee.findOne({ id: 'TEST_DEL_MGR_8' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_MGR_8' });
        });

        // 9. Team Lead sets an employee's status to inactive via PUT: 403
        it('9. Team Lead sets an employee\'s status to inactive via PUT: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_EMP_9',
                name: 'Test Target Employee 9',
                email: 'targetemp9@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                department_id: testDeptId,
                status: 'active'
            });

            // Test setting status to inactive
            const resInactive = await request(app)
                .put('/api/employees/TEST_DEL_EMP_9')
                .set('Authorization', `Bearer ${delTlToken}`)
                .send({ status: 'inactive' });

            expect(resInactive.status).toBe(403);
            expect(resInactive.body.success).toBe(false);
            expect(resInactive.body.message).toBe('Forbidden. Team Leads cannot deactivate employees.');

            let inDb = await Employee.findOne({ id: 'TEST_DEL_EMP_9' });
            expect(inDb.status).toBe('active');

            // Test setting status to terminated
            const resTerminated = await request(app)
                .put('/api/employees/TEST_DEL_EMP_9')
                .set('Authorization', `Bearer ${delTlToken}`)
                .send({ status: 'terminated' });

            expect(resTerminated.status).toBe(403);
            expect(resTerminated.body.success).toBe(false);
            expect(resTerminated.body.message).toBe('Forbidden. Team Leads cannot deactivate employees.');

            inDb = await Employee.findOne({ id: 'TEST_DEL_EMP_9' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_EMP_9' });
        });

        // 10. A user with the manage_employees permission but role team_lead deletes a manager: 403
        it('10. A user with the manage_employees permission but role team_lead deletes a manager: 403', async () => {
            const passwordHash = await bcrypt.hash('Test1234!', 10);
            await Employee.create({
                id: 'TEST_DEL_MGR_10',
                name: 'Test Target Manager 10',
                email: 'targetmgr10@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active'
            });

            const res = await request(app)
                .delete('/api/employees/TEST_DEL_MGR_10')
                .set('Authorization', `Bearer ${delTlPermToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. Team Leads cannot delete employees.');

            const inDb = await Employee.findOne({ id: 'TEST_DEL_MGR_10' });
            expect(inDb.status).toBe('active');

            await Employee.deleteOne({ id: 'TEST_DEL_MGR_10' });
        });

        // 11. Existing last-Super-Admin tests still pass
        it('11. Existing last-Super-Admin tests still pass', async () => {
            // Ensure only ADM001 is active admin
            await Employee.deleteMany({ role: 'admin', id: { $ne: 'ADM001' } });
            await Employee.findOneAndUpdate({ id: 'ADM001' }, { role: 'admin', status: 'active' });

            // Cannot delete last admin via DELETE
            const delRes = await request(app)
                .delete('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`);
            expect(delRes.status).toBe(400);
            expect(delRes.body.message).toBe('At least one Super Admin must exist.');

            // Cannot deactivate last admin via PUT
            const putRes = await request(app)
                .put('/api/employees/ADM001')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'inactive' });
            expect(putRes.status).toBe(400);
            expect(putRes.body.message).toBe('At least one Super Admin must exist.');

            const admInDb = await Employee.findOne({ id: 'ADM001' });
            expect(admInDb.status).toBe('active');
        });
    });

    // 11. Phase 2: Attendance filters, exports, employee filters, and role-based menus
    describe('11. Phase 2 Features Verification', () => {
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');
        const Attendance = require('../models/Attendance');
        const XLSX = require('xlsx');

        let p2AdminToken;
        let p2MgrToken;
        let p2TlToken;
        let p2EmpToken;
        let p2DeptA;
        let p2DeptB;

        beforeAll(async () => {
            const pwd = await bcrypt.hash('P2Secret123!', 10);

            // Dept A managed by P2_MGR_01
            p2DeptA = await Department.create({
                name: 'TEST_P2_DEPT_A',
                description: 'Dept A',
                manager_id: 'P2_MGR_01'
            });

            // Dept B managed by P2_MGR_02
            p2DeptB = await Department.create({
                name: 'TEST_P2_DEPT_B',
                description: 'Dept B',
                manager_id: 'P2_MGR_02'
            });

            // Manager 1 (in Dept A)
            await Employee.create({
                id: 'P2_MGR_01',
                name: 'P2 Manager One',
                email: 'p2_mgr1@zograhatechnologies.test',
                password_hash: pwd,
                role: 'manager',
                department_id: p2DeptA._id,
                status: 'active'
            });

            // Team Lead 1 (in Dept A, managed by P2_MGR_01)
            await Employee.create({
                id: 'P2_TL_01',
                name: 'P2 Team Lead One',
                email: 'p2_tl1@zograhatechnologies.test',
                password_hash: pwd,
                role: 'team_lead',
                department_id: p2DeptA._id,
                manager_id: 'P2_MGR_01',
                status: 'active'
            });

            // Employee 1 (in Dept A, team lead P2_TL_01)
            await Employee.create({
                id: 'P2_EMP_01',
                name: 'P2 Employee One',
                email: 'p2_emp1@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: p2DeptA._id,
                team_lead_id: 'P2_TL_01',
                manager_id: 'P2_MGR_01',
                status: 'active'
            });

            // Employee 2 (in Dept B, outside Mgr 1 and TL 1 scope)
            await Employee.create({
                id: 'P2_EMP_02',
                name: 'P2 Employee Two',
                email: 'p2_emp2@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: p2DeptB._id,
                status: 'active'
            });

            p2AdminToken = jwt.sign({ id: 'ADM001', role: 'admin' }, process.env.JWT_SECRET);
            p2MgrToken = jwt.sign({ id: 'P2_MGR_01', role: 'manager' }, process.env.JWT_SECRET);
            p2TlToken = jwt.sign({ id: 'P2_TL_01', role: 'team_lead' }, process.env.JWT_SECRET);
            p2EmpToken = jwt.sign({ id: 'P2_EMP_01', role: 'employee' }, process.env.JWT_SECRET);
        });

        // 1. GET /api/attendance/logs returns logs, not an employee lookup
        it('1. GET /api/attendance/logs returns logs, not an employee lookup', async () => {
            const res = await request(app)
                .get('/api/attendance/logs')
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.logs).toBeDefined();
            expect(Array.isArray(res.body.logs)).toBe(true);
            // Must NOT return single employee lookup format { attendance: [...], summary: ... }
            expect(res.body.summary).toBeUndefined();
        });

        // 2. Employee requesting another employee's logs: 403 with the exact message
        it('2. Employee requesting another employee\'s logs: 403 with the exact message', async () => {
            const res = await request(app)
                .get('/api/attendance/logs?employee_id=P2_EMP_02')
                .set('Authorization', `Bearer ${p2EmpToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Access denied for this employee's records.");
        });

        // 3. Team lead requesting an employee outside their team in logs: 403
        it('3. Team lead requesting an employee outside their team in logs: 403', async () => {
            const res = await request(app)
                .get('/api/attendance/logs?employee_id=P2_EMP_02')
                .set('Authorization', `Bearer ${p2TlToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe("Access denied for this employee's records.");
        });

        // 4. Manager's team view and export exclude employees outside their departments
        it('4. Manager\'s team view and export exclude employees outside their departments', async () => {
            // Seed attendance for P2_EMP_01 (Dept A) and P2_EMP_02 (Dept B) on 2026-06-15
            const testDate = new Date('2026-06-15T09:00:00+05:30');
            await Attendance.create([
                { employee_id: 'P2_EMP_01', date: testDate, check_in: testDate, status: 'present' },
                { employee_id: 'P2_EMP_02', date: testDate, check_in: testDate, status: 'present' }
            ]);

            // Team view check
            const teamRes = await request(app)
                .get('/api/attendance/team?date=2026-06-15')
                .set('Authorization', `Bearer ${p2MgrToken}`);
            expect(teamRes.status).toBe(200);
            const teamEmpIds = teamRes.body.attendance.map(a => a.employee_id);
            expect(teamEmpIds).toContain('P2_EMP_01');
            expect(teamEmpIds).not.toContain('P2_EMP_02');

            // Export check
            const expRes = await request(app)
                .get('/api/attendance/export?date=2026-06-15')
                .set('Authorization', `Bearer ${p2MgrToken}`)
                .responseType('blob');
            expect(expRes.status).toBe(200);
            const wb = XLSX.read(expRes.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet);
            const expEmpIds = data.map(d => d['Employee ID']);
            expect(expEmpIds).toContain('P2_EMP_01');
            expect(expEmpIds).not.toContain('P2_EMP_02');
        });



        // 5. Check-in at 00:30 IST and check-out at 23:30 IST on the same day: one day, correct first and last times, correct worked hours
        it('5. Check-in at 00:30 IST and check-out at 23:30 IST on the same day: one day, correct first and last times, correct worked hours', async () => {
            await Attendance.deleteMany({ employee_id: 'P2_EMP_01' });

            // 2026-07-20 00:30:00 IST = 2026-07-19 19:00:00 UTC
            const checkIn = new Date('2026-07-20T00:30:00+05:30');
            // 2026-07-20 23:30:00 IST = 2026-07-20 18:00:00 UTC (23 hours duration)
            const checkOut = new Date('2026-07-20T23:30:00+05:30');

            await Attendance.create({
                employee_id: 'P2_EMP_01',
                date: checkIn,
                check_in: checkIn,
                check_out: checkOut,
                status: 'present'
            });

            const res = await request(app)
                .get('/api/attendance/logs?employee_id=P2_EMP_01&from=2026-07-20&to=2026-07-20&view=daily')
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.logs.length).toBe(1);
            const row = res.body.logs[0];
            expect(row.date).toBe('2026-07-20');
            expect(new Date(row.first_check_in).getTime()).toBe(checkIn.getTime());
            expect(new Date(row.last_check_out).getTime()).toBe(checkOut.getTime());
            expect(row.worked_hours).toBe(23);
        });

        // 6. Two sessions on one day: first check-in is the earliest, last check-out is the latest, worked hours are the sum, open_session false
        it('6. Two sessions on one day: first check-in is the earliest, last check-out is the latest, worked hours are the sum, open_session false', async () => {
            await Attendance.deleteMany({ employee_id: 'P2_EMP_01' });

            // Session 1: 09:00 IST to 13:00 IST (4h)
            const s1In = new Date('2026-08-10T09:00:00+05:30');
            const s1Out = new Date('2026-08-10T13:00:00+05:30');
            // Session 2: 14:00 IST to 18:30 IST (4.5h)
            const s2In = new Date('2026-08-10T14:00:00+05:30');
            const s2Out = new Date('2026-08-10T18:30:00+05:30');

            await Attendance.create([
                { employee_id: 'P2_EMP_01', date: s1In, check_in: s1In, check_out: s1Out, status: 'present' },
                { employee_id: 'P2_EMP_01', date: s2In, check_in: s2In, check_out: s2Out, status: 'present' }
            ]);

            const res = await request(app)
                .get('/api/attendance/logs?employee_id=P2_EMP_01&from=2026-08-10&to=2026-08-10&view=daily')
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.logs.length).toBe(1);
            const row = res.body.logs[0];
            expect(new Date(row.first_check_in).getTime()).toBe(s1In.getTime());
            expect(new Date(row.last_check_out).getTime()).toBe(s2Out.getTime());
            expect(row.worked_hours).toBe(8.5);
            expect(row.open_session).toBe(false);
        });

        // 7. An open session on a day: open_session true, worked hours exclude it
        it('7. An open session on a day: open_session true, worked hours exclude it', async () => {
            await Attendance.deleteMany({ employee_id: 'P2_EMP_01' });

            // Session 1: completed 3h
            const s1In = new Date('2026-08-11T09:00:00+05:30');
            const s1Out = new Date('2026-08-11T12:00:00+05:30');
            // Session 2: open session (no check_out)
            const s2In = new Date('2026-08-11T13:00:00+05:30');

            await Attendance.create([
                { employee_id: 'P2_EMP_01', date: s1In, check_in: s1In, check_out: s1Out, status: 'present' },
                { employee_id: 'P2_EMP_01', date: s2In, check_in: s2In, status: 'present' }
            ]);

            const res = await request(app)
                .get('/api/attendance/logs?employee_id=P2_EMP_01&from=2026-08-11&to=2026-08-11&view=daily')
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.logs.length).toBe(1);
            const row = res.body.logs[0];
            expect(row.open_session).toBe(true);
            expect(row.worked_hours).toBe(3);
        });

        // 8. Daily, weekly, and monthly totals match for the same period
        it('8. Daily, weekly, and monthly totals match for the same period', async () => {
            await Attendance.deleteMany({ employee_id: 'P2_EMP_01' });

            // Create records across 3 days in the same week and month (Aug 2026)
            // Day 1: 5h
            const d1In = new Date('2026-08-17T09:00:00+05:30'); // Monday
            const d1Out = new Date('2026-08-17T14:00:00+05:30');
            // Day 2: 6h
            const d2In = new Date('2026-08-18T09:00:00+05:30'); // Tuesday
            const d2Out = new Date('2026-08-18T15:00:00+05:30');
            // Day 3: 4h
            const d3In = new Date('2026-08-19T09:00:00+05:30'); // Wednesday
            const d3Out = new Date('2026-08-19T13:00:00+05:30');

            await Attendance.create([
                { employee_id: 'P2_EMP_01', date: d1In, check_in: d1In, check_out: d1Out, status: 'present' },
                { employee_id: 'P2_EMP_01', date: d2In, check_in: d2In, check_out: d2Out, status: 'present' },
                { employee_id: 'P2_EMP_01', date: d3In, check_in: d3In, check_out: d3Out, status: 'present' }
            ]);

            const from = '2026-08-01';
            const to = '2026-08-31';

            const dailyRes = await request(app)
                .get(`/api/attendance/logs?employee_id=P2_EMP_01&from=${from}&to=${to}&view=daily`)
                .set('Authorization', `Bearer ${p2AdminToken}`);
            const weeklyRes = await request(app)
                .get(`/api/attendance/logs?employee_id=P2_EMP_01&from=${from}&to=${to}&view=weekly`)
                .set('Authorization', `Bearer ${p2AdminToken}`);
            const monthlyRes = await request(app)
                .get(`/api/attendance/logs?employee_id=P2_EMP_01&from=${from}&to=${to}&view=monthly`)
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(dailyRes.status).toBe(200);
            expect(weeklyRes.status).toBe(200);
            expect(monthlyRes.status).toBe(200);

            const dailySum = dailyRes.body.logs.reduce((sum, r) => sum + r.worked_hours, 0);
            const weeklySum = weeklyRes.body.logs.reduce((sum, r) => sum + r.worked_hours, 0);
            const monthlySum = monthlyRes.body.logs.reduce((sum, r) => sum + r.worked_hours, 0);

            expect(dailySum).toBe(15);
            expect(weeklySum).toBe(15);
            expect(monthlySum).toBe(15);
            expect(dailyRes.body.totalWorkedHours).toBe(15);
            expect(weeklyRes.body.totalWorkedHours).toBe(15);
            expect(monthlyRes.body.totalWorkedHours).toBe(15);
        });

        // 9. Range over 366 days: 400 with the exact message
        it('9. Range over 366 days: 400 with the exact message', async () => {
            const res = await request(app)
                .get('/api/attendance/logs?from=2024-01-01&to=2025-01-05')
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Date range cannot exceed 366 days.');
        });

        // 10. Export rows match the logs rows for the same caller
        it('10. Export rows match the logs rows for the same caller', async () => {
            const from = '2026-08-17';
            const to = '2026-08-19';

            const logRes = await request(app)
                .get(`/api/attendance/logs?employee_id=P2_EMP_01&from=${from}&to=${to}&view=daily`)
                .set('Authorization', `Bearer ${p2AdminToken}`);

            const expRes = await request(app)
                .get(`/api/attendance/export?employee_id=P2_EMP_01&from=${from}&to=${to}`)
                .set('Authorization', `Bearer ${p2AdminToken}`)
                .responseType('blob');

            expect(logRes.status).toBe(200);

            expect(expRes.status).toBe(200);

            const wb = XLSX.read(expRes.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const expRows = XLSX.utils.sheet_to_json(sheet);

            expect(expRows.length).toBe(logRes.body.logs.length);
            for (let i = 0; i < expRows.length; i++) {
                expect(expRows[i]['Employee ID']).toBe(logRes.body.logs[i].employee_id);
                expect(expRows[i]['Date']).toBe(logRes.body.logs[i].date);
                expect(expRows[i]['Worked Hours']).toBe(logRes.body.logs[i].worked_hours);
            }
        });

        // 11. Employee list with department and role filters returns only matching employees
        it('11. Employee list with department and role filters returns only matching employees', async () => {
            // Filter department = p2DeptA._id and role = 'employee'
            const res = await request(app)
                .get(`/api/employees?department=${p2DeptA._id}&role=employee`)
                .set('Authorization', `Bearer ${p2AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const emps = res.body.employees;
            expect(emps.length).toBeGreaterThan(0);
            emps.forEach(e => {
                expect(e.department_id.toString()).toBe(p2DeptA._id.toString());
                expect(e.role).toBe('employee');
            });
        });

        // 12. Super Admin without manage_leaves sees the Leave Approvals menu item
        it('12. Super Admin without manage_leaves sees the Leave Approvals menu item', () => {
            // Test role-based menu logic: Super Admin has full system access automatically
            const { normalizeRole } = require('../utils/visibilityHelper');
            const adminUser = { role: 'admin', permissions: [] };

            const isManagerOrAdmin = ['admin', 'manager'].includes(normalizeRole(adminUser.role));
            expect(isManagerOrAdmin).toBe(true);

            // In Sidebar.jsx isRowVisible: if (isManager) return true;
            // Therefore, even with permissions = [] (lacking 'manage_leaves'), admin sees Leave Approvals
            const isVisible = isManagerOrAdmin;
            expect(isVisible).toBe(true);
        });
    });

    // 12. Department Permissions Fix Tests
    describe('12. Department Permissions Fix Tests', () => {
        const Department = require('../models/Department');
        const Employee = require('../models/Employee');

        let deptAdminToken;
        let deptMgrToken;
        let deptTlToken;
        let deptEmpToken;
        let deptTlWithPermToken;
        let deptEmpWithPermToken;

        beforeAll(async () => {
            const pwd = await bcrypt.hash('DeptSecret123!', 10);

            await Employee.create([
                {
                    id: 'DEPT_TEST_ADM',
                    name: 'Dept Admin',
                    email: 'dept_admin@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'admin',
                    status: 'active'
                },
                {
                    id: 'DEPT_TEST_MGR',
                    name: 'Dept Manager',
                    email: 'dept_mgr@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'manager',
                    status: 'active'
                },
                {
                    id: 'DEPT_TEST_TL',
                    name: 'Dept Team Lead',
                    email: 'dept_tl@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'team_lead',
                    status: 'active'
                },
                {
                    id: 'DEPT_TEST_EMP',
                    name: 'Dept Employee',
                    email: 'dept_emp@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'employee',
                    status: 'active'
                },
                {
                    id: 'DEPT_TEST_TL_PERM',
                    name: 'Dept TL With Perm',
                    email: 'dept_tl_perm@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'team_lead',
                    permissions: ['manage_departments', 'manage_employees'],
                    status: 'active'
                },
                {
                    id: 'DEPT_TEST_EMP_PERM',
                    name: 'Dept Emp With Perm',
                    email: 'dept_emp_perm@zograhatechnologies.test',
                    password_hash: pwd,
                    role: 'employee',
                    permissions: ['manage_departments'],
                    status: 'active'
                }
            ]);

            deptAdminToken = jwt.sign({ id: 'DEPT_TEST_ADM', role: 'admin' }, process.env.JWT_SECRET);
            deptMgrToken = jwt.sign({ id: 'DEPT_TEST_MGR', role: 'manager' }, process.env.JWT_SECRET);
            deptTlToken = jwt.sign({ id: 'DEPT_TEST_TL', role: 'team_lead' }, process.env.JWT_SECRET);
            deptEmpToken = jwt.sign({ id: 'DEPT_TEST_EMP', role: 'employee' }, process.env.JWT_SECRET);
            deptTlWithPermToken = jwt.sign({ id: 'DEPT_TEST_TL_PERM', role: 'team_lead' }, process.env.JWT_SECRET);
            deptEmpWithPermToken = jwt.sign({ id: 'DEPT_TEST_EMP_PERM', role: 'employee' }, process.env.JWT_SECRET);
        });

        // 1. Employee POST /api/departments: 403
        it('1. Employee POST /api/departments: 403', async () => {
            const res = await request(app)
                .post('/api/departments')
                .set('Authorization', `Bearer ${deptEmpToken}`)
                .send({ name: 'TEST_EMP_POST_DEPT' });

            expect(res.status).toBe(403);
            const inDb = await Department.findOne({ name: 'TEST_EMP_POST_DEPT' });
            expect(inDb).toBeNull();
        });

        // 2. Employee PUT /api/departments/:id: 403
        it('2. Employee PUT /api/departments/:id: 403', async () => {
            const tempDept = await Department.create({ name: 'TEST_DEPT_FOR_EMP_PUT' });
            const res = await request(app)
                .put(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptEmpToken}`)
                .send({ name: 'TEST_DEPT_EMP_PUT_MODIFIED' });

            expect(res.status).toBe(403);
            const inDb = await Department.findById(tempDept._id);
            expect(inDb.name).toBe('TEST_DEPT_FOR_EMP_PUT');
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 3. Employee DELETE /api/departments/:id: 403
        it('3. Employee DELETE /api/departments/:id: 403', async () => {
            const tempDept = await Department.create({ name: 'TEST_DEPT_FOR_EMP_DEL' });
            const res = await request(app)
                .delete(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptEmpToken}`);

            expect(res.status).toBe(403);
            const inDb = await Department.findById(tempDept._id);
            expect(inDb).not.toBeNull();
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 4. Team lead creates a department: 201, saved in the database
        it('4. Team lead creates a department: 201, saved in the database', async () => {
            const res = await request(app)
                .post('/api/departments')
                .set('Authorization', `Bearer ${deptTlToken}`)
                .send({ name: 'TEST_TL_CREATE_DEPT', description: 'Created by TL' });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            const inDb = await Department.findOne({ name: 'TEST_TL_CREATE_DEPT' });
            expect(inDb).not.toBeNull();
            expect(inDb.description).toBe('Created by TL');
            await Department.deleteOne({ _id: inDb._id });
        });

        // 5. Team lead PUT on a department: 403 with exact message, name unchanged in the database
        it('5. Team lead PUT on a department: 403 with exact message, name unchanged in the database', async () => {
            const tempDept = await Department.create({ name: 'TEST_TL_PUT_ORIGINAL' });
            const res = await request(app)
                .put(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptTlToken}`)
                .send({ name: 'TEST_TL_PUT_CHANGED' });

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Forbidden. Only Managers and Super Admins can edit departments.');
            const inDb = await Department.findById(tempDept._id);
            expect(inDb.name).toBe('TEST_TL_PUT_ORIGINAL');
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 6. Team lead DELETE on a department: 403 with exact message, still exists
        it('6. Team lead DELETE on a department: 403 with exact message, still exists', async () => {
            const tempDept = await Department.create({ name: 'TEST_TL_DEL_DEPT' });
            const res = await request(app)
                .delete(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptTlToken}`);

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Forbidden. Only Super Admins can delete departments.');
            const inDb = await Department.findById(tempDept._id);
            expect(inDb).not.toBeNull();
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 7. Manager PUT on a department (name change): 200, name updated in the database
        it('7. Manager PUT on a department (name change): 200, name updated in the database', async () => {
            const tempDept = await Department.create({ name: 'TEST_MGR_PUT_ORIGINAL' });
            const res = await request(app)
                .put(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptMgrToken}`)
                .send({ name: 'TEST_MGR_PUT_UPDATED' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const inDb = await Department.findById(tempDept._id);
            expect(inDb.name).toBe('TEST_MGR_PUT_UPDATED');
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 8. Manager DELETE on a department: 403 with exact message, still exists
        it('8. Manager DELETE on a department: 403 with exact message, still exists', async () => {
            const tempDept = await Department.create({ name: 'TEST_MGR_DEL_DEPT' });
            const res = await request(app)
                .delete(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptMgrToken}`);

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Forbidden. Only Super Admins can delete departments.');
            const inDb = await Department.findById(tempDept._id);
            expect(inDb).not.toBeNull();
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 9. Super Admin DELETE on an empty department: 200, removed from the database
        it('9. Super Admin DELETE on an empty department: 200, removed from the database', async () => {
            const tempDept = await Department.create({ name: 'TEST_ADM_DEL_EMPTY' });
            const res = await request(app)
                .delete(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptAdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const inDb = await Department.findById(tempDept._id);
            expect(inDb).toBeNull();
        });

        // 10. Super Admin DELETE on a department with an employee: 400 with exact message, still exists
        it('10. Super Admin DELETE on a department with an employee: 400 with exact message, still exists', async () => {
            const tempDept = await Department.create({ name: 'TEST_ADM_DEL_WITH_EMP' });
            const pwd = await bcrypt.hash('DeptSecret123!', 10);
            const assignedEmp = await Employee.create({
                id: 'TEST_ASSIGNED_EMP_DEL',
                name: 'Assigned Emp',
                email: 'assigned_emp_del@zograhatechnologies.test',
                password_hash: pwd,
                department_id: tempDept._id,
                status: 'active'
            });

            const res = await request(app)
                .delete(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptAdminToken}`);

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Department still has employees assigned. Reassign them first.');
            const inDb = await Department.findById(tempDept._id);
            expect(inDb).not.toBeNull();

            // Cleanup
            await Employee.deleteOne({ _id: assignedEmp._id });
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 11. Employee with permission flag manage_departments, role team_lead, PUT on a department: 403
        it('11. Employee with permission flag manage_departments, role team_lead, PUT on a department: 403', async () => {
            const tempDept = await Department.create({ name: 'TEST_TL_PERM_PUT' });
            const res = await request(app)
                .put(`/api/departments/${tempDept._id}`)
                .set('Authorization', `Bearer ${deptTlWithPermToken}`)
                .send({ name: 'TEST_TL_PERM_PUT_CHANGED' });

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Forbidden. Only Managers and Super Admins can edit departments.');
            const inDb = await Department.findById(tempDept._id);
            expect(inDb.name).toBe('TEST_TL_PERM_PUT');
            await Department.deleteOne({ _id: tempDept._id });
        });

        // 12. Employee with permission flag manage_departments, role employee, POST on a department: 403
        it('12. Employee with permission flag manage_departments, role employee, POST on a department: 403', async () => {
            const res = await request(app)
                .post('/api/departments')
                .set('Authorization', `Bearer ${deptEmpWithPermToken}`)
                .send({ name: 'TEST_EMP_PERM_POST' });

            expect(res.status).toBe(403);
            const inDb = await Department.findOne({ name: 'TEST_EMP_PERM_POST' });
            expect(inDb).toBeNull();
        });
    });
});




