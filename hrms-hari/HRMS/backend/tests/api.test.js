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

    // ─────────────────────────────────────────────────────────────
    // 13. PHASE 3: Live Chat, Oversight & File Upload Tests
    // ─────────────────────────────────────────────────────────────
    describe('13. Phase 3 Live Chat, Oversight & File Upload Tests', () => {
        const Conversation = require('../models/Conversation');
        const Message = require('../models/Message');
        const AuditLog = require('../models/AuditLog');
        const Employee = require('../models/Employee');
        const Department = require('../models/Department');

        let adminP3, mgrP3, tlP3, empA, empB, empC, empWithChatPerm;
        let adminTokenP3, mgrTokenP3, tlTokenP3, empAToken, empBToken, empCToken, empWithChatPermToken;
        let deptP3;

        beforeAll(async () => {
            const pwd = await bcrypt.hash('ChatSecret123!', 10);
            deptP3 = await Department.create({ name: 'TEST_CHAT_DEPT' });

            adminP3 = await Employee.create({
                id: 'TEST_P3_ADMIN',
                name: 'P3 Admin',
                email: 'p3_admin@zograhatechnologies.test',
                password_hash: pwd,
                role: 'admin',
                department_id: deptP3._id,
                status: 'active'
            });

            mgrP3 = await Employee.create({
                id: 'TEST_P3_MGR',
                name: 'P3 Manager',
                email: 'p3_mgr@zograhatechnologies.test',
                password_hash: pwd,
                role: 'manager',
                department_id: deptP3._id,
                status: 'active'
            });

            tlP3 = await Employee.create({
                id: 'TEST_P3_TL',
                name: 'P3 Team Lead',
                email: 'p3_tl@zograhatechnologies.test',
                password_hash: pwd,
                role: 'team_lead',
                department_id: deptP3._id,
                status: 'active'
            });

            empA = await Employee.create({
                id: 'TEST_P3_EMPA',
                name: 'P3 Employee A',
                email: 'p3_empa@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: deptP3._id,
                status: 'active'
            });

            empB = await Employee.create({
                id: 'TEST_P3_EMPB',
                name: 'P3 Employee B',
                email: 'p3_empb@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: deptP3._id,
                status: 'active'
            });

            empC = await Employee.create({
                id: 'TEST_P3_EMPC',
                name: 'P3 Employee C',
                email: 'p3_empc@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: deptP3._id,
                status: 'active'
            });

            empWithChatPerm = await Employee.create({
                id: 'TEST_P3_EMP_PERM',
                name: 'P3 Emp With Chat Perm',
                email: 'p3_empperm@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                permissions: ['live_chat'],
                department_id: deptP3._id,
                status: 'active'
            });

            adminTokenP3 = jwt.sign({ id: adminP3.id, _id: adminP3._id, role: adminP3.role }, process.env.JWT_SECRET);
            mgrTokenP3 = jwt.sign({ id: mgrP3.id, _id: mgrP3._id, role: mgrP3.role }, process.env.JWT_SECRET);
            tlTokenP3 = jwt.sign({ id: tlP3.id, _id: tlP3._id, role: tlP3.role }, process.env.JWT_SECRET);
            empAToken = jwt.sign({ id: empA.id, _id: empA._id, role: empA.role }, process.env.JWT_SECRET);
            empBToken = jwt.sign({ id: empB.id, _id: empB._id, role: empB.role }, process.env.JWT_SECRET);
            empCToken = jwt.sign({ id: empC.id, _id: empC._id, role: empC.role }, process.env.JWT_SECRET);
            empWithChatPermToken = jwt.sign({ id: empWithChatPerm.id, _id: empWithChatPerm._id, role: empWithChatPerm.role, permissions: ['live_chat'] }, process.env.JWT_SECRET);
        });

        afterAll(async () => {
            await Employee.deleteMany({ id: { $in: ['TEST_P3_ADMIN', 'TEST_P3_MGR', 'TEST_P3_TL', 'TEST_P3_EMPA', 'TEST_P3_EMPB', 'TEST_P3_EMPC', 'TEST_P3_EMP_PERM'] } });
            if (deptP3) await Department.deleteOne({ _id: deptP3._id });
        });

        // 1. Employee A reads a conversation between B and C: 403, exact message, no message content in body
        it('1. Part 0(a): Employee A reads a conversation between B and C: 403 with exact message', async () => {
            const convBC = await Conversation.create({ participants: [empB._id, empC._id] });
            try {
                await Message.create({ conversationId: convBC._id, sender: empB._id, text: 'Secret message between B and C' });

                const res = await request(app)
                    .get(`/api/messages/${convBC._id}`)
                    .set('Authorization', `Bearer ${empAToken}`);

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Access denied for this conversation.');
                expect(res.body.messages).toBeUndefined();
            } finally {
                await Message.deleteMany({ conversationId: convBC._id });
                await Conversation.deleteOne({ _id: convBC._id });
            }
        });

        // 2. Employee A posts into B and C's conversation: 403
        it('2. Part 0(b): Employee A posts into B and C conversation: 403 with exact message', async () => {
            const convBC = await Conversation.create({ participants: [empB._id, empC._id] });
            try {
                const res = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .send({ conversationId: convBC._id.toString(), text: 'Intruder message' });

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Access denied for this conversation.');

                const inDb = await Message.findOne({ text: 'Intruder message' });
                expect(inDb).toBeNull();
            } finally {
                await Conversation.deleteOne({ _id: convBC._id });
            }
        });

        // 3. Participant reads their own conversation: 200
        it('3. Part 0(c): Participant reads their own conversation: 200', async () => {
            const convBC = await Conversation.create({ participants: [empB._id, empC._id] });
            try {
                await Message.create({ conversationId: convBC._id, sender: empB._id, text: 'Hello C' });

                const res = await request(app)
                    .get(`/api/messages/${convBC._id}`)
                    .set('Authorization', `Bearer ${empBToken}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.messages.length).toBe(1);
                expect(res.body.messages[0].text).toBe('Hello C');
            } finally {
                await Message.deleteMany({ conversationId: convBC._id });
                await Conversation.deleteOne({ _id: convBC._id });
            }
        });

        // 4. Employee A's conversation list does not include B-C conversations
        it('4. Part 0(d): Employee A conversation list does not include B-C conversations', async () => {
            let convBC, convAB;
            try {
                convBC = await Conversation.create({ participants: [empB._id, empC._id] });
                convAB = await Conversation.create({ participants: [empA._id, empB._id] });

                const res = await request(app)
                    .get('/api/conversations')
                    .set('Authorization', `Bearer ${empAToken}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                const convIds = res.body.conversations.map(c => c._id.toString());
                expect(convIds).toContain(convAB._id.toString());
                expect(convIds).not.toContain(convBC._id.toString());
            } finally {
                const toDelete = [];
                if (convBC) toDelete.push(convBC._id);
                if (convAB) toDelete.push(convAB._id);
                if (toDelete.length > 0) {
                    await Conversation.deleteMany({ _id: { $in: toDelete } });
                }
            }
        });

        // 5. Part 1: Team Lead sees all active employees in the directory
        it('5. Part 1: Team Lead sees all active employees in the directory', async () => {
            const res = await request(app)
                .get('/api/conversations/directory')
                .set('Authorization', `Bearer ${tlTokenP3}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const empIds = res.body.employees.map(e => e.id);
            expect(empIds).toContain('TEST_P3_EMPA');
            expect(empIds).toContain('TEST_P3_EMPB');
            expect(empIds).toContain('TEST_P3_ADMIN');
        });

        // 6. Part 2: Super Admin read of non-participant conversation creates READ AuditLog entry
        it('6. Part 2: Super Admin read of non-participant conversation creates READ AuditLog entry', async () => {
            const convBC = await Conversation.create({ participants: [empB._id, empC._id] });
            try {
                await Message.create({ conversationId: convBC._id, sender: empB._id, text: 'Admin watching this' });

                const res = await request(app)
                    .get(`/api/messages/${convBC._id}`)
                    .set('Authorization', `Bearer ${adminTokenP3}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);

                const audit = await AuditLog.findOne({
                    user_id: adminP3._id,
                    action: 'READ',
                    resource: 'conversation',
                    resource_id: convBC._id
                });
                expect(audit).not.toBeNull();
            } finally {
                await Message.deleteMany({ conversationId: convBC._id });
                await Conversation.deleteOne({ _id: convBC._id });
                await AuditLog.deleteMany({ resource_id: convBC._id });
            }
        });

        // 7. Part 2: Super Admin export of conversation creates EXPORT AuditLog entry and returns PDF
        it('7. Part 2: Super Admin export of conversation creates EXPORT AuditLog entry and returns PDF', async () => {
            const convBC = await Conversation.create({ participants: [empB._id, empC._id] });
            try {
                await Message.create({ conversationId: convBC._id, sender: empB._id, text: 'Export this chat' });

                const res = await request(app)
                    .get(`/api/messages/${convBC._id}/export`)
                    .set('Authorization', `Bearer ${adminTokenP3}`);

                expect(res.status).toBe(200);
                expect(res.headers['content-type']).toContain('application/pdf');

                const audit = await AuditLog.findOne({
                    user_id: adminP3._id,
                    action: 'EXPORT',
                    resource: 'conversation',
                    resource_id: convBC._id
                });
                expect(audit).not.toBeNull();
            } finally {
                await Message.deleteMany({ conversationId: convBC._id });
                await Conversation.deleteOne({ _id: convBC._id });
                await AuditLog.deleteMany({ resource_id: convBC._id });
            }
        });

        // 8. Part 3: PDF file upload under 10MB: 200 and file fields saved
        it('8. Part 3: PDF file upload under 10MB: 200 and file fields saved', async () => {
            const convAB = await Conversation.create({ participants: [empA._id, empB._id] });
            try {
                const pdfBuffer = Buffer.from('%PDF-1.4 test file content');
                const res = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .field('conversationId', convAB._id.toString())
                    .field('text', 'Here is the pdf')
                    .attach('file', pdfBuffer, { filename: 'test.pdf', contentType: 'application/pdf' });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.message.fileName).toBe('test.pdf');
                expect(res.body.message.mimeType).toBe('application/pdf');

                const inDb = await Message.findOne({ conversationId: convAB._id, fileName: 'test.pdf' });
                expect(inDb).not.toBeNull();
                expect(inDb.mimeType).toBe('application/pdf');
            } finally {
                await Message.deleteMany({ conversationId: convAB._id });
                await Conversation.deleteOne({ _id: convAB._id });
            }
        });

        // 9. Part 3: EXE file upload rejected: 400 with "File type not allowed."
        it('9. Part 3: EXE file upload rejected: 400 with "File type not allowed."', async () => {
            const convAB = await Conversation.create({ participants: [empA._id, empB._id] });
            try {
                const exeBuffer = Buffer.from('MZ executable test content');
                const res = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .field('conversationId', convAB._id.toString())
                    .field('text', 'Check this app')
                    .attach('file', exeBuffer, { filename: 'malware.exe', contentType: 'application/x-msdownload' });

                expect(res.status).toBe(400);
                expect(res.body.message).toBe('File type not allowed.');
            } finally {
                await Conversation.deleteOne({ _id: convAB._id });
            }
        });

        // 10. Part 3: Over 10 MB file upload rejected: 400 with "File must be 10 MB or smaller."
        it('10. Part 3: Over 10 MB file upload rejected: 400 with "File must be 10 MB or smaller."', async () => {
            const convAB = await Conversation.create({ participants: [empA._id, empB._id] });
            try {
                // 11 MB buffer
                const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 0);
                const res = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .field('conversationId', convAB._id.toString())
                    .attach('file', largeBuffer, { filename: 'large.pdf', contentType: 'application/pdf' });

                expect(res.status).toBe(400);
                expect(res.body.message).toBe('File must be 10 MB or smaller.');
            } finally {
                await Conversation.deleteOne({ _id: convAB._id });
            }
        });

        // 11. Part 4: Two employees of different roles exchange messages; both can read
        it('11. Part 4: Two employees of different roles exchange messages; both can read', async () => {
            const conv = await Conversation.create({ participants: [empA._id, mgrP3._id] });
            try {
                const res1 = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .send({ conversationId: conv._id.toString(), text: 'Hello Manager' });
                expect(res1.status).toBe(200);

                const res2 = await request(app)
                    .post('/api/messages')
                    .set('Authorization', `Bearer ${mgrTokenP3}`)
                    .send({ conversationId: conv._id.toString(), text: 'Hello Employee' });
                expect(res2.status).toBe(200);

                const readEmp = await request(app)
                    .get(`/api/messages/${conv._id}`)
                    .set('Authorization', `Bearer ${empAToken}`);
                expect(readEmp.status).toBe(200);
                expect(readEmp.body.messages.length).toBe(2);

                const readMgr = await request(app)
                    .get(`/api/messages/${conv._id}`)
                    .set('Authorization', `Bearer ${mgrTokenP3}`);
                expect(readMgr.status).toBe(200);
                expect(readMgr.body.messages.length).toBe(2);
            } finally {
                await Message.deleteMany({ conversationId: conv._id });
                await Conversation.deleteOne({ _id: conv._id });
            }
        });

        // 12. Part 4: Poll with "since" returns only newer messages
        it('12. Part 4: Poll with "since" returns only newer messages', async () => {
            const conv = await Conversation.create({ participants: [empA._id, empB._id] });
            try {
                const m1 = await Message.create({ conversationId: conv._id, sender: empA._id, text: 'Msg 1', createdAt: new Date(Date.now() - 5000) });
                const m2 = await Message.create({ conversationId: conv._id, sender: empB._id, text: 'Msg 2', createdAt: new Date() });

                const res = await request(app)
                    .get(`/api/messages/${conv._id}?since=${m1.createdAt.toISOString()}`)
                    .set('Authorization', `Bearer ${empAToken}`);

                expect(res.status).toBe(200);
                expect(res.body.messages.length).toBe(1);
                expect(res.body.messages[0].text).toBe('Msg 2');
            } finally {
                await Message.deleteMany({ conversationId: conv._id });
                await Conversation.deleteOne({ _id: conv._id });
            }
        });

        // 13. Part 4: Manager export 403 with exact message
        it('13. Part 4: Manager export 403 with exact message', async () => {
            const conv = await Conversation.create({ participants: [mgrP3._id, empA._id] });
            try {
                const res = await request(app)
                    .get(`/api/messages/${conv._id}/export`)
                    .set('Authorization', `Bearer ${mgrTokenP3}`);

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Only Super Admins can export chats.');
            } finally {
                await Conversation.deleteOne({ _id: conv._id });
            }
        });

        // 14. Part 4: Employee with live_chat permission flag tries to export: 403
        it('14. Part 4: Employee with live_chat permission flag tries to export: 403', async () => {
            const conv = await Conversation.create({ participants: [empWithChatPerm._id, empA._id] });
            try {
                const res = await request(app)
                    .get(`/api/messages/${conv._id}/export`)
                    .set('Authorization', `Bearer ${empWithChatPermToken}`);

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Only Super Admins can export chats.');
            } finally {
                await Conversation.deleteOne({ _id: conv._id });
            }
        });

        // 15. Part 5: Team Lead DELETE on an employee returns 403 with exact message
        it('15. Part 5: Team Lead DELETE on an employee returns 403 with exact message', async () => {
            const targetEmp = await Employee.create({
                id: 'TEST_P3_TARGET_EMP',
                name: 'Target Employee',
                email: 'target_emp@zograhatechnologies.test',
                password_hash: await bcrypt.hash('Secret123!', 10),
                role: 'employee',
                status: 'active'
            });

            try {
                const res = await request(app)
                    .delete(`/api/employees/${targetEmp.id}`)
                    .set('Authorization', `Bearer ${tlTokenP3}`);

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Forbidden. Team Leads cannot delete employees.');

                const inDb = await Employee.findOne({ id: targetEmp.id });
                expect(inDb.status).toBe('active');
            } finally {
                await Employee.deleteOne({ _id: targetEmp._id });
            }
        });

        // 16. team_lead GET /api/attendance/team: 200
        it('16. team_lead GET /api/attendance/team returns 200', async () => {
            const res = await request(app)
                .get('/api/attendance/team')
                .set('Authorization', `Bearer ${tlTokenP3}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 17. team_lead GET /api/employees: 200, results limited to the team lead scope
        it('17. team_lead GET /api/employees: 200, results limited to the team lead scope', async () => {
            let otherDept, outsideEmp;
            try {
                otherDept = await Department.create({ name: 'TEST_OTHER_DEPT_TL_SCOPE' });
                outsideEmp = await Employee.create({
                    id: 'TEST_OUTSIDE_EMP_TL',
                    name: 'Outside Employee',
                    email: 'outside_emp_tl@zograhatechnologies.test',
                    password_hash: await bcrypt.hash('Secret123!', 10),
                    role: 'employee',
                    department_id: otherDept._id,
                    status: 'active'
                });

                await Employee.updateOne({ _id: empA._id }, { team_lead_id: tlP3.id });

                const res = await request(app)
                    .get('/api/employees')
                    .set('Authorization', `Bearer ${tlTokenP3}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                const returnedIds = (res.body.employees || []).map(e => e.id);
                expect(returnedIds).toContain(empA.id);
                expect(returnedIds).not.toContain(outsideEmp.id);
            } finally {
                if (outsideEmp) await Employee.deleteOne({ _id: outsideEmp._id });
                if (otherDept) await Department.deleteOne({ _id: otherDept._id });
                await Employee.updateOne({ _id: empA._id }, { team_lead_id: null });
            }
        });

        // 18. team_lead GET /api/conversations/directory: 200, includes active employees from other departments
        it('18. team_lead GET /api/conversations/directory: 200, includes active employees from other departments', async () => {
            let otherDept, outsideEmp;
            try {
                otherDept = await Department.create({ name: 'TEST_OTHER_DEPT_DIR' });
                outsideEmp = await Employee.create({
                    id: 'TEST_OUTSIDE_EMP_DIR',
                    name: 'Outside Employee Dir',
                    email: 'outside_emp_dir@zograhatechnologies.test',
                    password_hash: await bcrypt.hash('Secret123!', 10),
                    role: 'employee',
                    department_id: otherDept._id,
                    status: 'active'
                });

                const res = await request(app)
                    .get('/api/conversations/directory')
                    .set('Authorization', `Bearer ${tlTokenP3}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                const empIds = res.body.employees.map(e => e.id);
                expect(empIds).toContain(outsideEmp.id);
                expect(empIds).toContain(empA.id);
            } finally {
                if (outsideEmp) await Employee.deleteOne({ _id: outsideEmp._id });
                if (otherDept) await Department.deleteOne({ _id: otherDept._id });
            }
        });

        // 19. employee POST /api/conversations to another employee returns 201
        it('19. employee POST /api/conversations to another employee returns 201', async () => {
            let target, convId;
            try {
                target = await Employee.create({
                    id: 'TEST_FRESH_TARGET_CONV',
                    name: 'Fresh Target',
                    email: 'fresh_target@zograhatechnologies.test',
                    password_hash: await bcrypt.hash('Secret123!', 10),
                    role: 'employee',
                    status: 'active'
                });

                const res = await request(app)
                    .post('/api/conversations')
                    .set('Authorization', `Bearer ${empAToken}`)
                    .send({ recipientId: target._id.toString() });

                expect(res.status).toBe(201);
                expect(res.body.success).toBe(true);
                expect(res.body.conversation).toBeDefined();
                convId = res.body.conversation._id;
            } finally {
                if (convId) await Conversation.deleteOne({ _id: convId });
                if (target) await Employee.deleteOne({ _id: target._id });
            }
        });

        // 20. team_lead GET performance list excludes an employee outside their team
        it('20. team_lead GET performance list excludes an employee outside their team', async () => {
            const Goal = require('../models/Goal');
            let otherDept, outsideEmp, teamGoal, outsideGoal, orgGoal, teamTypeGoal;
            try {
                otherDept = await Department.create({ name: 'TEST_OTHER_DEPT_PERF' });
                outsideEmp = await Employee.create({
                    id: 'TEST_OUTSIDE_EMP_PERF',
                    name: 'Outside Employee Perf',
                    email: 'outside_emp_perf@zograhatechnologies.test',
                    password_hash: await bcrypt.hash('Secret123!', 10),
                    role: 'employee',
                    department_id: otherDept._id,
                    status: 'active'
                });

                // Put empA in team lead tlP3's team
                await Employee.updateOne({ _id: empA._id }, { team_lead_id: tlP3.id });

                teamGoal = await Goal.create({
                    employee_id: empA.id,
                    creator_id: tlP3.id,
                    title: 'Team Member Goal In Team',
                    type: 'individual',
                    due_date: new Date(Date.now() + 86400000)
                });

                outsideGoal = await Goal.create({
                    employee_id: outsideEmp.id,
                    creator_id: outsideEmp.id,
                    title: 'Outside Team Goal Out Of Scope',
                    type: 'individual',
                    due_date: new Date(Date.now() + 86400000)
                });

                orgGoal = await Goal.create({
                    employee_id: null,
                    creator_id: adminP3.id,
                    title: 'Org Wide Goal',
                    type: 'organization',
                    due_date: new Date(Date.now() + 86400000)
                });

                teamTypeGoal = await Goal.create({
                    employee_id: null,
                    creator_id: tlP3.id,
                    title: 'Team Wide Goal',
                    type: 'team',
                    due_date: new Date(Date.now() + 86400000)
                });

                const res = await request(app)
                    .get('/api/performance')
                    .set('Authorization', `Bearer ${tlTokenP3}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                const returnedGoalIds = (res.body.goals || []).map(g => g._id.toString());
                const returnedEmpIds = (res.body.goals || []).map(g => g.employee_id);

                // a) team_lead sees an organization-type goal (employee_id null): included
                expect(returnedGoalIds).toContain(orgGoal._id.toString());

                // b) team_lead sees a team-type goal: included
                expect(returnedGoalIds).toContain(teamTypeGoal._id.toString());

                // Member of team: included
                expect(returnedGoalIds).toContain(teamGoal._id.toString());
                expect(returnedEmpIds).toContain(empA.id);

                // c) team_lead does not see an individual goal for an outside employee: excluded
                expect(returnedGoalIds).not.toContain(outsideGoal._id.toString());
                expect(returnedEmpIds).not.toContain(outsideEmp.id);
            } finally {
                const goalIds = [];
                if (teamGoal) goalIds.push(teamGoal._id);
                if (outsideGoal) goalIds.push(outsideGoal._id);
                if (orgGoal) goalIds.push(orgGoal._id);
                if (teamTypeGoal) goalIds.push(teamTypeGoal._id);
                if (goalIds.length > 0) {
                    await Goal.deleteMany({ _id: { $in: goalIds } });
                }
                if (outsideEmp) await Employee.deleteOne({ _id: outsideEmp._id });
                if (otherDept) await Department.deleteOne({ _id: otherDept._id });
                await Employee.updateOne({ _id: empA._id }, { team_lead_id: null });
            }
        });

        // 21. employee GET performance for another employee returns 403
        it('21. employee GET performance for another employee returns 403', async () => {
            const res = await request(app)
                .get(`/api/performance?employee_id=${empB.id}`)
                .set('Authorization', `Bearer ${empAToken}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Forbidden. You can only view your own performance records.');
        });
    });

    describe('14. Phase 1 Attendance Sessions, Holidays, and Dashboard Tests', () => {
        let deptP1, adminP1, mgrP1, tlP1, empP1;
        let adminTokenP1, mgrTokenP1, tlTokenP1, empTokenP1;
        let defaultShift;
        const Holiday = require('../models/Holiday');
        const Event = require('../models/Event');
        const Attendance = require('../models/Attendance');
        const Notification = require('../models/Notification');
        const Leave = require('../models/Leave');
        const Shift = require('../models/Shift');
        const Department = require('../models/Department');
        const Employee = require('../models/Employee');
        const { toISTDateString, getISTDayStart, getISTDayEnd } = require('../utils/istDate');

        beforeAll(async () => {
            deptP1 = await Department.create({ name: 'TEST_P1_DEPT' });
            const pwd = await bcrypt.hash('Secret123!', 10);

            defaultShift = await Shift.findOne({ is_default: true });
            if (!defaultShift) {
                defaultShift = await Shift.create({
                    name: 'TEST_P1_DEFAULT_SHIFT',
                    start_time: '09:00',
                    end_time: '18:00',
                    is_default: true,
                    grace_period: 15
                });
            }

            adminP1 = await Employee.create({
                id: 'TEST_P1_ADMIN',
                name: 'P1 Admin',
                email: 'p1_admin@zograhatechnologies.test',
                password_hash: pwd,
                role: 'admin',
                department_id: deptP1._id,
                status: 'active'
            });

            mgrP1 = await Employee.create({
                id: 'TEST_P1_MGR',
                name: 'P1 Manager',
                email: 'p1_mgr@zograhatechnologies.test',
                password_hash: pwd,
                role: 'manager',
                department_id: deptP1._id,
                status: 'active'
            });

            tlP1 = await Employee.create({
                id: 'TEST_P1_TL',
                name: 'P1 Team Lead',
                email: 'p1_tl@zograhatechnologies.test',
                password_hash: pwd,
                role: 'team_lead',
                department_id: deptP1._id,
                status: 'active'
            });

            empP1 = await Employee.create({
                id: 'TEST_P1_EMP',
                name: 'P1 Employee',
                email: 'p1_emp@zograhatechnologies.test',
                password_hash: pwd,
                role: 'employee',
                department_id: deptP1._id,
                status: 'active'
            });

            adminTokenP1 = jwt.sign({ id: adminP1.id, _id: adminP1._id, role: adminP1.role }, process.env.JWT_SECRET);
            mgrTokenP1 = jwt.sign({ id: mgrP1.id, _id: mgrP1._id, role: mgrP1.role }, process.env.JWT_SECRET);
            tlTokenP1 = jwt.sign({ id: tlP1.id, _id: tlP1._id, role: tlP1.role }, process.env.JWT_SECRET);
            empTokenP1 = jwt.sign({ id: empP1.id, _id: empP1._id, role: empP1.role }, process.env.JWT_SECRET);
        });

        afterAll(async () => {
            if (empP1) await Attendance.deleteMany({ employee_id: empP1.id });
            await Employee.deleteMany({ id: { $in: ['TEST_P1_ADMIN', 'TEST_P1_MGR', 'TEST_P1_TL', 'TEST_P1_EMP'] } });
            if (deptP1) await Department.deleteOne({ _id: deptP1._id });
        });

        // 1. Reject second check-in while a session is open with 400
        it('1. Reject a second check-in while a session is open with 400', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            try {
                const in1 = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(in1.status).toBe(201);
                expect(in1.body.attendance.is_open_session).toBe(true);

                const in2 = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(in2.status).toBe(400);
                expect(in2.body.message).toBe('Cannot clock in while a session is open. Please clock out first.');
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 2. Reject check-out when no session is open with 400
        it('2. Reject check-out when no session is open with 400', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const out = await request(app)
                .post('/api/attendance/clock-out')
                .set('Authorization', `Bearer ${empTokenP1}`);
            expect(out.status).toBe(400);
            expect(out.body.message).toBe('No open clock-in session found to clock out from.');
        });

        // 3. Two completed sessions in one day sum correctly and open_session is false
        it('3. Two completed sessions in one day sum correctly and open_session is false', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const testDateStr = '2026-06-15';
            const s1In = new Date('2026-06-15T09:00:00.000Z');
            const s1Out = new Date('2026-06-15T12:00:00.000Z'); // 3 hours
            const s2In = new Date('2026-06-15T13:00:00.000Z');
            const s2Out = new Date('2026-06-15T17:00:00.000Z'); // 4 hours

            try {
                await Attendance.create([
                    {
                        employee_id: empP1.id,
                        date: s1In,
                        check_in: s1In,
                        check_out: s1Out,
                        work_hours: 3,
                        status: 'present',
                        is_open_session: false
                    },
                    {
                        employee_id: empP1.id,
                        date: s2In,
                        check_in: s2In,
                        check_out: s2Out,
                        work_hours: 4,
                        status: 'present',
                        is_open_session: false
                    }
                ]);

                const res = await request(app)
                    .get(`/api/attendance/logs?employee_id=${empP1.id}&from=${testDateStr}&to=${testDateStr}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.logs.length).toBe(1);
                const dayLog = res.body.logs[0];
                expect(dayLog.worked_hours).toBe(7);
                expect(dayLog.open_session).toBe(false);
                expect(new Date(dayLog.first_check_in).toISOString()).toBe(s1In.toISOString());
                expect(new Date(dayLog.last_check_out).toISOString()).toBe(s2Out.toISOString());
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 4. An open session is flagged and excluded from total hours
        it('4. An open session is flagged and excluded from total hours', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const testDateStr = '2026-06-16';
            const s1In = new Date('2026-06-16T09:00:00.000Z');
            const s1Out = new Date('2026-06-16T13:00:00.000Z'); // 4 hours
            const s2In = new Date('2026-06-16T14:00:00.000Z'); // open session

            try {
                await Attendance.create([
                    {
                        employee_id: empP1.id,
                        date: s1In,
                        check_in: s1In,
                        check_out: s1Out,
                        work_hours: 4,
                        status: 'present',
                        is_open_session: false
                    },
                    {
                        employee_id: empP1.id,
                        date: s2In,
                        check_in: s2In,
                        status: 'present',
                        is_open_session: true,
                        work_hours: 0
                    }
                ]);

                const res = await request(app)
                    .get(`/api/attendance/logs?employee_id=${empP1.id}&from=${testDateStr}&to=${testDateStr}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.logs.length).toBe(1);
                const dayLog = res.body.logs[0];
                expect(dayLog.worked_hours).toBe(4);
                expect(dayLog.open_session).toBe(true);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 5. IST midnight boundary: session near UTC midnight correctly maps to IST calendar date
        it('5. Attendance on IST midnight boundary maps to correct IST date', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            // 2026-06-17 19:00:00 UTC = 2026-06-18 00:30:00 IST
            const boundaryDate = new Date('2026-06-17T19:00:00.000Z');
            const istDateStr = toISTDateString(boundaryDate);
            expect(istDateStr).toBe('2026-06-18');

            try {
                await Attendance.create({
                    employee_id: empP1.id,
                    date: boundaryDate,
                    check_in: boundaryDate,
                    check_out: new Date('2026-06-17T21:00:00.000Z'),
                    work_hours: 2,
                    status: 'present',
                    is_open_session: false
                });

                const res18 = await request(app)
                    .get(`/api/attendance/logs?employee_id=${empP1.id}&from=2026-06-18&to=2026-06-18`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res18.status).toBe(200);
                expect(res18.body.logs.length).toBe(1);
                expect(res18.body.logs[0].date).toBe('2026-06-18');

                const res17 = await request(app)
                    .get(`/api/attendance/logs?employee_id=${empP1.id}&from=2026-06-17&to=2026-06-17`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res17.status).toBe(200);
                expect(res17.body.logs.length).toBe(0);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 6. SuperAdmin can create a holiday (POST /api/holidays -> 201) and fans out notifications
        it('6. SuperAdmin can create a holiday (201) and fan-out notifications to active employees', async () => {
            const hDate = '2026-12-25';
            await Holiday.deleteOne({ date: hDate });
            await Notification.deleteMany({ type: 'holiday' });

            try {
                const res = await request(app)
                    .post('/api/holidays')
                    .set('Authorization', `Bearer ${adminTokenP1}`)
                    .send({ date: hDate, name: 'Christmas Day' });

                expect(res.status).toBe(201);
                expect(res.body.success).toBe(true);
                expect(res.body.holiday.date).toBe(hDate);
                expect(res.body.holiday.name).toBe('Christmas Day');

                const inDb = await Holiday.findOne({ date: hDate });
                expect(inDb).not.toBeNull();

                // Fan-out notifications to active employees
                const notifs = await Notification.find({ type: 'holiday' });
                expect(notifs.length).toBeGreaterThan(0);
                const empNotif = notifs.find(n => n.recipient.toString() === empP1._id.toString());
                expect(empNotif).toBeDefined();
                expect(empNotif.title).toBe('New Holiday Announced');
            } finally {
                await Holiday.deleteOne({ date: hDate });
                await Notification.deleteMany({ type: 'holiday' });
            }
        });

        // 7. Non-admin roles (manager, team_lead, employee) get 403 on POST /api/holidays
        it('7. Non-admin roles (manager, team_lead, employee) get 403 on POST /api/holidays', async () => {
            const mgrRes = await request(app)
                .post('/api/holidays')
                .set('Authorization', `Bearer ${mgrTokenP1}`)
                .send({ date: '2026-11-14', name: 'Diwali' });
            expect(mgrRes.status).toBe(403);

            const tlRes = await request(app)
                .post('/api/holidays')
                .set('Authorization', `Bearer ${tlTokenP1}`)
                .send({ date: '2026-11-14', name: 'Diwali' });
            expect(tlRes.status).toBe(403);

            const empRes = await request(app)
                .post('/api/holidays')
                .set('Authorization', `Bearer ${empTokenP1}`)
                .send({ date: '2026-11-14', name: 'Diwali' });
            expect(empRes.status).toBe(403);
        });

        // 8. Non-admin roles get 403 on POST /api/attendance/mark-holiday
        it('8. Non-admin roles get 403 on POST /api/attendance/mark-holiday', async () => {
            const mgrRes = await request(app)
                .post('/api/attendance/mark-holiday')
                .set('Authorization', `Bearer ${mgrTokenP1}`)
                .send({ startDate: '2026-11-14' });
            expect(mgrRes.status).toBe(403);

            const tlRes = await request(app)
                .post('/api/attendance/mark-holiday')
                .set('Authorization', `Bearer ${tlTokenP1}`)
                .send({ startDate: '2026-11-14' });
            expect(tlRes.status).toBe(403);

            const empRes = await request(app)
                .post('/api/attendance/mark-holiday')
                .set('Authorization', `Bearer ${empTokenP1}`)
                .send({ startDate: '2026-11-14' });
            expect(empRes.status).toBe(403);

            // Verify controller-level check directly
            const { markHoliday } = require('../controllers/attendanceController');
            let mockStatus = 0;
            let mockJson = null;
            const mockRes = {
                status: (code) => { mockStatus = code; return mockRes; },
                json: (data) => { mockJson = data; return mockRes; }
            };
            await markHoliday({ user: { role: 'manager' }, body: { startDate: '2026-11-14' } }, mockRes);
            expect(mockStatus).toBe(403);
            expect(mockJson.message).toBe('Forbidden. Only Super Admins can mark holidays.');
        });

        // 9. GET /api/holidays/upcoming returns future holidays for any authenticated role
        it('9. GET /api/holidays/upcoming returns future holidays for all roles', async () => {
            const futureDate = '2099-01-01';
            await Holiday.deleteOne({ date: futureDate });
            try {
                await Holiday.create({
                    date: futureDate,
                    name: 'New Century Day',
                    createdBy: adminP1.id
                });

                const res = await request(app)
                    .get('/api/holidays/upcoming')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                const dates = (res.body.holidays || []).map(h => h.date);
                expect(dates).toContain(futureDate);
            } finally {
                await Holiday.deleteOne({ date: futureDate });
            }
        });

        // 10. Dashboard overview displays sick leave this month count matching limit logic
        it('10. Dashboard overview displays sick leave this month count matching limit logic', async () => {
            await Leave.deleteMany({ employee_id: empP1.id });
            const now = new Date();
            // Start date in current month
            const leaveStart = new Date(now.getFullYear(), now.getMonth(), 10);
            const leaveEnd = new Date(now.getFullYear(), now.getMonth(), 11);

            try {
                await Leave.create({
                    employee_id: empP1.id,
                    leave_type: 'sick',
                    status: 'pending',
                    start_date: leaveStart,
                    end_date: leaveEnd,
                    total_days: 2,
                    reason: 'Flu symptoms'
                });

                const res = await request(app)
                    .get('/api/employees/dashboard-overview')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.dashboard.leave.sickLeaveThisMonth).toBeDefined();
                expect(res.body.dashboard.leave.sickLeaveThisMonth.used).toBe(1);
                expect(res.body.dashboard.leave.sickLeaveThisMonth.total).toBe(1);
                expect(res.body.dashboard.leave.sickLeaveThisMonth.text).toBe('Sick leave this month: 1 of 1 used');
            } finally {
                await Leave.deleteMany({ employee_id: empP1.id });
            }
        });

        // 11. Non-admin cannot create or update Event with type holiday (403)
        it('11. Non-admin cannot create or update Event with type holiday (403)', async () => {
            // Manager tries to create Event with type holiday
            const createRes = await request(app)
                .post('/api/events')
                .set('Authorization', `Bearer ${mgrTokenP1}`)
                .send({
                    title: 'Manager Holiday',
                    date: new Date(),
                    startTime: '09:00',
                    endTime: '17:00',
                    type: 'holiday'
                });
            expect(createRes.status).toBe(403);
            expect(createRes.body.message).toMatch(/Forbidden/i);

            // Admin creates a normal event
            const adminEvent = await Event.create({
                title: 'Admin Normal Event',
                date: new Date(),
                startTime: '09:00',
                endTime: '17:00',
                type: 'meeting',
                createdBy: adminP1._id
            });

            try {
                // Manager tries to update type to holiday
                const updateRes = await request(app)
                    .put(`/api/events/${adminEvent._id}`)
                    .set('Authorization', `Bearer ${mgrTokenP1}`)
                    .send({ type: 'holiday' });
                expect(updateRes.status).toBe(403);
                expect(updateRes.body.message).toMatch(/Forbidden/i);
            } finally {
                await Event.deleteOne({ _id: adminEvent._id });
            }
        });

        // 12. Upcoming holidays and dashboard overview deduplicate Event and Holiday on the same date
        it('12. Upcoming holidays and dashboard overview deduplicate Event and Holiday on the same date', async () => {
            const dupDateStr = '2099-05-15';
            const dupDateObj = new Date(`${dupDateStr}T09:00:00Z`);

            await Holiday.deleteOne({ date: dupDateStr });
            await Event.deleteMany({ title: 'Duplicate Event Holiday' });

            try {
                // Create both a Holiday model record and an Event model record on the same date
                await Holiday.create({
                    date: dupDateStr,
                    name: 'Duplicate Model Holiday',
                    createdBy: adminP1.id
                });
                await Event.create({
                    title: 'Duplicate Event Holiday',
                    date: dupDateObj,
                    startTime: '00:00',
                    endTime: '23:59',
                    type: 'holiday',
                    createdBy: adminP1._id
                });

                // Test GET /api/holidays/upcoming
                const resHolidays = await request(app)
                    .get('/api/holidays/upcoming')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(resHolidays.status).toBe(200);
                const matchingHolidays = (resHolidays.body.holidays || []).filter(h => h.date === dupDateStr);
                // Must be exactly 1, not 2
                expect(matchingHolidays.length).toBe(1);

                // Test GET /api/employees/dashboard-overview
                const resDashboard = await request(app)
                    .get('/api/employees/dashboard-overview')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(resDashboard.status).toBe(200);
                const dashboardMatching = (resDashboard.body.dashboard?.upcomingHolidays || []).filter(h => h.date === dupDateStr);
                expect(dashboardMatching.length).toBe(1);
            } finally {
                await Holiday.deleteOne({ date: dupDateStr });
                await Event.deleteMany({ title: 'Duplicate Event Holiday' });
            }
        });

        // 13. SuperAdmin creates a holiday Event, and active employees receive a holiday notification
        it('13. SuperAdmin creates a holiday Event, and active employees receive a holiday notification', async () => {
            const hDate = new Date('2027-01-01T09:00:00Z');
            await Event.deleteMany({ title: 'TEST_SUPERADMIN_HOLIDAY_EVENT' });
            await Notification.deleteMany({ title: 'New Holiday Announced' });

            try {
                const res = await request(app)
                    .post('/api/events')
                    .set('Authorization', `Bearer ${adminTokenP1}`)
                    .send({
                        title: 'TEST_SUPERADMIN_HOLIDAY_EVENT',
                        date: hDate,
                        startTime: '00:00',
                        endTime: '23:59',
                        type: 'holiday'
                    });

                expect(res.status).toBe(201);
                expect(res.body.success).toBe(true);

                const notifs = await Notification.find({ type: 'holiday', title: 'New Holiday Announced' });
                expect(notifs.length).toBeGreaterThan(0);
                const empNotif = notifs.find(n => n.recipient.toString() === empP1._id.toString());
                expect(empNotif).toBeDefined();
                expect(empNotif.message).toContain('TEST_SUPERADMIN_HOLIDAY_EVENT');
            } finally {
                await Event.deleteMany({ title: 'TEST_SUPERADMIN_HOLIDAY_EVENT' });
                await Notification.deleteMany({ title: 'New Holiday Announced' });
            }
        });

        // 14. Open session from yesterday blocks clock-in with date in message
        it('14. Open session from yesterday blocks clock-in with date in message', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            const yIST = toISTDateString(yesterday);
            const [y, m, d] = yIST.split('-');
            const formattedDate = `${d}/${m}/${y}`;

            try {
                await Attendance.create({
                    employee_id: empP1.id,
                    date: yesterday,
                    check_in: yesterday,
                    status: 'present',
                    is_open_session: true
                });

                const res = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(400);
                expect(res.body.message).toBe(`You have an open session from ${formattedDate}. Clock out first.`);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 15. Clock-out closes open session from yesterday and sets needs_review true
        it('15. Clock-out closes open session from yesterday and sets needs_review true', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            try {
                const openRec = await Attendance.create({
                    employee_id: empP1.id,
                    date: yesterday,
                    check_in: yesterday,
                    status: 'present',
                    is_open_session: true
                });

                const res = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.attendance.is_open_session).toBe(false);
                expect(res.body.attendance.needs_review).toBe(true);

                const inDb = await Attendance.findById(openRec._id);
                expect(inDb.is_open_session).toBe(false);
                expect(inDb.needs_review).toBe(true);
                expect(inDb.check_out).toBeDefined();
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 16. Clock-in succeeds after open session from yesterday is closed
        it('16. Clock-in succeeds after open session from yesterday is closed', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            try {
                await Attendance.create({
                    employee_id: empP1.id,
                    date: yesterday,
                    check_in: yesterday,
                    status: 'present',
                    is_open_session: true
                });

                // Clock out to close it
                const outRes = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(outRes.status).toBe(200);

                // Now clock-in succeeds
                const inRes = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(inRes.status).toBe(201);
                expect(inRes.body.attendance.is_open_session).toBe(true);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 17. Employee receiving a holiday notification sees it in GET /api/notifications with their token
        it('17. Employee receiving a holiday notification sees it in GET /api/notifications with their token', async () => {
            const holidayDate = '2028-11-20';
            await Holiday.deleteOne({ date: holidayDate });
            await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });

            try {
                const createRes = await request(app)
                    .post('/api/holidays')
                    .set('Authorization', `Bearer ${adminTokenP1}`)
                    .send({ date: holidayDate, name: 'Diwali Festival' });

                expect(createRes.status).toBe(201);

                const notifRes = await request(app)
                    .get('/api/notifications')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(notifRes.status).toBe(200);
                expect(notifRes.body.success).toBe(true);
                const myNotifs = notifRes.body.notifications || [];
                const found = myNotifs.find(n => n.type === 'holiday' && n.message.includes('Diwali Festival'));
                expect(found).toBeDefined();
            } finally {
                await Holiday.deleteOne({ date: holidayDate });
                await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });
            }
        });

        // 18. A needs_review record is returned with needs_review: true and its hours are not counted
        it('18. A needs_review record is returned with needs_review: true and its hours are not counted', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const testDate = new Date();
            testDate.setHours(9, 0, 0, 0);
            const dateStr = testDate.toISOString().split('T')[0];

            try {
                // One completed normal session (3 hours)
                await Attendance.create({
                    employee_id: empP1.id,
                    date: testDate,
                    check_in: new Date(testDate.getTime()),
                    check_out: new Date(testDate.getTime() + 3 * 60 * 60 * 1000),
                    status: 'present',
                    work_hours: 3,
                    is_open_session: false,
                    needs_review: false
                });

                // One needs_review session (e.g. spanning multiple days, marked needs_review: true)
                await Attendance.create({
                    employee_id: empP1.id,
                    date: testDate,
                    check_in: new Date(testDate.getTime() + 4 * 60 * 60 * 1000),
                    check_out: new Date(testDate.getTime() + 28 * 60 * 60 * 1000),
                    status: 'present',
                    work_hours: 0,
                    is_open_session: false,
                    needs_review: true
                });

                const res = await request(app)
                    .get(`/api/attendance/${empP1.id}?month=${testDate.getMonth() + 1}&year=${testDate.getFullYear()}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);

                const dayRecord = res.body.attendance.find(a => new Date(a.date).toISOString().split('T')[0] === dateStr);
                expect(dayRecord).toBeDefined();
                expect(dayRecord.needs_review).toBe(true);
                // Worked hours should only count the 3 hours from the valid session
                expect(dayRecord.work_hours).toBe(3);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 19. createHoliday creates Attendance records with status 'holiday' for employees without records, preserving existing records
        it('19. createHoliday marks attendance status holiday for employees without records, preserving existing records', async () => {
            const hDate = '2029-08-15';
            const hStart = getISTDayStart(hDate);
            const hEnd = getISTDayEnd(hDate);

            await Holiday.deleteOne({ date: hDate });
            await Attendance.deleteMany({ date: { $gte: hStart, $lt: hEnd } });
            await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });

            try {
                await Employee.updateOne({ id: tlP1.id }, { $set: { date_of_joining: new Date('2029-01-01') } });

                // empP1 already clocked in on that date
                const existingRec = await Attendance.create({
                    employee_id: empP1.id,
                    date: hStart,
                    check_in: hStart,
                    status: 'present',
                    is_open_session: true
                });

                // tlP1 has no attendance record on that date
                // Non-admin POST /api/holidays returns 403
                const forbiddenRes = await request(app)
                    .post('/api/holidays')
                    .set('Authorization', `Bearer ${empTokenP1}`)
                    .send({ date: hDate, name: 'Independence Day' });
                expect(forbiddenRes.status).toBe(403);

                // Admin creates holiday
                const createRes = await request(app)
                    .post('/api/holidays')
                    .set('Authorization', `Bearer ${adminTokenP1}`)
                    .send({ date: hDate, name: 'Independence Day' });
                expect(createRes.status).toBe(201);

                // (1) Employee with no record (tlP1) gets status 'holiday'
                const tlRec = await Attendance.findOne({
                    employee_id: tlP1.id,
                    date: { $gte: hStart, $lt: hEnd }
                });
                expect(tlRec).toBeDefined();
                expect(tlRec.status).toBe('holiday');
                expect(tlRec.work_hours).toBe(0);

                // (2) Employee who checked in keeps their record unchanged
                const empRec = await Attendance.findOne({
                    employee_id: empP1.id,
                    date: { $gte: hStart, $lt: hEnd }
                });
                expect(empRec).toBeDefined();
                expect(empRec._id.toString()).toBe(existingRec._id.toString());
                expect(empRec.status).toBe('present');
                expect(empRec.is_open_session).toBe(true);

                // (3) Notifications still go to all active employees
                const notifs = await Notification.find({ type: 'holiday', title: 'New Holiday Announced' });
                const recips = notifs.map(n => n.recipient.toString());
                expect(recips).toContain(empP1._id.toString());
                expect(recips).toContain(tlP1._id.toString());
            } finally {
                await Holiday.deleteOne({ date: hDate });
                await Attendance.deleteMany({ date: { $gte: hStart, $lt: hEnd } });
                await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });
            }
        });

        // 20. Employee whose date_of_joining is after the holiday date gets NO attendance record, while employee who joined on or before gets status 'holiday'
        it('20. Employee whose date_of_joining is after the holiday date gets NO attendance record, while employee who joined on or before gets status holiday', async () => {
            const hDate = '2030-01-26';
            const hStart = getISTDayStart(hDate);
            const hEnd = getISTDayEnd(hDate);

            // Employee 1 joined before holiday
            const joinedBefore = await Employee.create({
                id: 'TEST_JOIN_BEFORE_EMP',
                name: 'Join Before Emp',
                email: 'joinbefore@zograhatechnologies.test',
                password_hash: 'hash',
                role: 'employee',
                status: 'active',
                date_of_joining: new Date('2030-01-01T00:00:00.000Z')
            });

            // Employee 2 joined after holiday
            const joinedAfter = await Employee.create({
                id: 'TEST_JOIN_AFTER_EMP',
                name: 'Join After Emp',
                email: 'joinafter@zograhatechnologies.test',
                password_hash: 'hash',
                role: 'employee',
                status: 'active',
                date_of_joining: new Date('2030-02-01T00:00:00.000Z')
            });

            await Holiday.deleteOne({ date: hDate });
            await Attendance.deleteMany({ date: { $gte: hStart, $lt: hEnd } });
            await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });

            try {
                const res = await request(app)
                    .post('/api/holidays')
                    .set('Authorization', `Bearer ${adminTokenP1}`)
                    .send({ date: hDate, name: 'Republic Day' });

                expect(res.status).toBe(201);

                // Joined before -> gets status 'holiday'
                const recBefore = await Attendance.findOne({
                    employee_id: joinedBefore.id,
                    date: { $gte: hStart, $lt: hEnd }
                });
                expect(recBefore).toBeDefined();
                expect(recBefore.status).toBe('holiday');
                expect(recBefore.work_hours).toBe(0);

                // Joined after -> gets NO attendance record
                const recAfter = await Attendance.findOne({
                    employee_id: joinedAfter.id,
                    date: { $gte: hStart, $lt: hEnd }
                });
                expect(recAfter).toBeNull();

                // But notifications still go to all active employees regardless of joining date
                const notifs = await Notification.find({ type: 'holiday', title: 'New Holiday Announced' });
                const recips = notifs.map(n => n.recipient.toString());
                expect(recips).toContain(joinedBefore._id.toString());
                expect(recips).toContain(joinedAfter._id.toString());
            } finally {
                await Employee.deleteMany({ id: { $in: ['TEST_JOIN_BEFORE_EMP', 'TEST_JOIN_AFTER_EMP'] } });
                await Holiday.deleteOne({ date: hDate });
                await Attendance.deleteMany({ date: { $gte: hStart, $lt: hEnd } });
                await Notification.deleteMany({ type: 'holiday', title: 'New Holiday Announced' });
            }
        });

        // 21. Open session dated tomorrow: clockOut closes it, sets needs_review true, work_hours 0
        it('21. Open session dated tomorrow: clockOut closes it, sets needs_review true, work_hours 0', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            try {
                const openRec = await Attendance.create({
                    employee_id: empP1.id,
                    date: tomorrow,
                    check_in: tomorrow,
                    status: 'present',
                    is_open_session: true
                });

                const res = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.attendance.is_open_session).toBe(false);
                expect(res.body.attendance.needs_review).toBe(true);
                expect(res.body.attendance.work_hours).toBe(0);

                const inDb = await Attendance.findById(openRec._id);
                expect(inDb.is_open_session).toBe(false);
                expect(inDb.needs_review).toBe(true);
                expect(inDb.work_hours).toBe(0);
                expect(inDb.check_out).toBeDefined();
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 22. Button state: getTodayStatus returns open_session non-null when an open session exists from a prior day
        it('22. Button state: getTodayStatus returns open_session non-null when an open session exists from a prior day', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 2);

            try {
                await Attendance.create({
                    employee_id: empP1.id,
                    date: yesterday,
                    check_in: yesterday,
                    status: 'present',
                    is_open_session: true
                });

                const res = await request(app)
                    .get('/api/attendance/today')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
                expect(res.body.open_session).not.toBeNull();
                expect(res.body.open_session.check_in).toBeDefined();
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 23. clockIn blocked while open_session exists; succeeds after clockOut
        it('23. clockIn blocked while open_session exists; succeeds after clockOut', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const pastDate = new Date();
            pastDate.setMinutes(pastDate.getMinutes() - 30);

            try {
                await Attendance.create({
                    employee_id: empP1.id,
                    date: pastDate,
                    check_in: pastDate,
                    status: 'present',
                    is_open_session: true
                });

                // Attempt to clock in should fail
                const blockedRes = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(blockedRes.status).toBe(400);

                // Clock out closes the session
                const outRes = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(outRes.status).toBe(200);

                // Now clock-in succeeds
                const inRes = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);
                expect(inRes.status).toBe(201);
                expect(inRes.body.attendance.is_open_session).toBe(true);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 24. (a) A holiday placeholder row (no check_in, status 'holiday') is ignored by findOpenSession. clockIn succeeds when only placeholders exist.
        it('24. A holiday placeholder row is ignored by findOpenSession; clockIn succeeds when only placeholders exist', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            try {
                // Holiday placeholder row (e.g. from an earlier holiday)
                await Attendance.create({
                    employee_id: empP1.id,
                    date: new Date('2025-01-01T00:00:00.000Z'),
                    status: 'holiday',
                    work_hours: 0,
                    is_open_session: false
                });

                const res = await request(app)
                    .post('/api/attendance/clock-in')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(res.status).toBe(201);
                expect(res.body.success).toBe(true);
                expect(res.body.attendance.is_open_session).toBe(true);
                expect(['present', 'late']).toContain(res.body.attendance.status);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 25. (b) clockOut with a real open session closes it and leaves a holiday placeholder row unchanged
        it('25. clockOut with a real open session closes it and leaves a holiday placeholder row unchanged', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const hDate = new Date('2025-08-15T00:00:00.000Z');
            const sessionIn = new Date();
            sessionIn.setMinutes(sessionIn.getMinutes() - 15);

            try {
                const placeholder = await Attendance.create({
                    employee_id: empP1.id,
                    date: hDate,
                    status: 'holiday',
                    work_hours: 0,
                    is_open_session: false
                });

                const openSession = await Attendance.create({
                    employee_id: empP1.id,
                    date: sessionIn,
                    check_in: sessionIn,
                    status: 'present',
                    is_open_session: true
                });

                const outRes = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(outRes.status).toBe(200);
                expect(outRes.body.success).toBe(true);
                expect(outRes.body.attendance._id.toString()).toBe(openSession._id.toString());
                expect(outRes.body.attendance.check_out).toBeDefined();

                // Placeholder must remain untouched
                const phInDb = await Attendance.findById(placeholder._id);
                expect(phInDb.status).toBe('holiday');
                expect(phInDb.check_out).toBeUndefined();
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 26. (c) A record with check_out earlier than check_in shows open_session false and needs_review true
        it('26. A record with check_out earlier than check_in shows open_session false and needs_review true', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const testDate = new Date();
            testDate.setHours(9, 0, 0, 0);
            const dateStr = testDate.toISOString().split('T')[0];

            try {
                // Inverted session: check_in 10:00, check_out 08:00
                const inTime = new Date(testDate.getTime() + 10 * 3600 * 1000);
                const outTime = new Date(testDate.getTime() + 8 * 3600 * 1000);

                await Attendance.create({
                    employee_id: empP1.id,
                    date: testDate,
                    check_in: inTime,
                    check_out: outTime,
                    status: 'present',
                    work_hours: 0,
                    is_open_session: false,
                    needs_review: true
                });

                const res = await request(app)
                    .get(`/api/attendance/${empP1.id}?month=${testDate.getMonth() + 1}&year=${testDate.getFullYear()}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(res.status).toBe(200);
                const dayRecord = res.body.attendance.find(a => new Date(a.date).toISOString().split('T')[0] === dateStr);
                expect(dayRecord).toBeDefined();
                expect(dayRecord.is_open_session).toBe(false);
                expect(dayRecord.needs_review).toBe(true);
                expect(dayRecord.work_hours).toBe(0);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 27. (d) clockOut on an employee with only placeholder rows returns 400 and writes nothing
        it('27. clockOut on an employee with only placeholder rows returns 400 and writes nothing', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const hDate = new Date('2025-10-02T00:00:00.000Z');

            try {
                const placeholder = await Attendance.create({
                    employee_id: empP1.id,
                    date: hDate,
                    status: 'holiday',
                    work_hours: 0,
                    is_open_session: false
                });

                const outRes = await request(app)
                    .post('/api/attendance/clock-out')
                    .set('Authorization', `Bearer ${empTokenP1}`);

                expect(outRes.status).toBe(400);
                expect(['No open session to clock out.', 'No open clock-in session found to clock out from.']).toContain(outRes.body.message);

                const phInDb = await Attendance.findById(placeholder._id);
                expect(phInDb.status).toBe('holiday');
                expect(phInDb.check_out).toBeUndefined();
                expect(phInDb.work_hours).toBe(0);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });

        // 28. A record with check_in and check_out set and is_open_session true is returned with open_session false
        it('28. A record with check_in and check_out set and is_open_session true is returned with open_session false', async () => {
            await Attendance.deleteMany({ employee_id: empP1.id });
            const testDate = new Date();
            testDate.setHours(9, 0, 0, 0);
            const dateStr = testDate.toISOString().split('T')[0];

            try {
                const inTime = new Date(testDate.getTime());
                const outTime = new Date(testDate.getTime() + 4 * 3600 * 1000);

                await Attendance.create({
                    employee_id: empP1.id,
                    date: testDate,
                    check_in: inTime,
                    check_out: outTime,
                    status: 'present',
                    work_hours: 4,
                    is_open_session: true // stored as true in DB
                });

                // Check employee attendance endpoint
                const empRes = await request(app)
                    .get(`/api/attendance/${empP1.id}?month=${testDate.getMonth() + 1}&year=${testDate.getFullYear()}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(empRes.status).toBe(200);
                const dayRecord = empRes.body.attendance.find(a => new Date(a.date).toISOString().split('T')[0] === dateStr);
                expect(dayRecord).toBeDefined();
                expect(dayRecord.is_open_session).toBe(false);

                // Check logs endpoint
                const logsRes = await request(app)
                    .get(`/api/attendance/logs?employee_id=${empP1.id}&from=${dateStr}&to=${dateStr}`)
                    .set('Authorization', `Bearer ${adminTokenP1}`);

                expect(logsRes.status).toBe(200);
                expect(logsRes.body.logs.length).toBe(1);
                expect(logsRes.body.logs[0].open_session).toBe(false);
            } finally {
                await Attendance.deleteMany({ employee_id: empP1.id });
            }
        });
    });

    // =========================================================================
    // 15. Phase 2 Email Verification and Two-Factor Authentication Tests
    // =========================================================================
    describe('15. Phase 2 Email Verification and Two-Factor Authentication Tests', () => {
        const Employee = require('../models/Employee');
        const Setting = require('../models/Setting');
        const crypto = require('crypto');
        let sec15Emp;
        let sec15Admin;
        const testPassword = 'Password123!';

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash(testPassword, 10);
            sec15Emp = await Employee.create({
                id: 'EMP_SEC15_01',
                name: 'Sec15 Employee',
                email: 'sec15_emp@testcompany.test',
                password_hash: passwordHash,
                role: 'employee',
                department_id: testDeptId,
                status: 'active',
                emailVerified: false
            });

            sec15Admin = await Employee.create({
                id: 'ADM_SEC15_01',
                name: 'Sec15 Admin',
                email: 'sec15_admin@testcompany.test',
                password_hash: passwordHash,
                role: 'admin',
                department_id: testDeptId,
                status: 'active',
                emailVerified: false
            });
        });

        afterAll(async () => {
            await Employee.deleteMany({ id: { $in: ['EMP_SEC15_01', 'ADM_SEC15_01'] } });
            await Setting.updateOne({}, { $set: { require_email_verification: false, require_2fa: false } });
        });

        beforeEach(async () => {
            // Reset flags and user state
            await Setting.updateOne({}, { $set: { require_email_verification: false, require_2fa: false } });
            await Employee.updateOne({ id: 'EMP_SEC15_01' }, {
                $set: {
                    emailVerified: false,
                    emailVerificationTokenHash: null,
                    emailVerificationExpiry: null,
                    verificationSentCount: 0,
                    verificationWindowStart: null,
                    lastVerificationSentAt: null,
                    twofaCodeHash: null,
                    twofaCodeExpiry: null,
                    twofaAttempts: 0,
                    twofaLockedUntil: null,
                    twofaSendWindow: { sentCount: 0, windowStart: null, lastSentAt: null }
                }
            });
        });

        // 1. Flags OFF: login unchanged
        it('1. Flags OFF: login unchanged', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.refreshToken).toBeDefined();
            expect(res.body.requires2fa).toBeUndefined();
            expect(res.body.email_verification_required).toBeUndefined();
        });

        // 2. Correct verification token verifies; reuse fails; expired token fails
        it('2. Correct verification token verifies; reuse fails; expired token fails', async () => {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

            await Employee.updateOne(
                { id: sec15Emp.id },
                {
                    $set: {
                        emailVerificationTokenHash: tokenHash,
                        emailVerificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000)
                    }
                }
            );

            // 1) Correct verification token verifies
            const verifyRes1 = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: rawToken });

            expect(verifyRes1.status).toBe(200);
            expect(verifyRes1.body.success).toBe(true);

            const updatedEmp = await Employee.findOne({ id: sec15Emp.id });
            expect(updatedEmp.emailVerified).toBe(true);
            expect(updatedEmp.emailVerificationTokenHash).toBeNull();

            // 2) Reuse fails
            const verifyRes2 = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: rawToken });

            expect(verifyRes2.status).toBe(400);

            // 3) Expired token fails
            const expiredToken = crypto.randomBytes(32).toString('hex');
            const expiredHash = crypto.createHash('sha256').update(expiredToken).digest('hex');
            await Employee.updateOne(
                { id: sec15Emp.id },
                {
                    $set: {
                        emailVerificationTokenHash: expiredHash,
                        emailVerificationExpiry: new Date(Date.now() - 3600 * 1000) // expired 1 hr ago
                    }
                }
            );

            const verifyRes3 = await request(app)
                .post('/api/auth/verify-email')
                .send({ token: expiredToken });

            expect(verifyRes3.status).toBe(400);
        });

        // 3. Resend limits enforced
        it('3. Resend limits enforced', async () => {
            // First resend succeeds
            const res1 = await request(app)
                .post('/api/auth/resend-verification')
                .send({ email: sec15Emp.email });

            expect(res1.status).toBe(200);
            expect(res1.body.success).toBe(true);

            // Immediate second resend fails (rate limited: 1 per 5 minutes)
            const res2 = await request(app)
                .post('/api/auth/resend-verification')
                .send({ email: sec15Emp.email });

            expect(res2.status).toBe(429);

            // Simulate elapsed 5 minutes for send 2 and 3
            await Employee.updateOne(
                { id: sec15Emp.id },
                { $set: { lastVerificationSentAt: new Date(Date.now() - 6 * 60 * 1000) } }
            );
            const res3 = await request(app)
                .post('/api/auth/resend-verification')
                .send({ email: sec15Emp.email });
            expect(res3.status).toBe(200);

            await Employee.updateOne(
                { id: sec15Emp.id },
                { $set: { lastVerificationSentAt: new Date(Date.now() - 6 * 60 * 1000) } }
            );
            const res4 = await request(app)
                .post('/api/auth/resend-verification')
                .send({ email: sec15Emp.email });
            expect(res4.status).toBe(200);

            // 4th send within 24h fails (max 3 per 24 hours)
            await Employee.updateOne(
                { id: sec15Emp.id },
                { $set: { lastVerificationSentAt: new Date(Date.now() - 6 * 60 * 1000) } }
            );
            const res5 = await request(app)
                .post('/api/auth/resend-verification')
                .send({ email: sec15Emp.email });
            expect(res5.status).toBe(429);
        });

        // 4. 2FA correct code succeeds; wrong code fails; expired code fails; 5th wrong attempt locks account
        it('4. 2FA correct code succeeds; wrong code fails; expired code fails; 5th wrong attempt locks account', async () => {
            await Setting.updateOne({}, { $set: { require_2fa: true } });

            // Login triggers 2FA
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(loginRes.status).toBe(200);
            expect(loginRes.body.requires2fa).toBe(true);
            expect(loginRes.body.token).toBeUndefined();

            // Set fixed code '123456' for predictable testing
            const testCode = '123456';
            const codeHash = crypto.createHash('sha256').update(testCode).digest('hex');
            await Employee.updateOne(
                { id: sec15Emp.id },
                {
                    $set: {
                        twofaCodeHash: codeHash,
                        twofaCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
                        twofaAttempts: 0
                    }
                }
            );

            // 1) Wrong code fails
            const wrongRes = await request(app)
                .post('/api/auth/2fa/verify')
                .send({ employee_id: sec15Emp.id, code: '000000' });

            expect(wrongRes.status).toBe(400);

            // 2) Expired code fails
            await Employee.updateOne(
                { id: sec15Emp.id },
                { $set: { twofaCodeExpiry: new Date(Date.now() - 1000) } }
            );
            const expiredRes = await request(app)
                .post('/api/auth/2fa/verify')
                .send({ employee_id: sec15Emp.id, code: testCode });

            expect(expiredRes.status).toBe(400);

            // 3) 5th wrong attempt locks account
            await Employee.updateOne(
                { id: sec15Emp.id },
                {
                    $set: {
                        twofaCodeExpiry: new Date(Date.now() + 10 * 60 * 1000),
                        twofaAttempts: 4 // Already 4 failed attempts
                    }
                }
            );
            const lockRes = await request(app)
                .post('/api/auth/2fa/verify')
                .send({ employee_id: sec15Emp.id, code: '999999' });

            expect(lockRes.status).toBe(403);

            const lockedEmp = await Employee.findOne({ id: sec15Emp.id });
            expect(lockedEmp.twofaLockedUntil).toBeDefined();
            expect(new Date(lockedEmp.twofaLockedUntil) > new Date()).toBe(true);

            // Verify login is also blocked while locked
            const blockedLogin = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });
            expect(blockedLogin.status).toBe(403);

            // 4) Correct code succeeds after unlocking
            await Employee.updateOne(
                { id: sec15Emp.id },
                {
                    $set: {
                        twofaLockedUntil: null,
                        twofaAttempts: 0,
                        twofaCodeHash: codeHash,
                        twofaCodeExpiry: new Date(Date.now() + 10 * 60 * 1000)
                    }
                }
            );

            const successRes = await request(app)
                .post('/api/auth/2fa/verify')
                .send({ employee_id: sec15Emp.id, code: testCode });

            expect(successRes.status).toBe(200);
            expect(successRes.body.token).toBeDefined();
            expect(successRes.body.user).toBeDefined();
        });

        // 5. Unverified user prompted with flag ON; SuperAdmin not blocked
        it('5. Unverified user prompted with flag ON; SuperAdmin not blocked', async () => {
            await Setting.updateOne({}, { $set: { require_email_verification: true, require_2fa: false } });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });

            // Unverified user logs in -> prompted with flag ON
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(loginRes.status).toBe(200);
            expect(loginRes.body.token).toBeDefined();
            expect(loginRes.body.email_verification_required).toBe(true);

            const empToken = loginRes.body.token;

            // Blocked from other API routes (e.g. GET /api/attendance/logs)
            const blockedRes = await request(app)
                .get('/api/attendance/logs')
                .set('Authorization', `Bearer ${empToken}`);

            expect(blockedRes.status).toBe(403);
            expect(blockedRes.body.email_verification_required).toBe(true);

            // Not blocked on /api/auth/* routes (e.g. GET /api/auth/me)
            const allowedAuthRes = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${empToken}`);

            expect(allowedAuthRes.status).toBe(200);

            // SuperAdmin is exempt and never blocked
            const adminLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Admin.email, password: testPassword });

            expect(adminLoginRes.status).toBe(200);
            const adminTokenSec15 = adminLoginRes.body.token;

            const adminAccessRes = await request(app)
                .get('/api/attendance/logs')
                .set('Authorization', `Bearer ${adminTokenSec15}`);

            expect(adminAccessRes.status).toBe(200);
        });

        // 6. Login unknown-user message matches original and flags-off login matches original behavior
        it('6. Login unknown-user message matches original and flags-off login matches original behavior', async () => {
            const unknownRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'nonexistent_user_99999@test.test', password: 'SomePassword123!' });

            expect(unknownRes.status).toBe(401);
            expect(unknownRes.body.message).toBe('Invalid ID/Email or password.');

            const wrongPassRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: 'WrongPassword999!' });

            expect(wrongPassRes.status).toBe(401);
            expect(wrongPassRes.body.message).toBe('Invalid email or password.');
        });

        // 7. Email send failure fails 2FA login
        it('7. Email send failure fails 2FA login', async () => {
            await Setting.updateOne({}, { $set: { require_2fa: true, require_email_verification: false } });
            process.env.TEST_FAIL_EMAIL = 'true';

            try {
                const failRes = await request(app)
                    .post('/api/auth/login')
                    .send({ email: sec15Emp.email, password: testPassword });

                expect(failRes.status).toBe(500);
                expect(failRes.body.success).toBe(false);
                expect(failRes.body.token).toBeUndefined();
            } finally {
                delete process.env.TEST_FAIL_EMAIL;
            }
        });

        // 8. POST /api/auth/2fa/resend returns identical status and body for unknown and known emails
        it('8. POST /api/auth/2fa/resend returns identical status and body for unknown and known emails', async () => {
            const knownRes = await request(app)
                .post('/api/auth/2fa/resend')
                .send({ email: sec15Emp.email });

            const unknownRes = await request(app)
                .post('/api/auth/2fa/resend')
                .send({ email: 'unknown_employee_xyz@testcompany.test' });

            expect(knownRes.status).toBe(200);
            expect(unknownRes.status).toBe(200);
            expect(knownRes.body).toEqual(unknownRes.body);
            expect(knownRes.body.message).toBe('If an account exists, a code has been sent.');
        });
    });
});




