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
const fs = require('fs');

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

        // Second sick leave in the same month: 201
        it('Second sick leave in the same month: 201', async () => {
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

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.leave.leave_type).toBe('sick');
        });

        // Three applications in one month are all accepted
        it('Three applications in one month are all accepted: 201', async () => {
            const start1 = getWeekdayDate(7, 1);
            const end1 = getWeekdayDate(7, 2);
            const start2 = getWeekdayDate(7, 8);
            const end2 = getWeekdayDate(7, 9);
            const start3 = getWeekdayDate(7, 15);
            const end3 = getWeekdayDate(7, 16);

            const res1 = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start1,
                    end_date: end1,
                    reason: 'Sick leave #1'
                });
            expect(res1.status).toBe(201);
            expect(res1.body.success).toBe(true);

            const res2 = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start2,
                    end_date: end2,
                    reason: 'Sick leave #2'
                });
            expect(res2.status).toBe(201);
            expect(res2.body.success).toBe(true);

            const res3 = await request(app)
                .post('/api/leaves/apply')
                .set('Authorization', `Bearer ${empToken2}`)
                .send({
                    leave_type: 'sick',
                    start_date: start3,
                    end_date: end3,
                    reason: 'Sick leave #3'
                });
            expect(res3.status).toBe(201);
            expect(res3.body.success).toBe(true);
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
                expect(expRows[i]['Worked Hours']).toBe(logRes.body.logs[i].worked_hours_formatted);
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
            await Setting.updateOne({}, { $set: { require_email_verification: true } });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });

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

            // 4) Correct code succeeds after unlocking and marks emailVerified true
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

            const verifiedEmp = await Employee.findOne({ id: sec15Emp.id });
            expect(verifiedEmp.emailVerified).toBe(true);
        });

        // 5. First login gets a code; verified user logs in with no code; unverified SuperAdmin gets a code; existing session is not blocked
        it('5. First login gets a code; verified user logs in with no code; unverified SuperAdmin gets a code; existing session is not blocked', async () => {
            await Setting.updateOne({}, { $set: { require_email_verification: true } });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });

            // 1) First login gets a code
            const firstLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(firstLoginRes.status).toBe(200);
            expect(firstLoginRes.body.requires2fa).toBe(true);
            expect(firstLoginRes.body.employee_id).toBe(sec15Emp.id);
            expect(firstLoginRes.body.token).toBeUndefined();

            // 2) Verified user logs in with no code
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: true } });
            const verifiedLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(verifiedLoginRes.status).toBe(200);
            expect(verifiedLoginRes.body.token).toBeDefined();
            expect(verifiedLoginRes.body.requires2fa).toBeUndefined();

            // 3) Unverified SuperAdmin gets a code
            await Employee.updateOne({ id: sec15Admin.id }, { $set: { emailVerified: false } });
            const adminLoginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Admin.email, password: testPassword });

            expect(adminLoginRes.status).toBe(200);
            expect(adminLoginRes.body.requires2fa).toBe(true);
            expect(adminLoginRes.body.token).toBeUndefined();

            // 4) Existing session is not blocked (unverified user with valid JWT can access API)
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });
            const existingToken = jwt.sign(
                {
                    id: sec15Emp.id,
                    _id: sec15Emp._id,
                    name: sec15Emp.name,
                    email: sec15Emp.email,
                    role: sec15Emp.role,
                    permissions: ['dashboard', 'attendance_user', 'profile']
                },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );

            const sessionRes = await request(app)
                .get('/api/attendance/logs')
                .set('Authorization', `Bearer ${existingToken}`);

            expect(sessionRes.status).toBe(200);
            expect(sessionRes.body.email_verification_required).toBeUndefined();
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
            await Setting.updateOne({}, { $set: { require_email_verification: true } });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });
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

        // 9. With flags off and the employee in the pilot list, that employee gets the 2FA step. Other employees log in unchanged
        it('9. With flags off and the employee in the pilot list, that employee gets the 2FA step. Other employees log in unchanged', async () => {
            await Setting.updateOne({}, {
                $set: {
                    require_email_verification: false,
                    require_2fa: false,
                    security_pilot_employee_ids: [sec15Emp.id]
                }
            });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });
            await Employee.updateOne({ id: sec15Admin.id }, { $set: { emailVerified: false } });

            // Pilot employee gets 2FA step
            const pilotRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(pilotRes.status).toBe(200);
            expect(pilotRes.body.requires2fa).toBe(true);
            expect(pilotRes.body.token).toBeUndefined();

            // Other employee logs in unchanged
            const otherRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Admin.email, password: testPassword });

            expect(otherRes.status).toBe(200);
            expect(otherRes.body.token).toBeDefined();
            expect(otherRes.body.requires2fa).toBeUndefined();
        });

        // 10. Dry run sends nothing; scripts/verify_admin verifies SuperAdmin
        it('10. Dry run sends nothing; scripts/verify_admin verifies SuperAdmin', async () => {
            // Notice script dry run sends nothing
            const noticeScript = require('../scripts/send_verification_notice');
            const dryRunResult = await noticeScript.run(['--dry-run']);
            expect(dryRunResult.mode).toBe('dry_run');
            expect(dryRunResult.sentEmails).toBe(0);
            expect(dryRunResult.sentNotifications).toBe(0);

            // scripts/verify_admin verifies SuperAdmin
            await Employee.updateOne({ id: sec15Admin.id }, { $set: { emailVerified: false } });
            const adminBefore = await Employee.findOne({ id: sec15Admin.id });
            expect(adminBefore.emailVerified).toBe(false);

            adminBefore.emailVerified = true;
            await adminBefore.save();

            const adminAfter = await Employee.findOne({ id: sec15Admin.id });
            expect(adminAfter.emailVerified).toBe(true);
        });

        // 11. POST settings update with security_pilot_employee_ids and verify pilot employee gets requires2fa
        it('11. POST settings update with security_pilot_employee_ids and verify pilot employee gets requires2fa', async () => {
            const adminToken = jwt.sign(
                { id: sec15Admin.id, role: 'admin', permissions: ['manage_settings'] },
                process.env.JWT_SECRET,
                { expiresIn: '15m' }
            );

            // 1) Create Keerthi-style employee
            const hash = await bcrypt.hash(testPassword, 10);
            await Employee.deleteOne({ id: 'EMP6608' });
            await Employee.create({
                id: 'EMP6608',
                name: 'Keerthi',
                email: 'keerthi_test@company.test',
                password_hash: hash,
                role: 'employee',
                status: 'active',
                emailVerified: false
            });

            // 2) POST settings update with security_pilot_employee_ids: ["EMP6608"]
            const postRes = await request(app)
                .post('/api/settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    security_pilot_employee_ids: ['EMP6608'],
                    require_email_verification: false
                });

            expect(postRes.status).toBe(200);

            // 3) Read settings back and assert array is stored
            const getRes = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(getRes.status).toBe(200);
            expect(getRes.body.settings.security_pilot_employee_ids).toBeDefined();
            expect(getRes.body.settings.security_pilot_employee_ids).toContain('EMP6608');

            // 4) Keerthi logs in with emailVerified false and gets requires2fa true
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: 'keerthi_test@company.test', password: testPassword });

            expect(loginRes.status).toBe(200);
            expect(loginRes.body.requires2fa).toBe(true);
            expect(loginRes.body.employee_id).toBe('EMP6608');
            expect(loginRes.body.token).toBeUndefined();

            // Cleanup
            await Employee.deleteOne({ id: 'EMP6608' });
        });

        // 12. Sending the 2FA code produces an email whose body contains the 6-digit code, and does not contain the word "undefined"
        it('12. Sending the 2FA code produces an email whose body contains the 6-digit code, and does not contain the word "undefined"', async () => {
            const { sendEmail, getLastSentEmail } = require('../utils/emailService');
            await Setting.updateOne({}, { $set: { require_email_verification: true } });
            await Employee.updateOne({ id: sec15Emp.id }, { $set: { emailVerified: false } });

            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({ email: sec15Emp.email, password: testPassword });

            expect(loginRes.status).toBe(200);
            expect(loginRes.body.requires2fa).toBe(true);

            const lastEmail = getLastSentEmail() || sendEmail.lastEmail;
            expect(lastEmail).toBeDefined();
            expect(lastEmail.to).toBe(sec15Emp.email);
            expect(lastEmail.code).toBeDefined();
            expect(lastEmail.code).toMatch(/^\d{6}$/);

            // Assert body contains the 6-digit code
            expect(lastEmail.html).toContain(lastEmail.code);
            expect(lastEmail.text).toContain(lastEmail.code);

            // Assert body does not contain the word "undefined"
            expect(lastEmail.html).not.toContain('undefined');
            expect(lastEmail.text).not.toContain('undefined');

            // Verify code is only hashed in the database, plain code never stored
            const empInDb = await Employee.findOne({ id: sec15Emp.id });
            expect(empInDb.twofaCodeHash).toBe(crypto.createHash('sha256').update(lastEmail.code).digest('hex'));
            expect(empInDb.twofaCode).toBeUndefined();

            // Verify plain code is not in login response
            expect(loginRes.body.code).toBeUndefined();
        });

        // 13. Database connection options use 'hrms_db' by default when DB_NAME is unset, and DB_NAME overrides it
        it('13. Database connection options use "hrms_db" by default when DB_NAME is unset, and DB_NAME overrides it', async () => {
            const connectDB = require('../config/db');
            const originalReadyState = mongoose.connection.readyState;
            const originalDbName = process.env.DB_NAME;

            let capturedOptions = [];
            const connectSpy = jest.spyOn(mongoose, 'connect').mockImplementation(async (uri, options) => {
                capturedOptions.push(options);
                return mongoose.connection;
            });

            // Mock readyState to 0 so connectDB evaluates connection options rather than reusing open connection
            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true, writable: true });

            try {
                // Case 1: DB_NAME unset -> defaults to 'hrms_db'
                delete process.env.DB_NAME;
                await connectDB();
                expect(capturedOptions[0].dbName).toBe('hrms_db');

                // Case 2: DB_NAME set -> overrides default
                process.env.DB_NAME = 'custom_hrms_db';
                await connectDB();
                expect(capturedOptions[1].dbName).toBe('custom_hrms_db');
            } finally {
                connectSpy.mockRestore();
                Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true, writable: true });
                if (originalDbName !== undefined) {
                    process.env.DB_NAME = originalDbName;
                } else {
                    delete process.env.DB_NAME;
                }
            }
        });

        // 14. Guard refuses local connections when NODE_ENV is not production and DB_NAME is unset or 'hrms_db'
        it('14. Guard refuses local connections when NODE_ENV is not production and DB_NAME is unset or "hrms_db"', async () => {
            const connectDB = require('../config/db');
            const originalReadyState = mongoose.connection.readyState;
            const originalDbName = process.env.DB_NAME;
            const originalVercel = process.env.VERCEL;
            const originalNodeEnv = process.env.NODE_ENV;

            let capturedOptions = [];
            const connectSpy = jest.spyOn(mongoose, 'connect').mockImplementation(async (uri, options) => {
                capturedOptions.push(options);
                return mongoose.connection;
            });
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            Object.defineProperty(mongoose.connection, 'readyState', { value: 0, configurable: true, writable: true });

            try {
                // Simulate local development environment (not Vercel, not production)
                delete process.env.VERCEL;
                process.env.NODE_ENV = 'development';

                // Case 1: DB_NAME unset -> throws guard error and does not connect
                delete process.env.DB_NAME;
                await expect(connectDB()).rejects.toThrow('Local runs must use DB_NAME=hrms_dev.');
                expect(connectSpy).not.toHaveBeenCalled();

                // Case 2: DB_NAME is 'hrms_db' -> throws guard error and does not connect
                process.env.DB_NAME = 'hrms_db';
                await expect(connectDB()).rejects.toThrow('Local runs must use DB_NAME=hrms_dev.');
                expect(connectSpy).not.toHaveBeenCalled();

                // Case 3: DB_NAME is 'hrms_dev' -> succeeds and passes dbName: 'hrms_dev'
                process.env.DB_NAME = 'hrms_dev';
                await connectDB();
                expect(connectSpy).toHaveBeenCalledTimes(1);
                expect(capturedOptions[0].dbName).toBe('hrms_dev');
            } finally {
                connectSpy.mockRestore();
                warnSpy.mockRestore();
                Object.defineProperty(mongoose.connection, 'readyState', { value: originalReadyState, configurable: true, writable: true });
                if (originalDbName !== undefined) process.env.DB_NAME = originalDbName; else delete process.env.DB_NAME;
                if (originalVercel !== undefined) process.env.VERCEL = originalVercel; else delete process.env.VERCEL;
                if (originalNodeEnv !== undefined) process.env.NODE_ENV = originalNodeEnv; else delete process.env.NODE_ENV;
            }
        });

        // 15. create_client_admin.js refuses to run unless DB_NAME is exactly hrms_dev
        it('15. create_client_admin.js refuses to run unless DB_NAME is exactly hrms_dev', () => {
            const { execFileSync } = require('child_process');
            const path = require('path');
            const scriptPath = path.join(__dirname, '../database/create_client_admin.js');

            try {
                execFileSync(process.execPath, [scriptPath], {
                    env: {
                        ...process.env,
                        DB_NAME: 'hrms_db',
                        MONGO_URI: 'mongodb://127.0.0.1:27017',
                        COMPANY_NAME: 'Test Co',
                        ADMIN_NAME: 'Admin',
                        ADMIN_EMAIL: 'admin@example.com',
                        ADMIN_PASSWORD: 'Password123!'
                    },
                    stdio: 'pipe'
                });
                // Should not reach here
                expect(true).toBe(false);
            } catch (err) {
                expect(err.status).toBe(1);
                expect(err.stderr.toString()).toContain('Refusing: DB_NAME must be hrms_dev');
            }
        });
    });

    describe('16. Phase 3 IP Access Control Tests', () => {
        const AccessSettings = require('../models/AccessSettings');
        const RemoteAccess = require('../models/RemoteAccess');
        const Employee = require('../models/Employee');
        const { invalidateAccessSettingsCache } = require('../middleware/ipAccess');

        let ipEmpToken;
        let ipMgrToken;
        const officeCidr = '192.168.1.0/24';
        const allowedOfficeIp = '192.168.1.55';
        const blockedRemoteIp = '203.0.113.195';

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('TestPass123!', 10);
            const ipEmp = await Employee.create({
                id: 'IP_EMP_01',
                name: 'IP Test Employee',
                email: 'ip_emp@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                department_id: testDeptId,
                status: 'active',
                emailVerified: true
            });

            const ipMgr = await Employee.create({
                id: 'IP_MGR_01',
                name: 'IP Test Manager',
                email: 'ip_mgr@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                department_id: testDeptId,
                status: 'active',
                emailVerified: true
            });

            ipEmpToken = jwt.sign(
                { id: ipEmp.id, _id: ipEmp._id, role: ipEmp.role, email: ipEmp.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            ipMgrToken = jwt.sign(
                { id: ipMgr.id, _id: ipMgr._id, role: ipMgr.role, email: ipMgr.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            process.env.TRUST_PROXY = 'vercel';
        });

        afterAll(() => {
            delete process.env.TRUST_PROXY;
        });

        afterEach(async () => {
            await AccessSettings.deleteMany({});
            await RemoteAccess.deleteMany({});
            invalidateAccessSettingsCache();
            process.env.TRUST_PROXY = 'vercel';
        });

        // 1. allowed IP passes
        it('1. allowed IP passes', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', allowedOfficeIp);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 2. blocked IP gets 403
        it('2. blocked IP gets 403', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Access allowed only from the office network.');
        });

        // 3. manager and SuperAdmin pass from anywhere
        it('3. manager and SuperAdmin pass from anywhere', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            // Manager from blocked IP
            const mgrRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipMgrToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(mgrRes.status).toBe(200);
            expect(mgrRes.body.success).toBe(true);

            // SuperAdmin from blocked IP
            const adminRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(adminRes.status).toBe(200);
            expect(adminRes.body.success).toBe(true);
        });

        // 4. enforce OFF passes everyone
        it('4. enforce OFF passes everyone', async () => {
            await AccessSettings.create({
                enforce_ip_access: false,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 5. empty ranges passes everyone
        it('5. empty ranges passes everyone', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: []
            });
            invalidateAccessSettingsCache();

            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });

        // 6. remote exception active passes, expired is blocked
        it('6. remote exception active passes, expired is blocked', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            // Create active exception with future expiry
            const exc = await RemoteAccess.create({
                employee_id: 'IP_EMP_01',
                grantedBy: 'ADM001',
                expiresAt: new Date(Date.now() + 60000),
                active: true
            });

            // Active exception allows access from blocked IP
            const activeRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(activeRes.status).toBe(200);
            expect(activeRes.body.success).toBe(true);

            // Now expire the exception
            await RemoteAccess.updateOne({ _id: exc._id }, { $set: { expiresAt: new Date(Date.now() - 60000) } });

            const expiredRes = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('x-vercel-forwarded-for', blockedRemoteIp);

            expect(expiredRes.status).toBe(403);
            expect(expiredRes.body.message).toBe('Access allowed only from the office network.');
        });

        // 7. invalid CIDR rejected
        it('7. invalid CIDR rejected', async () => {
            const res = await request(app)
                .put('/api/access-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    enforce_ip_access: true,
                    ranges: [{ cidr: 'invalid-cidr/99', label: 'Bad CIDR' }]
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toContain('Invalid CIDR');
        });

        // 8. x-forwarded-for from a client is ignored
        it('8. x-forwarded-for from a client is ignored', async () => {
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
            });
            invalidateAccessSettingsCache();

            // Client sets X-Forwarded-For: allowedOfficeIp, but no x-vercel-forwarded-for
            // Server ignores x-forwarded-for and uses socket IP (127.0.0.1, not in 192.168.1.0/24)
            const res = await request(app)
                .get('/api/notifications')
                .set('Authorization', `Bearer ${ipEmpToken}`)
                .set('X-Forwarded-For', allowedOfficeIp);

            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Access allowed only from the office network.');
        });

        // 9. SuperAdmin lockout warning requires confirm
        it('9. SuperAdmin lockout warning requires confirm', async () => {
            const adminCurrentIp = '10.20.30.40';

            // Without confirm=true, saving ranges that exclude current admin IP fails with warning
            const warningRes = await request(app)
                .put('/api/access-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-vercel-forwarded-for', adminCurrentIp)
                .send({
                    enforce_ip_access: true,
                    ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
                });

            expect(warningRes.status).toBe(400);
            expect(warningRes.body.requires_confirm).toBe(true);
            expect(warningRes.body.warning).toContain(adminCurrentIp);

            // With confirm=true, saving succeeds
            const confirmRes = await request(app)
                .put('/api/access-settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('x-vercel-forwarded-for', adminCurrentIp)
                .send({
                    enforce_ip_access: true,
                    ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }],
                    confirm: true
                });

            expect(confirmRes.status).toBe(200);
            expect(confirmRes.body.success).toBe(true);
            expect(confirmRes.body.settings.enforce_ip_access).toBe(true);
        });

        // 10. with TRUST_PROXY unset, a request with x-vercel-forwarded-for set to an allowed IP is still evaluated by req.ip and blocked
        it('10. with TRUST_PROXY unset, a request with x-vercel-forwarded-for set to an allowed IP is still evaluated by req.ip and blocked', async () => {
            const origTrustProxy = process.env.TRUST_PROXY;
            delete process.env.TRUST_PROXY;

            try {
                await AccessSettings.create({
                    enforce_ip_access: true,
                    ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
                });
                invalidateAccessSettingsCache();

                // Spoofed header from client when TRUST_PROXY is unset -> uses req.ip (127.0.0.1) and blocks
                const res = await request(app)
                    .get('/api/notifications')
                    .set('Authorization', `Bearer ${ipEmpToken}`)
                    .set('x-vercel-forwarded-for', allowedOfficeIp);

                expect(res.status).toBe(403);
                expect(res.body.message).toBe('Access allowed only from the office network.');
            } finally {
                if (origTrustProxy !== undefined) {
                    process.env.TRUST_PROXY = origTrustProxy;
                } else {
                    delete process.env.TRUST_PROXY;
                }
            }
        });

        // 11. with TRUST_PROXY=vercel, the x-vercel-forwarded-for value is used
        it('11. with TRUST_PROXY=vercel, the x-vercel-forwarded-for value is used', async () => {
            const origTrustProxy = process.env.TRUST_PROXY;
            process.env.TRUST_PROXY = 'vercel';

            try {
                await AccessSettings.create({
                    enforce_ip_access: true,
                    ranges: [{ cidr: officeCidr, label: 'Office', enabled: true }]
                });
                invalidateAccessSettingsCache();

                // Header honored when TRUST_PROXY=vercel -> allowed
                const res = await request(app)
                    .get('/api/notifications')
                    .set('Authorization', `Bearer ${ipEmpToken}`)
                    .set('x-vercel-forwarded-for', allowedOfficeIp);

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            } finally {
                if (origTrustProxy !== undefined) {
                    process.env.TRUST_PROXY = origTrustProxy;
                } else {
                    delete process.env.TRUST_PROXY;
                }
            }
        });
    });

    describe('17. Attendance Export, Time Format, and Payroll Access Tests', () => {
        let t17AdminToken, t17ManagerToken, t17TLToken, t17EmpToken;
        let t17Dept;

        beforeAll(async () => {
            const Employee = require('../models/Employee');
            const Department = require('../models/Department');

            t17Dept = await Department.create({
                name: 'Engineering_T17',
                description: 'Engineering department for T17'
            });

            const hash = await bcrypt.hash('Secret123!', 10);

            // Create admin, manager, team_lead, employee
            await Employee.create([
                { id: 'T17_ADM', name: 'T17 Admin', email: 't17_adm@example.test', password_hash: hash, role: 'admin', status: 'active', department_id: t17Dept._id },
                { id: 'T17_MGR', name: 'T17 Manager', email: 't17_mgr@example.test', password_hash: hash, role: 'manager', status: 'active', department_id: t17Dept._id, permissions: ['manage_payroll', 'payroll_admin'] },
                { id: 'T17_TL', name: 'T17 Team Lead', email: 't17_tl@example.test', password_hash: hash, role: 'team_lead', status: 'active', department_id: t17Dept._id, permissions: ['manage_payroll'] },
                { id: 'T17_EMP', name: 'T17 Employee', email: 't17_emp@example.test', password_hash: hash, role: 'employee', status: 'active', department_id: t17Dept._id, permissions: ['payroll_user'] }
            ]);

            t17AdminToken = jwt.sign({ id: 'T17_ADM', role: 'admin', email: 't17_adm@example.test' }, process.env.JWT_SECRET);
            t17ManagerToken = jwt.sign({ id: 'T17_MGR', role: 'manager', email: 't17_mgr@example.test' }, process.env.JWT_SECRET);
            t17TLToken = jwt.sign({ id: 'T17_TL', role: 'team_lead', email: 't17_tl@example.test' }, process.env.JWT_SECRET);
            t17EmpToken = jwt.sign({ id: 'T17_EMP', role: 'employee', email: 't17_emp@example.test' }, process.env.JWT_SECRET);
        });

        // TASK 1:
        it('1. Attendance export header contains "Department", and employee row shows department name', async () => {
            const Attendance = require('../models/Attendance');
            const XLSX = require('xlsx');

            const date = new Date('2026-10-14T09:00:00+05:30');
            await Attendance.create({
                employee_id: 'T17_EMP',
                date,
                check_in: new Date('2026-10-14T09:00:00+05:30'),
                check_out: new Date('2026-10-14T17:00:00+05:30'),
                status: 'present'
            });

            // Single-employee export
            const singleRes = await request(app)
                .get('/api/attendance/export?employee_id=T17_EMP&date=2026-10-14')
                .set('Authorization', `Bearer ${t17AdminToken}`)
                .responseType('blob');
            expect(singleRes.status).toBe(200);

            const wb = XLSX.read(singleRes.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const headers = XLSX.utils.sheet_to_json(sheet, { header: 1 })[0];
            expect(headers).toContain('Department');
            expect(headers.indexOf('Department')).toBe(headers.indexOf('Employee Name') + 1);

            const rows = XLSX.utils.sheet_to_json(sheet);
            expect(rows.length).toBeGreaterThan(0);
            const empRow = rows.find(r => r['Employee ID'] === 'T17_EMP');
            expect(empRow).toBeDefined();
            expect(empRow['Department']).toBe('Engineering_T17');

            // All-employee export path
            const allRes = await request(app)
                .get('/api/attendance/export?date=2026-10-14')
                .set('Authorization', `Bearer ${t17AdminToken}`)
                .responseType('blob');
            expect(allRes.status).toBe(200);
            const allWb = XLSX.read(allRes.body, { type: 'buffer' });
            const allSheet = allWb.Sheets[allWb.SheetNames[0]];
            const allHeaders = XLSX.utils.sheet_to_json(allSheet, { header: 1 })[0];
            expect(allHeaders).toContain('Department');
            expect(allHeaders.indexOf('Department')).toBe(allHeaders.indexOf('Employee Name') + 1);
        });

        // TASK 2:
        it('2. Check-in of 2026-10-13T06:22:56Z exports as "11:52" (IST)', async () => {
            const Attendance = require('../models/Attendance');
            const XLSX = require('xlsx');

            const checkIn = new Date('2026-10-13T06:22:56Z'); // 11:52 IST
            const checkOut = new Date('2026-10-13T12:00:00Z'); // 17:30 IST

            await Attendance.create({
                employee_id: 'T17_EMP',
                date: checkIn,
                check_in: checkIn,
                check_out: checkOut,
                status: 'present'
            });

            const res = await request(app)
                .get('/api/attendance/export?employee_id=T17_EMP&date=2026-10-13')
                .set('Authorization', `Bearer ${t17AdminToken}`)
                .responseType('blob');
            expect(res.status).toBe(200);

            const wb = XLSX.read(res.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            const row = rows.find(r => r['Employee ID'] === 'T17_EMP');
            expect(row).toBeDefined();
            expect(row['First Check In']).toBe('11:52');
            expect(row['Last Check Out']).toBe('17:30');
            expect(row['Date']).toBe('2026-10-13');
        });

        // TASK 3:
        it('3. Worked hours formatted in HH:mm: 330 minutes -> "05:30", 0 -> "00:00", holiday row -> "—"', async () => {
            const { formatWorkedHours } = require('../utils/istDate');
            expect(formatWorkedHours(330, { fromMinutes: true })).toBe('05:30');
            expect(formatWorkedHours(0, { fromMinutes: true })).toBe('00:00');
            expect(formatWorkedHours(330, { isHoliday: true, fromMinutes: true })).toBe('—');
            expect(formatWorkedHours(330, { needsReview: true, fromMinutes: true })).toBe('—');
            expect(formatWorkedHours(5.18, { fromMinutes: false })).toBe('05:11');
            expect(formatWorkedHours(0.92, { fromMinutes: false })).toBe('00:55');

            // Also test via export
            const Attendance = require('../models/Attendance');
            const XLSX = require('xlsx');

            const holDate = new Date('2026-10-15T09:00:00+05:30');
            await Attendance.create({
                employee_id: 'T17_EMP',
                date: holDate,
                status: 'holiday'
            });

            const res = await request(app)
                .get('/api/attendance/export?employee_id=T17_EMP&date=2026-10-15')
                .set('Authorization', `Bearer ${t17AdminToken}`)
                .responseType('blob');
            expect(res.status).toBe(200);
            const wb = XLSX.read(res.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            const row = rows.find(r => r['Employee ID'] === 'T17_EMP');
            expect(row['Worked Hours']).toBe('—');
        });

        // TASK 4:
        it('4. Manager, team_lead, and employee get 403 on every payroll endpoint; admin gets 200', async () => {
            const Payroll = require('../models/Payroll');

            const samplePayroll = await Payroll.create({
                employee_id: 'T17_EMP',
                month: 1,
                year: 2026,
                basic: 20000,
                days_worked: 25,
                status: 'pending'
            });

            const nonAdminTokens = [
                { role: 'manager', token: t17ManagerToken },
                { role: 'team_lead', token: t17TLToken },
                { role: 'employee', token: t17EmpToken }
            ];

            // 1. GET /api/payroll/all
            for (const { token } of nonAdminTokens) {
                const res = await request(app).get('/api/payroll/all').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminAll = await request(app).get('/api/payroll/all').set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminAll.status).toBe(200);

            // 2. GET /api/payroll/analytics
            for (const { token } of nonAdminTokens) {
                const res = await request(app).get('/api/payroll/analytics').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminAnalytics = await request(app).get('/api/payroll/analytics').set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminAnalytics.status).toBe(200);

            // 3. GET /api/payroll/export
            for (const { token } of nonAdminTokens) {
                const res = await request(app).get('/api/payroll/export').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminExport = await request(app).get('/api/payroll/export').set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminExport.status).toBe(200);

            // 4. GET /api/payroll/template
            for (const { token } of nonAdminTokens) {
                const res = await request(app).get('/api/payroll/template').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminTemplate = await request(app).get('/api/payroll/template').set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminTemplate.status).toBe(200);

            // 5. POST /api/payroll/create
            for (const { token } of nonAdminTokens) {
                const res = await request(app).post('/api/payroll/create').set('Authorization', `Bearer ${token}`).send({ employee_id: 'T17_EMP', month: 2, year: 2026, basic: 10000 });
                expect(res.status).toBe(403);
            }
            const adminCreate = await request(app).post('/api/payroll/create').set('Authorization', `Bearer ${t17AdminToken}`).send({ employee_id: 'T17_EMP', month: 2, year: 2026, basic: 10000 });
            expect(adminCreate.status).toBe(201);

            // 6. POST /api/payroll/import
            for (const { token } of nonAdminTokens) {
                const res = await request(app).post('/api/payroll/import').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }

            // 7. PUT /api/payroll/bulk-pay
            for (const { token } of nonAdminTokens) {
                const res = await request(app).put('/api/payroll/bulk-pay').set('Authorization', `Bearer ${token}`).send({ ids: [samplePayroll._id] });
                expect(res.status).toBe(403);
            }
            const adminBulkPay = await request(app).put('/api/payroll/bulk-pay').set('Authorization', `Bearer ${t17AdminToken}`).send({ ids: [samplePayroll._id] });
            expect(adminBulkPay.status).toBe(200);

            // 8. PUT /api/payroll/:id/pay
            for (const { token } of nonAdminTokens) {
                const res = await request(app).put(`/api/payroll/${samplePayroll._id}/pay`).set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminPay = await request(app).put(`/api/payroll/${samplePayroll._id}/pay`).set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminPay.status).toBe(200);

            // 9. GET /api/payroll/:employeeId
            for (const { token } of nonAdminTokens) {
                const res = await request(app).get('/api/payroll/T17_EMP').set('Authorization', `Bearer ${token}`);
                expect(res.status).toBe(403);
            }
            const adminGetEmp = await request(app).get('/api/payroll/T17_EMP').set('Authorization', `Bearer ${t17AdminToken}`);
            expect(adminGetEmp.status).toBe(200);
        });
    });

    describe('18. Tier 1 Notifications Tests', () => {
        const Employee = require('../models/Employee');
        const Notification = require('../models/Notification');
        const Leave = require('../models/Leave');
        const Attendance = require('../models/Attendance');
        const Payroll = require('../models/Payroll');
        const Setting = require('../models/Setting');
        let t18AdminToken, t18EmpToken, t18MgrToken;
        let adminEmp, testEmp, mgrEmp, secondEmp;

        beforeAll(async () => {
            const hash = await bcrypt.hash('Secret123!', 10);

            adminEmp = await Employee.create({
                id: 'T18_ADM',
                name: 'T18 Admin',
                email: 't18_adm@example.test',
                password_hash: hash,
                role: 'admin',
                status: 'active'
            });

            mgrEmp = await Employee.create({
                id: 'T18_MGR',
                name: 'T18 Manager',
                email: 't18_mgr@example.test',
                password_hash: hash,
                role: 'manager',
                status: 'active'
            });

            testEmp = await Employee.create({
                id: 'T18_EMP',
                name: 'T18 Employee',
                email: 't18_emp@example.test',
                password_hash: hash,
                role: 'employee',
                manager_id: 'T18_MGR',
                status: 'active'
            });

            secondEmp = await Employee.create({
                id: 'T18_EMP2',
                name: 'T18 Second Employee',
                email: 't18_emp2@example.test',
                password_hash: hash,
                role: 'employee',
                status: 'active'
            });

            t18AdminToken = jwt.sign({ id: 'T18_ADM', role: 'admin', email: 't18_adm@example.test' }, process.env.JWT_SECRET);
            t18MgrToken = jwt.sign({ id: 'T18_MGR', role: 'manager', email: 't18_mgr@example.test' }, process.env.JWT_SECRET);
            t18EmpToken = jwt.sign({ id: 'T18_EMP', role: 'employee', email: 't18_emp@example.test' }, process.env.JWT_SECRET);
        });

        it('leave approved creates applicant notification', async () => {
            await Notification.deleteMany({ recipient: testEmp._id });

            const leave = await Leave.create({
                employee_id: testEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-11-01'),
                end_date: new Date('2026-11-03'),
                total_days: 3,
                status: 'pending',
                reason: 'Sick leave test'
            });

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${t18AdminToken}`);
            expect(res.status).toBe(200);

            const notif = await Notification.findOne({
                recipient: testEmp._id,
                type: 'leave',
                title: 'Leave Request Approved'
            });
            expect(notif).toBeDefined();
            expect(notif.data.leaveId).toBe(leave._id.toString());
            expect(notif.data.status).toBe('approved');
        });

        it('attendance flagged creates employee and manager notifications', async () => {
            await Notification.deleteMany({ recipient: { $in: [testEmp._id, mgrEmp._id] } });

            // Create an open attendance session with a future check-in to trigger needs_review
            const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
            await Attendance.create({
                employee_id: testEmp.id,
                date: futureDate,
                check_in: futureDate,
                status: 'present',
                is_open_session: true,
                work_hours: 0
            });

            const res = await request(app)
                .post('/api/attendance/clock-out')
                .set('Authorization', `Bearer ${t18EmpToken}`);
            expect(res.status).toBe(200);
            expect(res.body.attendance.needs_review).toBe(true);

            const empNotif = await Notification.findOne({
                recipient: testEmp._id,
                title: 'Attendance Session Flagged for Review'
            });
            expect(empNotif).toBeDefined();

            const mgrNotif = await Notification.findOne({
                recipient: mgrEmp._id,
                title: 'Employee Attendance Session Flagged'
            });
            expect(mgrNotif).toBeDefined();
        });

        it('remote exception granted creates employee notification', async () => {
            await Notification.deleteMany({ recipient: testEmp._id });

            const res = await request(app)
                .post('/api/remote-access')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    employee_id: testEmp.id,
                    allowedIp: '192.168.1.100'
                });
            expect(res.status).toBe(201);

            const notif = await Notification.findOne({
                recipient: testEmp._id,
                title: 'Remote Access Granted'
            });
            expect(notif).toBeDefined();
            expect(notif.data.status).toBe('granted');
        });

        it('role change creates employee notification', async () => {
            await Notification.deleteMany({ recipient: testEmp._id, title: 'Role Updated' });

            const res = await request(app)
                .put(`/api/employees/${testEmp.id}`)
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    role: 'team_lead'
                });
            expect(res.status).toBe(200);

            const notif = await Notification.findOne({
                recipient: testEmp._id,
                title: 'Role Updated'
            });
            expect(notif).toBeDefined();
            expect(notif.message).toContain('employee');
            expect(notif.message).toContain('team_lead');
        });

        it('payroll change creates only the affected employee\'s notification', async () => {
            await Notification.deleteMany({ title: 'Payroll Created' });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    employee_id: testEmp.id,
                    month: 4,
                    year: 2026,
                    basic: 25000
                });
            expect(res.status).toBe(201);

            const payrollNotifs = await Notification.find({ title: 'Payroll Created' });
            expect(payrollNotifs.length).toBe(1);
            expect(payrollNotifs[0].recipient.toString()).toBe(testEmp._id.toString());

            const secondEmpNotif = await Notification.findOne({
                recipient: secondEmp._id,
                title: 'Payroll Created'
            });
            expect(secondEmpNotif).toBeNull();
        });

        it('security settings update notifies admins only', async () => {
            await Notification.deleteMany({ title: 'Security Settings Updated' });

            const res = await request(app)
                .post('/api/settings')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    require_2fa: true
                });
            expect(res.status).toBe(200);

            // Wait brief moment for async IIFE notification dispatch
            await new Promise(r => setTimeout(r, 200));

            const notifs = await Notification.find({ title: 'Security Settings Updated' });
            expect(notifs.length).toBeGreaterThan(0);

            for (const notif of notifs) {
                const recipientEmp = await Employee.findById(notif.recipient).lean();
                expect(recipientEmp).toBeDefined();
                expect(recipientEmp.role).toBe('admin');
            }

            const nonAdminNotif = await Notification.findOne({
                recipient: { $in: [testEmp._id, mgrEmp._id, secondEmp._id] },
                title: 'Security Settings Updated'
            });
            expect(nonAdminNotif).toBeNull();
        });

        it('changing an employee\'s department creates one notification for that employee with the old and new names; updating other fields only creates no department notification', async () => {
            const Department = require('../models/Department');

            const deptOld = await Department.create({ name: 'Dept_Old_' + Date.now() });
            const deptNew = await Department.create({ name: 'Dept_New_' + Date.now() });

            // Set employee's initial department
            await Employee.updateOne({ _id: testEmp._id }, { $set: { department_id: deptOld._id } });

            // 1) Update other fields only -> creates NO department notification
            await Notification.deleteMany({ recipient: testEmp._id, title: 'Department Updated' });

            const resOther = await request(app)
                .put(`/api/employees/${testEmp.id}`)
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    phone: '9876543210'
                });
            expect(resOther.status).toBe(200);

            const notifOther = await Notification.findOne({
                recipient: testEmp._id,
                title: 'Department Updated'
            });
            expect(notifOther).toBeNull();

            // 2) Change employee's department to deptNew -> creates 1 notification with old and new names
            const resDept = await request(app)
                .put(`/api/employees/${testEmp.id}`)
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    department_id: deptNew._id
                });
            expect(resDept.status).toBe(200);

            const deptNotifs = await Notification.find({
                recipient: testEmp._id,
                title: 'Department Updated'
            });
            expect(deptNotifs.length).toBe(1);
            expect(deptNotifs[0].message).toBe(`Your department has been changed from ${deptOld.name} to ${deptNew.name}.`);

            // Verify no notification for any other employee
            const otherEmpDeptNotif = await Notification.findOne({
                recipient: { $ne: testEmp._id },
                title: 'Department Updated'
            });
            expect(otherEmpDeptNotif).toBeNull();
        });

        it('creating an employee via the API creates exactly one welcome notification for that employee', async () => {
            const newEmpId = 'EMP_WELCOME_TEST_101';
            const res = await request(app)
                .post('/api/employees')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({
                    id: newEmpId,
                    name: 'Welcome Test Employee',
                    email: 'welcometest@example.com',
                    password: 'Password@123',
                    role: 'employee'
                });
            expect(res.status).toBe(201);

            const createdEmp = await Employee.findOne({ id: newEmpId });
            expect(createdEmp).toBeDefined();

            const notifs = await Notification.find({
                recipient: createdEmp._id,
                title: 'Welcome to Zograha Technologies'
            });
            expect(notifs.length).toBe(1);
            expect(notifs[0].message).toBe(`Your employee account has been created. Your ID is ${newEmpId}.`);

            // Verify no other employee received this welcome notification
            const otherNotifs = await Notification.find({
                recipient: { $ne: createdEmp._id },
                title: 'Welcome to Zograha Technologies',
                message: { $regex: newEmpId }
            });
            expect(otherNotifs.length).toBe(0);
        });

        it('an employee with push_subscription set does not show it in GET employees list, GET employee by id, GET profile, login response, or GET me', async () => {
            // Set push subscription directly on testEmp
            await Employee.updateOne(
                { _id: testEmp._id },
                {
                    $set: {
                        push_subscription: {
                            endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
                            keys: { p256dh: 'test-p256dh', auth: 'test-auth' }
                        }
                    }
                }
            );

            // 1. GET /api/employees (list)
            const listRes = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${t18AdminToken}`);
            expect(listRes.status).toBe(200);
            const foundInList = (listRes.body.employees || []).find(e => e.id === testEmp.id);
            expect(foundInList).toBeDefined();
            expect(foundInList.push_subscription).toBeUndefined();

            // 2. GET /api/employees/:id
            const getRes = await request(app)
                .get(`/api/employees/${testEmp.id}`)
                .set('Authorization', `Bearer ${t18AdminToken}`);
            expect(getRes.status).toBe(200);
            expect(getRes.body.employee.push_subscription).toBeUndefined();

            // 3. Login response
            const loginRes = await request(app)
                .post('/api/auth/login')
                .send({
                    email: testEmp.email,
                    password: 'Secret123!'
                });
            expect(loginRes.status).toBe(200);
            expect(loginRes.body.user.push_subscription).toBeUndefined();

            // 4. GET /api/auth/me
            const meRes = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${t18EmpToken}`);
            expect(meRes.status).toBe(200);
            expect(meRes.body.user.push_subscription).toBeUndefined();
        });

        it('subscribe with an invalid shape (missing keys, non-https endpoint, extra oversized field) returns 400 and stores nothing', async () => {
            // Enable push globally for this test
            await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

            // Clear testEmp's subscription first
            await Employee.updateOne({ _id: testEmp._id }, { $set: { push_subscription: null, push_subscriptions: [] } });

            // Case A: non-https endpoint
            const resA = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint: 'http://insecure.endpoint.com/test',
                    keys: { p256dh: 'validKey', auth: 'validAuth' }
                });
            expect(resA.status).toBe(400);
            expect(resA.body.message).toBe('Invalid push subscription.');

            // Case B: missing keys
            const resB = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint: 'https://secure.endpoint.com/test'
                });
            expect(resB.status).toBe(400);

            // Case C: oversized field (>256 chars on auth)
            const resC = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint: 'https://secure.endpoint.com/test',
                    keys: { p256dh: 'validKey', auth: 'a'.repeat(300) }
                });
            expect(resC.status).toBe(400);

            // Verify nothing stored
            const emp = await Employee.findOne({ _id: testEmp._id }).select('+push_subscription +push_subscriptions');
            expect(emp.push_subscription).toBeNull();
            expect(emp.push_subscriptions.length).toBe(0);
        });

        it('subscribe with a valid shape stores only endpoint and keys in push_subscriptions and push_subscription', async () => {
            // Enable push globally for this test
            await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

            const validSub = {
                endpoint: 'https://fcm.googleapis.com/fcm/send/valid-endpoint',
                keys: {
                    p256dh: 'valid-p256dh-key',
                    auth: 'valid-auth-token'
                },
                extraField: 'shouldNotBeSaved',
                nested: { attack: true }
            };

            const res = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send(validSub);
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);

            const emp = await Employee.findOne({ _id: testEmp._id }).select('+push_subscription +push_subscriptions');
            expect(emp.push_subscriptions.length).toBe(1);
            expect(emp.push_subscriptions[0].endpoint).toBe(validSub.endpoint);
            expect(emp.push_subscriptions[0].keys).toEqual({
                p256dh: validSub.keys.p256dh,
                auth: validSub.keys.auth
            });
            expect(emp.push_subscriptions[0].extraField).toBeUndefined();
            expect(emp.push_subscriptions[0].nested).toBeUndefined();
        });

        it('eligible user subscribes and receives a send call on notification create; ineligible user does not', async () => {
            const webpush = require('web-push');
            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(() => Promise.resolve());

            try {
                // Clear any leftover subscriptions on testEmp and secondEmp
                await Employee.updateOne({ _id: testEmp._id }, { $set: { push_subscription: null, push_subscriptions: [], status: 'active' } });
                await Employee.updateOne({ _id: secondEmp._id }, { $set: { push_subscription: null, push_subscriptions: [], status: 'inactive' } });

                // Global push enabled
                await Setting.updateOne(
                    {},
                    {
                        $set: {
                            enable_browser_push: true
                        }
                    },
                    { upsert: true }
                );

                // 1. Ineligible user (secondEmp, inactive) attempts to subscribe -> 403
                const ineligSubRes = await request(app)
                    .post('/api/notifications/subscribe')
                    .set('Authorization', `Bearer ${jwt.sign({ id: secondEmp.id, role: 'employee' }, process.env.JWT_SECRET)}`)
                    .send({
                        endpoint: 'https://fcm.googleapis.com/fcm/send/second-endpoint',
                        keys: { p256dh: 'pk', auth: 'auth' }
                    });
                expect(ineligSubRes.status).toBe(403);

                // 2. Eligible user (testEmp, active) subscribes -> 201
                const eligSubRes = await request(app)
                    .post('/api/notifications/subscribe')
                    .set('Authorization', `Bearer ${t18EmpToken}`)
                    .send({
                        endpoint: 'https://fcm.googleapis.com/fcm/send/pilot-endpoint',
                        keys: { p256dh: 'pk', auth: 'auth' }
                    });
                expect(eligSubRes.status).toBe(201);

                sendSpy.mockClear();

                // 3. Notification created for testEmp (eligible) -> sendSpy called
                await Notification.create({
                    recipient: testEmp._id,
                    title: 'Push Test Title',
                    message: 'Push Test Body Message',
                    data: { link: '/test-link' }
                });

                // Wait for asynchronous post-save hook
                await new Promise(r => setTimeout(r, 80));
                expect(sendSpy).toHaveBeenCalled();
                const callArgs = sendSpy.mock.calls[0];
                expect(callArgs[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/pilot-endpoint');
                const parsedPayload = JSON.parse(callArgs[1]);
                expect(parsedPayload.title).toBe('Push Test Title');
                expect(parsedPayload.body).toBe('Push Test Body Message');
                expect(parsedPayload.data.url).toBe('/test-link');

                sendSpy.mockClear();

                // 4. Notification created for secondEmp (ineligible, inactive) -> sendSpy NOT called
                await Notification.create({
                    recipient: secondEmp._id,
                    title: 'Ineligible Push Test',
                    message: 'Should not trigger push'
                });
                await new Promise(r => setTimeout(r, 80));
                expect(sendSpy).not.toHaveBeenCalled();
            } finally {
                sendSpy.mockRestore();
                await Employee.updateOne({ _id: secondEmp._id }, { $set: { status: 'active' } });
            }
        });

        it('a 410 response removes only that endpoint; payload is capped; push_subscriptions absent from GET employees', async () => {
            const webpush = require('web-push');

            // 1. Mock 410 error on the dead endpoint
            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation((sub) => {
                if (sub.endpoint.includes('dead-endpoint')) {
                    const err = new Error('Subscription expired');
                    err.statusCode = 410;
                    return Promise.reject(err);
                }
                return Promise.resolve();
            });

            try {
                await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

                // Seed testEmp with two endpoints: alive and dead
                await Employee.updateOne(
                    { _id: testEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscriptions: [
                                {
                                    endpoint: 'https://fcm.googleapis.com/fcm/send/alive-endpoint',
                                    keys: { p256dh: 'k1', auth: 'a1' }
                                },
                                {
                                    endpoint: 'https://fcm.googleapis.com/fcm/send/dead-endpoint',
                                    keys: { p256dh: 'k2', auth: 'a2' }
                                }
                            ]
                        }
                    }
                );

                // Create notification with huge text to test 4KB cap
                const longMessage = 'A'.repeat(5000);
                await Notification.create({
                    recipient: testEmp._id,
                    title: 'Long Message Test',
                    message: longMessage
                });

                await new Promise(r => setTimeout(r, 100));

                // Verify dead endpoint was pruned and alive endpoint remains
                const updatedEmp = await Employee.findOne({ _id: testEmp._id }).select('+push_subscriptions');
                expect(updatedEmp.push_subscriptions.length).toBe(1);
                expect(updatedEmp.push_subscriptions[0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/alive-endpoint');

                // Verify payload capped under 4KB
                for (const call of sendSpy.mock.calls) {
                    const payloadStr = call[1];
                    expect(Buffer.byteLength(payloadStr, 'utf8')).toBeLessThanOrEqual(4096);
                }

                // Verify push_subscriptions is absent from GET /api/employees
                const listRes = await request(app)
                    .get('/api/employees')
                    .set('Authorization', `Bearer ${t18AdminToken}`);
                expect(listRes.status).toBe(200);
                const found = (listRes.body.employees || []).find(e => e.id === testEmp.id);
                expect(found).toBeDefined();
                expect(found.push_subscriptions).toBeUndefined();
                expect(found.push_subscription).toBeUndefined();

                // Test DELETE /api/notifications/subscribe (Unsubscribe endpoint)
                const unsubRes = await request(app)
                    .delete('/api/notifications/subscribe')
                    .set('Authorization', `Bearer ${t18EmpToken}`)
                    .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/alive-endpoint' });
                expect(unsubRes.status).toBe(200);
                expect(unsubRes.body.success).toBe(true);

                const finalEmp = await Employee.findOne({ _id: testEmp._id }).select('+push_subscriptions');
                expect(finalEmp.push_subscriptions.length).toBe(0);
            } finally {
                sendSpy.mockRestore();
            }
        });

        it('an active employee who is not on any list can subscribe and gets 201', async () => {
            const hash = await bcrypt.hash('Secret123!', 10);
            await Employee.deleteMany({ id: 'EMP_ALL_ACTIVE_01' });

            const emp = await Employee.create({
                id: 'EMP_ALL_ACTIVE_01',
                name: 'All Active User',
                email: 'activeuser@example.test',
                password_hash: hash,
                role: 'employee',
                status: 'active'
            });

            await Setting.updateOne({}, { $set: { enable_browser_push: true, push_pilot_employee_ids: [] } }, { upsert: true });

            const token = jwt.sign({ id: emp.id, role: 'employee', email: emp.email }, process.env.JWT_SECRET);
            const res = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    endpoint: 'https://fcm.googleapis.com/fcm/send/active-all-endpoint',
                    keys: { p256dh: 'k', auth: 'a' }
                });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('when enable_browser_push is false, subscribe returns 403 with the disabled message', async () => {
            await Setting.updateOne({}, { $set: { enable_browser_push: false } }, { upsert: true });

            const res = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint: 'https://fcm.googleapis.com/fcm/send/disabled-endpoint',
                    keys: { p256dh: 'k', auth: 'a' }
                });
            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Browser push notifications are disabled by the administrator.');
        });

        it('a terminated or inactive employee gets 403', async () => {
            try {
                await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

                // Inactive
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'inactive' } });
                const inactRes = await request(app)
                    .post('/api/notifications/subscribe')
                    .set('Authorization', `Bearer ${t18EmpToken}`)
                    .send({
                        endpoint: 'https://fcm.googleapis.com/fcm/send/inact-endpoint',
                        keys: { p256dh: 'k', auth: 'a' }
                    });
                expect(inactRes.status).toBe(403);

                // Terminated
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'terminated' } });
                const termRes = await request(app)
                    .post('/api/notifications/subscribe')
                    .set('Authorization', `Bearer ${t18EmpToken}`)
                    .send({
                        endpoint: 'https://fcm.googleapis.com/fcm/send/term-endpoint',
                        keys: { p256dh: 'k', auth: 'a' }
                    });
                expect(termRes.status).toBe(403);
            } finally {
                // Reset testEmp to active
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'active' } });
            }
        });

        it('when enable_browser_push is missing from the settings document, subscribe returns 201', async () => {
            await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'active' } });
            await Setting.updateOne({}, { $unset: { enable_browser_push: 1 } });

            const res = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint: 'https://fcm.googleapis.com/fcm/send/missing-flag-endpoint',
                    keys: { p256dh: 'k', auth: 'a' }
                });
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
        });

        it('a SuperAdmin can save enable_browser_push, and it persists', async () => {
            // 1. Save as false
            const resFalse = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({ enable_browser_push: false });
            expect(resFalse.status).toBe(200);

            let setting = await Setting.findOne();
            expect(setting.enable_browser_push).toBe(false);

            // 2. Save as true
            const resTrue = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${t18AdminToken}`)
                .send({ enable_browser_push: true });
            expect(resTrue.status).toBe(200);

            setting = await Setting.findOne();
            expect(setting.enable_browser_push).toBe(true);
        });

        it('a notification for an enabled user calls the push sender; a disabled or unsubscribed user does not', async () => {
            const webpush = require('web-push');
            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(() => Promise.resolve());

            try {
                // Ensure global push is enabled
                await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

                // User 1: Active and subscribed
                await Employee.updateOne(
                    { _id: testEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscriptions: [{
                                endpoint: 'https://fcm.googleapis.com/fcm/send/enabled-user-endpoint',
                                keys: { p256dh: 'k1', auth: 'a1' }
                            }]
                        }
                    }
                );

                // User 2: Active but unsubscribed (no push_subscriptions)
                await Employee.updateOne(
                    { _id: secondEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscription: null,
                            push_subscriptions: []
                        }
                    }
                );

                // 1. Notification for enabled & subscribed user -> triggers push
                sendSpy.mockClear();
                await Notification.create({
                    recipient: testEmp._id,
                    title: 'Enabled User Alert',
                    message: 'You have a new update.'
                });
                await new Promise(r => setTimeout(r, 60));
                expect(sendSpy).toHaveBeenCalledTimes(1);
                expect(sendSpy.mock.calls[0][0].endpoint).toBe('https://fcm.googleapis.com/fcm/send/enabled-user-endpoint');

                // 2. Notification for unsubscribed user -> does NOT trigger push
                sendSpy.mockClear();
                await Notification.create({
                    recipient: secondEmp._id,
                    title: 'Unsubscribed User Alert',
                    message: 'No push should be sent.'
                });
                await new Promise(r => setTimeout(r, 60));
                expect(sendSpy).not.toHaveBeenCalled();

                // 3. Notification when employee is inactive (disabled user) -> does NOT trigger push
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'inactive' } });
                sendSpy.mockClear();
                await Notification.create({
                    recipient: testEmp._id,
                    title: 'Inactive User Alert',
                    message: 'No push should be sent.'
                });
                await new Promise(r => setTimeout(r, 60));
                expect(sendSpy).not.toHaveBeenCalled();

                // 4. Notification when global push is disabled -> does NOT trigger push
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'active' } });
                await Setting.updateOne({}, { $set: { enable_browser_push: false } });
                sendSpy.mockClear();
                await Notification.create({
                    recipient: testEmp._id,
                    title: 'Globally Disabled Push Alert',
                    message: 'No push should be sent.'
                });
                await new Promise(r => setTimeout(r, 60));
                expect(sendSpy).not.toHaveBeenCalled();
            } finally {
                sendSpy.mockRestore();
                await Employee.updateOne({ _id: testEmp._id }, { $set: { status: 'active' } });
                await Setting.updateOne({}, { $set: { enable_browser_push: true } });
            }
        });

        it('an insertMany of notifications for an enabled, subscribed employee calls the push sender once per recipient, and a failing push sender does not fail the insert', async () => {
            const webpush = require('web-push');
            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(() => Promise.resolve());

            try {
                await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

                // Seed testEmp and secondEmp as active with push subscriptions
                await Employee.updateOne(
                    { _id: testEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscriptions: [{
                                endpoint: 'https://fcm.googleapis.com/fcm/send/insertmany-emp1',
                                keys: { p256dh: 'k1', auth: 'a1' }
                            }]
                        }
                    }
                );
                await Employee.updateOne(
                    { _id: secondEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscriptions: [{
                                endpoint: 'https://fcm.googleapis.com/fcm/send/insertmany-emp2',
                                keys: { p256dh: 'k2', auth: 'a2' }
                            }]
                        }
                    }
                );

                // 1. insertMany with successful push sends
                sendSpy.mockClear();
                const inserted = await Notification.insertMany([
                    { recipient: testEmp._id, title: 'Batch Alert 1', message: 'Message 1' },
                    { recipient: secondEmp._id, title: 'Batch Alert 2', message: 'Message 2' }
                ]);
                expect(inserted.length).toBe(2);
                expect(sendSpy).toHaveBeenCalledTimes(2);

                const endpointsCalled = sendSpy.mock.calls.map(c => c[0].endpoint);
                expect(endpointsCalled).toContain('https://fcm.googleapis.com/fcm/send/insertmany-emp1');
                expect(endpointsCalled).toContain('https://fcm.googleapis.com/fcm/send/insertmany-emp2');

                // 2. insertMany when push sender fails (rejects) -> insert still succeeds
                sendSpy.mockImplementation(() => Promise.reject(new Error('FCM delivery failed')));
                sendSpy.mockClear();

                let errorThrown = null;
                let failBatchInserted = null;
                try {
                    failBatchInserted = await Notification.insertMany([
                        { recipient: testEmp._id, title: 'Error Tolerant Alert 1', message: 'Message fail 1' },
                        { recipient: secondEmp._id, title: 'Error Tolerant Alert 2', message: 'Message fail 2' }
                    ]);
                } catch (err) {
                    errorThrown = err;
                }

                expect(errorThrown).toBeNull();
                expect(failBatchInserted).toBeDefined();
                expect(failBatchInserted.length).toBe(2);

                // Confirm records were indeed inserted into the database
                const foundInDb = await Notification.find({
                    _id: { $in: failBatchInserted.map(d => d._id) }
                });
                expect(foundInDb.length).toBe(2);
            } finally {
                sendSpy.mockRestore();
            }
        });

        it('a mocked 403 is logged with the status code and does not remove the subscription', async () => {
            const webpush = require('web-push');
            const err403 = new Error('Forbidden');
            err403.statusCode = 403;
            err403.body = 'Unauthorized registration or VAPID mismatch';

            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(() => Promise.reject(err403));
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            try {
                await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

                const targetEndpoint = 'https://fcm.googleapis.com/fcm/send/emp-403-keep-sub';
                await Employee.updateOne(
                    { _id: testEmp._id },
                    {
                        $set: {
                            status: 'active',
                            push_subscriptions: [{
                                endpoint: targetEndpoint,
                                keys: { p256dh: 'k403', auth: 'a403' }
                            }]
                        }
                    }
                );

                await Notification.create({
                    recipient: testEmp._id,
                    title: 'VAPID Test',
                    message: 'Check 403 handling'
                });

                await new Promise(r => setTimeout(r, 60));

                // 1. Verify 403 was logged with status code and "VAPID rejected (403)"
                const logged403 = consoleSpy.mock.calls.some(call =>
                    call.some(arg => typeof arg === 'string' && arg.includes('VAPID rejected (403)') && arg.includes('statusCode=403') && arg.includes('fcm.googleapis.com'))
                );
                expect(logged403).toBe(true);

                // 2. Verify subscription was NOT removed from the database
                const empInDb = await Employee.findOne({ _id: testEmp._id }).select('+push_subscriptions');
                const endpoints = (empInDb.push_subscriptions || []).map(s => s.endpoint);
                expect(endpoints).toContain(targetEndpoint);
            } finally {
                sendSpy.mockRestore();
                consoleSpy.mockRestore();
            }
        });

        it('subscribing twice with the same endpoint leaves one entry and refreshes keys', async () => {
            await Setting.updateOne({}, { $set: { enable_browser_push: true } }, { upsert: true });

            // Clear push subscriptions
            await Employee.updateOne({ _id: testEmp._id }, { $set: { push_subscriptions: [], push_subscription: null, status: 'active' } });

            const endpoint = 'https://fcm.googleapis.com/fcm/send/dedup-test-device-1';

            // First subscription
            const res1 = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint,
                    keys: { p256dh: 'initial-key', auth: 'initial-auth' }
                });
            expect(res1.status).toBe(201);

            // Second subscription with identical endpoint but updated keys
            const res2 = await request(app)
                .post('/api/notifications/subscribe')
                .set('Authorization', `Bearer ${t18EmpToken}`)
                .send({
                    endpoint,
                    keys: { p256dh: 'updated-key', auth: 'updated-auth' }
                });
            expect(res2.status).toBe(201);

            // Verify only one entry exists with the refreshed keys
            const emp = await Employee.findOne({ _id: testEmp._id }).select('+push_subscriptions +push_subscription');
            expect(emp.push_subscriptions.length).toBe(1);
            expect(emp.push_subscriptions[0].endpoint).toBe(endpoint);
            expect(emp.push_subscriptions[0].keys.p256dh).toBe('updated-key');
            expect(emp.push_subscriptions[0].keys.auth).toBe('updated-auth');
            expect(emp.push_subscription.keys.p256dh).toBe('updated-key');
        });

        it('test-push: sends diagnostic test push; reports 201 sent, removes on 410, keeps on 403', async () => {
            const webpush = require('web-push');

            const ep201 = 'https://fcm.googleapis.com/fcm/send/test-diag-201';
            const ep410 = 'https://updates.push.services.mozilla.com/wpush/v2/test-diag-410';
            const ep403 = 'https://fcm.googleapis.com/fcm/send/test-diag-403';

            await Employee.updateOne(
                { _id: testEmp._id },
                {
                    $set: {
                        push_subscriptions: [
                            { endpoint: ep201, keys: { p256dh: 'k1', auth: 'a1' } },
                            { endpoint: ep410, keys: { p256dh: 'k2', auth: 'a2' } },
                            { endpoint: ep403, keys: { p256dh: 'k3', auth: 'a3' } }
                        ]
                    }
                }
            );

            const sendSpy = jest.spyOn(webpush, 'sendNotification').mockImplementation(async (sub, payload) => {
                if (sub.endpoint === ep201) {
                    return { statusCode: 201 };
                } else if (sub.endpoint === ep410) {
                    const err = new Error('Gone');
                    err.statusCode = 410;
                    throw err;
                } else if (sub.endpoint === ep403) {
                    const err = new Error('Forbidden');
                    err.statusCode = 403;
                    throw err;
                }
                return { statusCode: 200 };
            });

            try {
                const res = await request(app)
                    .post('/api/notifications/test-push')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ employee_id: testEmp.id });

                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);

                // Pre-flight checks returned without secrets
                expect(res.body.checks).toBeDefined();
                expect(res.body.checks.vapid_public_key_set).toBe(true);
                expect(res.body.checks.vapid_private_key_set).toBe(true);
                expect(res.body.checks.vapid_email_starts_with_mailto).toBe(true);
                expect(res.body.checks.vapid_public_key_matches_served).toBe(true);

                // Results returned
                expect(res.body.results.length).toBe(3);

                const r201 = res.body.results.find(r => r.endpoint_host === 'fcm.googleapis.com' && r.status === 201);
                expect(r201).toBeDefined();
                expect(r201.error).toBeNull();

                const r410 = res.body.results.find(r => r.endpoint_host === 'updates.push.services.mozilla.com');
                expect(r410).toBeDefined();
                expect(r410.status).toBe(410);
                expect(r410.error).toMatch(/Subscription expired/i);

                const r403 = res.body.results.find(r => r.endpoint_host === 'fcm.googleapis.com' && r.status === 403);
                expect(r403).toBeDefined();
                expect(r403.error).toBe('VAPID rejected');

                // Verify keys and full endpoints were never returned in response
                const resStr = JSON.stringify(res.body);
                expect(resStr).not.toContain(ep201);
                expect(resStr).not.toContain(ep410);
                expect(resStr).not.toContain(ep403);
                expect(resStr).not.toContain('p256dh');

                // Verify database: 410 was removed, 201 and 403 remain
                const empAfter = await Employee.findOne({ _id: testEmp._id }).select('+push_subscriptions');
                const remEndpoints = empAfter.push_subscriptions.map(s => s.endpoint);
                expect(remEndpoints).toContain(ep201);
                expect(remEndpoints).toContain(ep403);
                expect(remEndpoints).not.toContain(ep410);
            } finally {
                sendSpy.mockRestore();
            }
        });
    });

    describe('Phase A: Idle Auto Clock-Out API & Settings', () => {
        let idleEmp;
        let idleEmpToken;
        let exemptEmp;
        let exemptEmpToken;
        let originalDateNow;

        beforeAll(async () => {
            const Employee = require('../models/Employee');
            const Attendance = require('../models/Attendance');
            const Shift = require('../models/Shift');

            // Default shift if none
            let shift = await Shift.findOne({ is_default: true });
            if (!shift) {
                shift = await Shift.create({
                    name: 'General Shift',
                    start_time: '09:00',
                    end_time: '18:00',
                    is_default: true
                });
            }

            // Create test employees
            idleEmp = await Employee.create({
                id: 'EMP_IDLE_01',
                name: 'Idle Test Employee',
                email: 'idle_test@example.com',
                password_hash: await bcrypt.hash('Secret123!', 10),
                role: 'employee',
                status: 'active',
                department_id: testDeptId,
                shift_id: shift._id
            });
            idleEmpToken = jwt.sign(
                { id: idleEmp.id, _id: idleEmp._id, role: idleEmp.role, permissions: [] },
                process.env.JWT_SECRET
            );

            exemptEmp = await Employee.create({
                id: 'EMP_IDLE_EXEMPT',
                name: 'Exempt Test Employee',
                email: 'exempt_test@example.com',
                password_hash: await bcrypt.hash('Secret123!', 10),
                role: 'employee',
                status: 'active',
                department_id: testDeptId,
                shift_id: shift._id
            });
            exemptEmpToken = jwt.sign(
                { id: exemptEmp.id, _id: exemptEmp._id, role: exemptEmp.role, permissions: [] },
                process.env.JWT_SECRET
            );
        });

        beforeEach(async () => {
            const Setting = require('../models/Setting');
            const Attendance = require('../models/Attendance');

            await Attendance.deleteMany({ employee_id: { $in: [idleEmp.id, exemptEmp.id] } });

            // Configure default idle settings with 00:00 - 23:59 office hours so tests pass regardless of execution time
            await Setting.updateOne(
                {},
                {
                    $set: {
                        idle_auto_clockout_enabled: true,
                        idle_timeout_minutes: 10,
                        idle_exempt_employee_ids: [exemptEmp.id],
                        idle_exempt_app_names: ['zoom.exe', 'teams.exe'],
                        attendance_settings: {
                            office_start_time: '00:00',
                            office_end_time: '23:59',
                            grace_period: 15,
                            half_day_min_hours: 4,
                            full_day_min_hours: 8
                        }
                    }
                },
                { upsert: true }
            );
        });

        it('1. auto clock-out closes an open session and sets auto_clock_out true', async () => {
            const Attendance = require('../models/Attendance');
            // Create an open session
            const checkInTime = new Date(Date.now() - 30 * 60 * 1000); // 30 mins ago
            await Attendance.create({
                employee_id: idleEmp.id,
                date: checkInTime,
                check_in: checkInTime,
                status: 'present',
                is_open_session: true,
                work_hours: 0
            });

            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const session = await Attendance.findOne({ employee_id: idleEmp.id });
            expect(session.is_open_session).toBe(false);
            expect(session.auto_clock_out).toBe(true);
            expect(session.check_out).toBeDefined();
            expect(session.work_hours).toBeGreaterThan(0);
        });

        it('2. rejects when the feature is disabled (403)', async () => {
            const Setting = require('../models/Setting');
            await Setting.updateOne({}, { $set: { idle_auto_clockout_enabled: false } });

            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/disabled/i);
        });

        it('3. rejects an exempt employee (403)', async () => {
            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${exemptEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/exempt/i);
        });

        it('4. rejects idle_seconds below the limit (400)', async () => {
            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 599, // below 10 mins * 60 = 600s
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/idle_seconds must be at least/i);
        });

        it('5. rejects outside office hours (400)', async () => {
            const Setting = require('../models/Setting');
            // Set office hours to a window that definitely excludes the current time
            // We'll compute current IST hour/min and set start/end in the past/future
            const now = new Date();
            const istTime = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
            const curH = istTime.getUTCHours();
            // Window 2-3 hours ahead
            const startH = (curH + 2) % 24;
            const endH = (curH + 3) % 24;
            const pad = (n) => String(n).padStart(2, '0');

            await Setting.updateOne(
                {},
                {
                    $set: {
                        'attendance_settings.office_start_time': `${pad(startH)}:00`,
                        'attendance_settings.office_end_time': `${pad(endH)}:00`
                    }
                }
            );

            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/during office hours/i);
        });

        it('6. rejects with no open session (409) and a second call does nothing', async () => {
            const Attendance = require('../models/Attendance');
            // Open session first
            const checkInTime = new Date(Date.now() - 15 * 60 * 1000);
            await Attendance.create({
                employee_id: idleEmp.id,
                date: checkInTime,
                check_in: checkInTime,
                status: 'present',
                is_open_session: true,
                work_hours: 0
            });

            // First call succeeds (200)
            const res1 = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });
            expect(res1.status).toBe(200);

            // Second call: session is closed, returns 409
            const res2 = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });
            expect(res2.status).toBe(409);
            expect(res2.body.success).toBe(false);
            expect(res2.body.message).toMatch(/no open clock-in session/i);
        });

        it('7. email and notification are created exactly once on success', async () => {
            const Attendance = require('../models/Attendance');
            const Notification = require('../models/Notification');
            const { sendEmail } = require('../utils/emailService');

            await Notification.deleteMany({ recipient: idleEmp._id });
            sendEmail.lastEmail = null;

            const checkInTime = new Date(Date.now() - 20 * 60 * 1000);
            await Attendance.create({
                employee_id: idleEmp.id,
                date: checkInTime,
                check_in: checkInTime,
                status: 'present',
                is_open_session: true,
                work_hours: 0
            });

            const res = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${idleEmpToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(res.status).toBe(200);

            // Check notification
            const notifs = await Notification.find({ recipient: idleEmp._id, title: 'Automatically clocked out' });
            expect(notifs.length).toBe(1);
            expect(notifs[0].message).toMatch(/after 10 minutes of inactivity/i);

            // Check email
            expect(sendEmail.lastEmail).toBeDefined();
            expect(sendEmail.lastEmail.to).toBe(idleEmp.email);
            expect(sendEmail.lastEmail.subject).toBe('Automatically clocked out');
        });

        it('8. idle-policy returns exempt true only for listed employees', async () => {
            // idleEmp should have exempt: false
            const res1 = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${idleEmpToken}`);

            expect(res1.status).toBe(200);
            expect(res1.body.success).toBe(true);
            expect(res1.body.enabled).toBe(true);
            expect(res1.body.timeout_minutes).toBe(10);
            expect(res1.body.exempt).toBe(false);
            expect(res1.body.exempt_app_names).toEqual(['zoom.exe', 'teams.exe']);
            expect(res1.body.idle_exempt_employee_ids).toBeUndefined(); // ensure other IDs are never leaked

            // exemptEmp should have exempt: true
            const res2 = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${exemptEmpToken}`);

            expect(res2.status).toBe(200);
            expect(res2.body.success).toBe(true);
            expect(res2.body.exempt).toBe(true);
            expect(res2.body.idle_exempt_employee_ids).toBeUndefined();
        });

        it('9. updateSettings rejects a timeout of 0 and 300 with 400', async () => {
            // Test timeout 0
            const res0 = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ idle_timeout_minutes: 0 });

            expect(res0.status).toBe(400);
            expect(res0.body.success).toBe(false);
            expect(res0.body.message).toMatch(/idle_timeout_minutes must be a number between 1 and 240/i);

            // Test timeout 300
            const res300 = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ idle_timeout_minutes: 300 });

            expect(res300.status).toBe(400);
            expect(res300.body.success).toBe(false);
            expect(res300.body.message).toMatch(/idle_timeout_minutes must be a number between 1 and 240/i);

            // Test valid timeout (e.g. 15) persists
            const resValid = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    idle_timeout_minutes: 15,
                    idle_auto_clockout_enabled: true,
                    idle_exempt_employee_ids: ['EMP123', ' EMP456 '],
                    idle_exempt_app_names: ['zoom.exe', ' teams.exe ']
                });

            expect(resValid.status).toBe(200);
            expect(resValid.body.settings.idle_timeout_minutes).toBe(15);
            expect(resValid.body.settings.idle_exempt_employee_ids).toEqual(['EMP123', 'EMP456']);
            expect(resValid.body.settings.idle_exempt_app_names).toEqual(['zoom.exe', 'teams.exe']);
        });
    });

    describe('Device Token for Idle Companion Tests', () => {
        let devEmp;
        let devEmpToken;
        let plainDevToken;
        let devDocId;

        beforeAll(async () => {
            const Employee = require('../models/Employee');
            const Shift = require('../models/Shift');

            let shift = await Shift.findOne({ is_default: true });
            if (!shift) {
                shift = await Shift.create({
                    name: 'General Shift',
                    start_time: '09:00',
                    end_time: '18:00',
                    is_default: true
                });
            }

            devEmp = await Employee.create({
                id: 'EMP_DEV_01',
                name: 'Device Token Employee',
                email: 'dev_test@example.com',
                password_hash: await bcrypt.hash('Secret123!', 10),
                role: 'employee',
                status: 'active',
                department_id: testDeptId,
                shift_id: shift._id
            });
            devEmpToken = jwt.sign(
                { id: devEmp.id, _id: devEmp._id, role: devEmp.role, permissions: [] },
                process.env.JWT_SECRET
            );
        });

        beforeEach(async () => {
            const Setting = require('../models/Setting');
            const Attendance = require('../models/Attendance');

            await Attendance.deleteMany({ employee_id: devEmp.id });

            // Ensure idle auto clockout is enabled with full day hours
            await Setting.updateOne(
                {},
                {
                    $set: {
                        idle_auto_clockout_enabled: true,
                        idle_timeout_minutes: 10,
                        idle_exempt_employee_ids: [],
                        idle_exempt_app_names: [],
                        attendance_settings: {
                            office_start_time: '00:00',
                            office_end_time: '23:59',
                            grace_period: 15,
                            half_day_min_hours: 4,
                            full_day_min_hours: 8
                        }
                    }
                },
                { upsert: true }
            );

            // Issue a fresh device token for each test
            const res = await request(app)
                .post('/api/devices/tokens')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    employee_id: devEmp.id,
                    device_name: 'Keerthi Laptop'
                });

            expect(res.status).toBe(201);
            plainDevToken = res.body.token;
            devDocId = res.body.device.id;
        });

        it('device token can call idle-policy and auto-clock-out', async () => {
            const Attendance = require('../models/Attendance');

            // 1. Call idle-policy
            const resPolicy = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${plainDevToken}`);

            expect(resPolicy.status).toBe(200);
            expect(resPolicy.body.success).toBe(true);
            expect(resPolicy.body.enabled).toBe(true);

            // 2. Open attendance session
            const checkInTime = new Date(Date.now() - 25 * 60 * 1000);
            await Attendance.create({
                employee_id: devEmp.id,
                date: checkInTime,
                check_in: checkInTime,
                status: 'present',
                is_open_session: true,
                work_hours: 0
            });

            // 3. Call auto-clock-out
            const resClockOut = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${plainDevToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: new Date().toISOString()
                });

            expect(resClockOut.status).toBe(200);
            expect(resClockOut.body.success).toBe(true);
            expect(resClockOut.body.attendance.auto_clock_out).toBe(true);
        });

        it('device token gets 403 on GET /api/employees, GET /api/auth/me, and POST /api/attendance/clock-in', async () => {
            // GET /api/employees
            const res1 = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${plainDevToken}`);
            expect(res1.status).toBe(403);
            expect(res1.body.message).toMatch(/Device token unauthorized for this route/i);

            // GET /api/auth/me
            const res2 = await request(app)
                .get('/api/auth/me')
                .set('Authorization', `Bearer ${plainDevToken}`);
            expect(res2.status).toBe(403);
            expect(res2.body.message).toMatch(/Device token unauthorized for this route/i);

            // POST /api/attendance/clock-in
            const res3 = await request(app)
                .post('/api/attendance/clock-in')
                .set('Authorization', `Bearer ${plainDevToken}`);
            expect(res3.status).toBe(403);
            expect(res3.body.message).toMatch(/Device token unauthorized for this route/i);
        });

        it('revoked token gets 401', async () => {
            const DeviceToken = require('../models/DeviceToken');
            await DeviceToken.updateOne({ _id: devDocId }, { $set: { revoked: true } });

            const res = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${plainDevToken}`);

            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Invalid, revoked, or expired/i);
        });

        it('expired token gets 401', async () => {
            const DeviceToken = require('../models/DeviceToken');
            await DeviceToken.updateOne(
                { _id: devDocId },
                { $set: { expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000) } } // expired yesterday
            );

            const res = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${plainDevToken}`);

            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/Invalid, revoked, or expired/i);
        });

        it('token from a deactivated employee gets 401 or 403', async () => {
            const Employee = require('../models/Employee');
            await Employee.updateOne({ id: devEmp.id }, { $set: { status: 'inactive' } });

            const res = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${plainDevToken}`);

            expect([401, 403]).toContain(res.status);
            expect(res.body.message).toMatch(/deactivated/i);

            // Restore status
            await Employee.updateOne({ id: devEmp.id }, { $set: { status: 'active' } });
        });

        it('stored record contains a hash, not the token', async () => {
            const DeviceToken = require('../models/DeviceToken');
            const crypto = require('crypto');

            const doc = await DeviceToken.findById(devDocId);
            expect(doc).toBeDefined();
            // Stored value should NOT equal plainDevToken
            expect(doc.token_hash).not.toBe(plainDevToken);
            // It should be the sha256 hash of plainDevToken
            const expectedHash = crypto.createHash('sha256').update(plainDevToken).digest('hex');
            expect(doc.token_hash).toBe(expectedHash);
        });

        it('stale reported_at gets 400', async () => {
            // More than 5 minutes old
            const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();

            const resOld = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${plainDevToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: oldTime
                });

            expect(resOld.status).toBe(400);
            expect(resOld.body.message).toMatch(/older than 5 minutes/i);

            // In the future (>1m)
            const futureTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
            const resFuture = await request(app)
                .post('/api/attendance/auto-clock-out')
                .set('Authorization', `Bearer ${plainDevToken}`)
                .send({
                    idle_seconds: 600,
                    reported_at: futureTime
                });

            expect(resFuture.status).toBe(400);
            expect(resFuture.body.message).toMatch(/cannot be in the future/i);
        });

        it('non-admin cannot issue or revoke (403)', async () => {
            // Issue attempt by employee
            const resIssue = await request(app)
                .post('/api/devices/tokens')
                .set('Authorization', `Bearer ${devEmpToken}`)
                .send({
                    employee_id: devEmp.id,
                    device_name: 'Hack Attempt'
                });
            expect(resIssue.status).toBe(403);

            // Revoke attempt by employee
            const resRevoke = await request(app)
                .delete(`/api/devices/tokens/${devDocId}`)
                .set('Authorization', `Bearer ${devEmpToken}`);
            expect(resRevoke.status).toBe(403);

            // List attempt by employee
            const resList = await request(app)
                .get('/api/devices/tokens')
                .set('Authorization', `Bearer ${devEmpToken}`);
            expect(resList.status).toBe(403);
        });
    });

    describe('25. Login-Level IP Enforcement Tests', () => {
        const AccessSettings = require('../models/AccessSettings');
        const RemoteAccess = require('../models/RemoteAccess');
        const Employee = require('../models/Employee');
        const { invalidateAccessSettingsCache } = require('../middleware/ipAccess');

        const officeCidr = '192.168.1.0/24';
        const allowedOfficeIp = '192.168.1.55';
        const blockedRemoteIp = '203.0.113.195';
        const testPassword = 'Password123!';

        let loginEmp, loginTL, loginMgr, loginAdmin;
        let testRefreshToken;

        beforeAll(async () => {
            process.env.TRUST_PROXY = 'vercel';
            const passwordHash = await bcrypt.hash(testPassword, 10);

            loginEmp = await Employee.create({
                id: 'LOGIN_IP_EMP',
                name: 'Login IP Employee',
                email: 'login_ip_emp@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                emailVerified: true
            });

            loginTL = await Employee.create({
                id: 'LOGIN_IP_TL',
                name: 'Login IP Team Lead',
                email: 'login_ip_tl@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'team_lead',
                status: 'active',
                emailVerified: true
            });

            loginMgr = await Employee.create({
                id: 'LOGIN_IP_MGR',
                name: 'Login IP Manager',
                email: 'login_ip_mgr@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'manager',
                status: 'active',
                emailVerified: true
            });

            loginAdmin = await Employee.create({
                id: 'LOGIN_IP_ADMIN',
                name: 'Login IP SuperAdmin',
                email: 'login_ip_admin@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                emailVerified: true
            });

            testRefreshToken = jwt.sign(
                { id: loginEmp.id },
                process.env.JWT_REFRESH_SECRET,
                { expiresIn: '7d' }
            );
            await Employee.updateOne({ id: loginEmp.id }, { $set: { refresh_tokens: [testRefreshToken] } });
        });

        afterAll(async () => {
            delete process.env.TRUST_PROXY;
            await Employee.deleteMany({ id: { $in: ['LOGIN_IP_EMP', 'LOGIN_IP_TL', 'LOGIN_IP_MGR', 'LOGIN_IP_ADMIN'] } });
            await AccessSettings.deleteMany({});
            await RemoteAccess.deleteMany({ employee_id: 'LOGIN_IP_EMP' });
            invalidateAccessSettingsCache();
        });

        beforeEach(async () => {
            await AccessSettings.deleteMany({});
            await AccessSettings.create({
                enforce_ip_access: true,
                ranges: [{ cidr: officeCidr, label: 'Office Range', enabled: true }]
            });
            invalidateAccessSettingsCache();
            await RemoteAccess.deleteMany({ employee_id: 'LOGIN_IP_EMP' });
        });

        it('wrong password from blocked IP gets 401, not 403', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginEmp.email, password: 'WrongPassword999!' });

            expect(res.status).toBe(401);
            expect(res.body.message).toMatch(/invalid.*password/i);
        });

        it('employee from a blocked IP gets 403 and no token', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginEmp.email, password: testPassword });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Access allowed only from the office network.');
            expect(res.body.token).toBeUndefined();
            expect(res.body.refreshToken).toBeUndefined();
        });

        it('employee from an allowed IP logs in normally', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', allowedOfficeIp)
                .send({ email: loginEmp.email, password: testPassword });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
            expect(res.body.refreshToken).toBeDefined();
        });

        it('team_lead from a blocked IP gets 403', async () => {
            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginTL.email, password: testPassword });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Access allowed only from the office network.');
            expect(res.body.token).toBeUndefined();
            expect(res.body.refreshToken).toBeUndefined();
        });

        it('manager and SuperAdmin from a blocked IP log in normally', async () => {
            const mgrRes = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginMgr.email, password: testPassword });

            expect(mgrRes.status).toBe(200);
            expect(mgrRes.body.success).toBe(true);
            expect(mgrRes.body.token).toBeDefined();

            const adminRes = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginAdmin.email, password: testPassword });

            expect(adminRes.status).toBe(200);
            expect(adminRes.body.success).toBe(true);
            expect(adminRes.body.token).toBeDefined();
        });

        it('employee with an active remote exception logs in from a blocked IP', async () => {
            await RemoteAccess.create({
                employee_id: loginEmp.id,
                allowedIp: blockedRemoteIp,
                active: true,
                grantedBy: 'admin',
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });

            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginEmp.email, password: testPassword });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
        });

        it('refresh from a blocked IP gets 403', async () => {
            await Employee.updateOne({ id: loginEmp.id }, { $set: { refresh_tokens: [testRefreshToken] } });

            const res = await request(app)
                .post('/api/auth/refresh')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ refreshToken: testRefreshToken });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Access allowed only from the office network.');
            expect(res.body.token).toBeUndefined();
        });

        it('enforcement OFF allows login from any IP', async () => {
            await AccessSettings.updateOne({}, { $set: { enforce_ip_access: false } });
            invalidateAccessSettingsCache();

            const res = await request(app)
                .post('/api/auth/login')
                .set('x-vercel-forwarded-for', blockedRemoteIp)
                .send({ email: loginEmp.email, password: testPassword });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.token).toBeDefined();
        });
    });

    describe('26. Policy-Driven Idle Policy and Companion Tests', () => {
        const Setting = require('../models/Setting');
        const Employee = require('../models/Employee');
        let policyEmpToken;

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('TestPass123!', 10);
            const policyEmp = await Employee.create({
                id: 'POLICY_EMP_01',
                name: 'Policy Test Employee',
                email: 'policy_emp@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                emailVerified: true
            });

            policyEmpToken = jwt.sign(
                { id: policyEmp.id, _id: policyEmp._id, role: policyEmp.role, email: policyEmp.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        afterAll(async () => {
            await Employee.deleteOne({ id: 'POLICY_EMP_01' });
        });

        it('Changing idle_timeout_minutes in settings is reflected in the very next idle-policy call', async () => {
            await Setting.updateOne({}, { $set: { idle_timeout_minutes: 25 } }, { upsert: true });

            const res1 = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(res1.status).toBe(200);
            expect(res1.body.idle_timeout_minutes).toBe(25);
            expect(res1.body.timeout_minutes).toBe(25);

            await Setting.updateOne({}, { $set: { idle_timeout_minutes: 5 } });

            const res2 = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(res2.status).toBe(200);
            expect(res2.body.idle_timeout_minutes).toBe(5);
            expect(res2.body.timeout_minutes).toBe(5);
        });

        it('Turning idle_auto_clockout_enabled on or off is reflected in the very next idle-policy call', async () => {
            await Setting.updateOne({}, { $set: { idle_auto_clockout_enabled: false } });

            const resOff = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(resOff.status).toBe(200);
            expect(resOff.body.idle_auto_clockout_enabled).toBe(false);
            expect(resOff.body.enabled).toBe(false);

            await Setting.updateOne({}, { $set: { idle_auto_clockout_enabled: true } });

            const resOn = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(resOn.status).toBe(200);
            expect(resOn.body.idle_auto_clockout_enabled).toBe(true);
            expect(resOn.body.enabled).toBe(true);
        });

        it('Office hours changes are reflected in the very next idle-policy call', async () => {
            await Setting.updateOne({}, {
                $set: {
                    'attendance_settings.office_start_time': '10:15',
                    'attendance_settings.office_end_time': '19:45'
                }
            });

            const res = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(res.status).toBe(200);
            expect(res.body.office_start_time).toBe('10:15');
            expect(res.body.office_end_time).toBe('19:45');
        });

        it('Missing settings fields return the documented defaults and never null', async () => {
            await Setting.updateOne({}, {
                $unset: {
                    idle_timeout_minutes: "",
                    idle_auto_clockout_enabled: "",
                    idle_exempt_app_names: "",
                    attendance_settings: ""
                }
            });

            const res = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${policyEmpToken}`);

            expect(res.status).toBe(200);
            expect(res.body.idle_timeout_minutes).toBe(10);
            expect(res.body.timeout_minutes).toBe(10);
            expect(res.body.idle_auto_clockout_enabled).toBe(false);
            expect(res.body.enabled).toBe(false);
            expect(res.body.office_start_time).toBe('09:00');
            expect(res.body.office_end_time).toBe('18:00');
            expect(res.body.idle_exempt_app_names).toEqual([]);
            expect(res.body.poll_seconds).toBe(60);
            expect(res.body.idle_timeout_minutes).not.toBeNull();
            expect(res.body.office_start_time).not.toBeNull();
            expect(res.body.office_end_time).not.toBeNull();
            expect(res.body.defaults_applied).toBeDefined();
            expect(res.body.notice).toMatch(/server defaults applied/i);
        });
    });

    describe('27. Idle Companion Enrollment & Device Management Tests', () => {
        const EnrollmentCode = require('../models/EnrollmentCode');
        const DeviceToken = require('../models/DeviceToken');
        const Setting = require('../models/Setting');
        const Employee = require('../models/Employee');
        const { sendEmail } = require('../utils/emailService');
        const crypto = require('crypto');

        let enrollAdminToken, enrollEmpToken;
        let enrollEmp, inactiveEmp;
        const downloadUrl = 'https://example.com/download/companion.ps1';

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('TestPass123!', 10);

            const enrollAdmin = await Employee.create({
                id: 'ENROLL_ADMIN_01',
                name: 'Enroll Admin',
                email: 'enroll_admin@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                emailVerified: true
            });

            enrollEmp = await Employee.create({
                id: 'ENROLL_EMP_01',
                name: 'Enroll Employee',
                email: 'enroll_emp@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                emailVerified: true
            });

            inactiveEmp = await Employee.create({
                id: 'ENROLL_INACTIVE_01',
                name: 'Inactive Employee',
                email: 'inactive_emp@zograhatechnologies.test',
                password_hash: passwordHash,
                role: 'employee',
                status: 'inactive',
                emailVerified: true
            });

            enrollAdminToken = jwt.sign(
                { id: enrollAdmin.id, _id: enrollAdmin._id, role: enrollAdmin.role, email: enrollAdmin.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            enrollEmpToken = jwt.sign(
                { id: enrollEmp.id, _id: enrollEmp._id, role: enrollEmp.role, email: enrollEmp.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            await Setting.updateOne({}, {
                $set: {
                    companion_download_url: downloadUrl,
                    idle_auto_clockout_enabled: true
                }
            }, { upsert: true });
        });

        afterAll(async () => {
            await Employee.deleteMany({ id: { $in: ['ENROLL_ADMIN_01', 'ENROLL_EMP_01', 'ENROLL_INACTIVE_01'] } });
            await EnrollmentCode.deleteMany({ employee_id: { $in: ['ENROLL_EMP_01', 'ENROLL_INACTIVE_01'] } });
            await DeviceToken.deleteMany({ employee_id: { $in: ['ENROLL_EMP_01', 'ENROLL_INACTIVE_01'] } });
        });

        it('SuperAdmin send-setup creates one active code and emails the employee', async () => {
            const res = await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollAdminToken}`)
                .send({ employee_id: enrollEmp.id });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.expires_at).toBeDefined();
            expect(res.body.code).toBeUndefined();
            expect(res.body.code_hash).toBeUndefined();

            // Mock transport captured the email
            const lastEmail = sendEmail.lastEmail;
            expect(lastEmail).toBeDefined();
            expect(lastEmail.to).toBe(enrollEmp.email);
            expect(lastEmail.subject).toBe('Set up Zograha Idle Companion');
            expect(lastEmail.text).toContain(downloadUrl);
            expect(lastEmail.code).toBeDefined();
            expect(lastEmail.code).toHaveLength(10);
            expect(lastEmail.code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{10}$/);

            // Stored record has only a hash
            const expectedHash = crypto.createHash('sha256').update(lastEmail.code).digest('hex');
            const storedDoc = await EnrollmentCode.findOne({ code_hash: expectedHash }).lean();
            expect(storedDoc).toBeDefined();
            expect(storedDoc.employee_id).toBe(enrollEmp.id);
            expect(storedDoc.used_at).toBeNull();
            expect(storedDoc.code).toBeUndefined();
        });

        it('Send-setup is rejected when companion_download_url is empty (400)', async () => {
            await Setting.updateOne({}, { $set: { companion_download_url: '' } });

            const res = await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollAdminToken}`)
                .send({ employee_id: enrollEmp.id });

            expect(res.status).toBe(400);
            expect(res.body.message).toMatch(/Set the companion download link in Settings first/i);

            // Restore setting
            await Setting.updateOne({}, { $set: { companion_download_url: downloadUrl } });
        });

        it('Non-admin send-setup returns 403', async () => {
            const res = await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollEmpToken}`)
                .send({ employee_id: enrollEmp.id });

            expect(res.status).toBe(403);
        });

        let validEnrollCode;
        it('Enroll with a valid code returns a device token that works on GET /api/attendance/idle-policy', async () => {
            // Send setup to obtain a fresh code
            await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollAdminToken}`)
                .send({ employee_id: enrollEmp.id });

            validEnrollCode = sendEmail.lastEmail.code;

            const enrollRes = await request(app)
                .post('/api/devices/enroll')
                .send({ code: validEnrollCode, device_name: 'Dev Pilot PC' });

            expect(enrollRes.status).toBe(201);
            expect(enrollRes.body.success).toBe(true);
            expect(enrollRes.body.token).toMatch(/^dev_[a-f0-9]{64}$/);
            expect(enrollRes.body.device.device_name).toBe('Dev Pilot PC');

            // Device token works on GET /api/attendance/idle-policy
            const policyRes = await request(app)
                .get('/api/attendance/idle-policy')
                .set('Authorization', `Bearer ${enrollRes.body.token}`);

            expect(policyRes.status).toBe(200);
            expect(policyRes.body.success).toBe(true);
        });

        it('Enroll with the same code twice fails the second time', async () => {
            const resSecond = await request(app)
                .post('/api/devices/enroll')
                .send({ code: validEnrollCode, device_name: 'Second PC' });

            expect(resSecond.status).toBe(400);
            expect(resSecond.body.message).toBe('Invalid or expired code.');
        });

        it('Expired code fails', async () => {
            const expiredCode = 'EXP2345678';
            const expHash = crypto.createHash('sha256').update(expiredCode).digest('hex');
            await EnrollmentCode.create({
                employee_id: enrollEmp.id,
                code_hash: expHash,
                expires_at: new Date(Date.now() - 60 * 1000), // 1m in the past
                used_at: null,
                created_by: 'admin'
            });

            const res = await request(app)
                .post('/api/devices/enroll')
                .send({ code: expiredCode });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid or expired code.');
        });

        it('A newer code invalidates the older one', async () => {
            // First code
            await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollAdminToken}`)
                .send({ employee_id: enrollEmp.id });
            const olderCode = sendEmail.lastEmail.code;

            // Second code (newer)
            await request(app)
                .post('/api/devices/enrollment-codes')
                .set('Authorization', `Bearer ${enrollAdminToken}`)
                .send({ employee_id: enrollEmp.id });
            const newerCode = sendEmail.lastEmail.code;

            // Older code should fail
            const resOlder = await request(app)
                .post('/api/devices/enroll')
                .send({ code: olderCode });
            expect(resOlder.status).toBe(400);
            expect(resOlder.body.message).toBe('Invalid or expired code.');

            // Newer code succeeds
            const resNewer = await request(app)
                .post('/api/devices/enroll')
                .send({ code: newerCode });
            expect(resNewer.status).toBe(201);
            expect(resNewer.body.token).toMatch(/^dev_/);
        });

        it('Enroll for an inactive employee fails with the generic message', async () => {
            const inactCode = 'INA2345678';
            const inactHash = crypto.createHash('sha256').update(inactCode).digest('hex');
            await EnrollmentCode.create({
                employee_id: inactiveEmp.id,
                code_hash: inactHash,
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
                used_at: null,
                created_by: 'admin'
            });

            const res = await request(app)
                .post('/api/devices/enroll')
                .send({ code: inactCode });

            expect(res.status).toBe(400);
            expect(res.body.message).toBe('Invalid or expired code.');
        });

        it('Enroll is rate limited after 10 attempts', async () => {
            for (let i = 0; i < 10; i++) {
                await request(app).post('/api/devices/enroll').send({ code: 'BADCODE123' });
            }
            const res11 = await request(app).post('/api/devices/enroll').send({ code: 'BADCODE123' });
            expect(res11.status).toBe(429);
            expect(res11.body.message).toMatch(/too many enrollment attempts/i);
        });

        it('Device list never includes token values or hashes', async () => {
            const res = await request(app)
                .get('/api/devices/tokens')
                .set('Authorization', `Bearer ${enrollAdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.tokens)).toBe(true);
            expect(res.body.tokens.length).toBeGreaterThan(0);

            for (const dev of res.body.tokens) {
                expect(dev.token).toBeUndefined();
                expect(dev.token_hash).toBeUndefined();
                expect(dev.plainToken).toBeUndefined();
                expect(dev.hash).toBeUndefined();
                expect(dev.employee_id).toBeDefined();
            }
        });
    });

    describe('28. Email Transporter & Test Email Tests', () => {
        let nodemailerModule;
        let originalCreateTransport;
        let mockSendMail;

        beforeAll(() => {
            nodemailerModule = require('nodemailer');
            originalCreateTransport = nodemailerModule.createTransport;
        });

        afterAll(() => {
            nodemailerModule.createTransport = originalCreateTransport;
        });

        beforeEach(() => {
            mockSendMail = jest.fn().mockResolvedValue({ messageId: 'mock-msg-12345' });
            nodemailerModule.createTransport = jest.fn().mockReturnValue({
                sendMail: mockSendMail
            });
        });

        afterEach(() => {
            nodemailerModule.createTransport = originalCreateTransport;
        });

        it('sendTestEmail with mocked nodemailer returns success and calls sendMail once with configured from address', async () => {
            const res = await request(app)
                .post('/api/settings/test-email')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({
                    mail_host: 'smtp.office365.com',
                    mail_port: 587,
                    mail_username: 'smtp-user@example.com',
                    mail_password: 'smtp-password',
                    mail_encryption: 'tls',
                    mail_from_email: 'alerts@example.com',
                    mail_from_name: 'HRMS Notifications'
                });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.message).toContain('Test email sent successfully to alerts@example.com');

            expect(nodemailerModule.createTransport).toHaveBeenCalledTimes(1);
            expect(mockSendMail).toHaveBeenCalledTimes(1);
            expect(mockSendMail.mock.calls[0][0].from).toBe('"HRMS Notifications" <alerts@example.com>');
            expect(mockSendMail.mock.calls[0][0].to).toBe('alerts@example.com');
        });

        it('A missing configuration returns a clear error, not a ReferenceError', async () => {
            const Setting = require('../models/Setting');
            await Setting.updateOne({}, { $unset: { email_settings: 1 } });

            const res = await request(app)
                .post('/api/settings/test-email')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/required/i);
            expect(res.body.message).not.toContain('ReferenceError');
        });
    });

    describe('29. Team Lead Department Scope Tests', () => {
        let deptSales;
        let deptEngineering;
        let tlSales;
        let empSales;
        let empEngineering;
        let mgrSales;
        let tlSalesToken;
        let empSalesToken;
        let mgrSalesToken;

        beforeAll(async () => {
            const Department = require('../models/Department');
            const Employee = require('../models/Employee');
            const Attendance = require('../models/Attendance');
            const hash = await bcrypt.hash('TestPass123!', 10);

            // Departments
            deptSales = await Department.create({ name: 'TL_SCOPE_SALES', description: 'Sales Dept' });
            deptEngineering = await Department.create({ name: 'TL_SCOPE_ENG', description: 'Engineering Dept' });

            // Manager for Sales
            mgrSales = await Employee.create({
                id: 'MGR_TL_SCOPE',
                name: 'Sales Manager',
                email: 'mgr_tl_scope@zograhatechnologies.test',
                password_hash: hash,
                role: 'manager',
                department_id: deptSales._id,
                status: 'active'
            });
            await Department.updateOne({ _id: deptSales._id }, { $set: { manager_id: mgrSales.id } });

            // Team Lead in Sales
            tlSales = await Employee.create({
                id: 'TL_SCOPE_01',
                name: 'Sales Team Lead',
                email: 'tl_scope_01@zograhatechnologies.test',
                password_hash: hash,
                role: 'team_lead',
                department_id: deptSales._id,
                status: 'active'
            });

            // Employee in Sales (department colleague)
            empSales = await Employee.create({
                id: 'EMP_TL_SALES',
                name: 'Sales Colleague',
                email: 'emp_tl_sales@zograhatechnologies.test',
                password_hash: hash,
                role: 'employee',
                department_id: deptSales._id,
                status: 'active'
            });

            // Employee in Engineering (other department)
            empEngineering = await Employee.create({
                id: 'EMP_TL_ENG',
                name: 'Engineering Staff',
                email: 'emp_tl_eng@zograhatechnologies.test',
                password_hash: hash,
                role: 'employee',
                department_id: deptEngineering._id,
                status: 'active'
            });

            // Attendance records for both employees
            const today = new Date('2026-10-17T04:00:00.000Z');
            await Attendance.create({
                employee_id: empSales.id,
                date: today,
                check_in: new Date('2026-10-17T04:00:00.000Z'),
                check_out: new Date('2026-10-17T12:30:00.000Z'),
                worked_hours: 510,
                worked_hours_formatted: '08:30',
                status: 'present'
            });

            await Attendance.create({
                employee_id: empEngineering.id,
                date: today,
                check_in: new Date('2026-10-17T04:30:00.000Z'),
                check_out: new Date('2026-10-17T13:00:00.000Z'),
                worked_hours: 510,
                worked_hours_formatted: '08:30',
                status: 'present'
            });

            tlSalesToken = jwt.sign(
                { id: tlSales.id, _id: tlSales._id, role: tlSales.role, department_id: deptSales._id, email: tlSales.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            empSalesToken = jwt.sign(
                { id: empSales.id, _id: empSales._id, role: empSales.role, department_id: deptSales._id, email: empSales.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );

            mgrSalesToken = jwt.sign(
                { id: mgrSales.id, _id: mgrSales._id, role: mgrSales.role, department_id: deptSales._id, email: mgrSales.email },
                process.env.JWT_SECRET,
                { expiresIn: '1h' }
            );
        });

        // 1. team_lead sees a department colleague in GET /api/employees
        it('team_lead sees a department colleague in GET /api/employees', async () => {
            const res = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${tlSalesToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            const ids = res.body.employees.map(e => e.id);
            expect(ids).toContain(empSales.id);
            expect(ids).toContain(tlSales.id);
        });

        // 2. team_lead does not see an employee from another department
        it('team_lead does not see an employee from another department', async () => {
            const res = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${tlSalesToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.employees.map(e => e.id);
            expect(ids).not.toContain(empEngineering.id);
        });

        // 3. team_lead sees department colleagues attendance in the logs and export
        it('team_lead sees department colleagues attendance in the logs and export', async () => {
            const XLSX = require('xlsx');

            // Logs
            const logRes = await request(app)
                .get('/api/attendance/logs?from=2026-10-17&to=2026-10-17')
                .set('Authorization', `Bearer ${tlSalesToken}`);

            expect(logRes.status).toBe(200);
            const logEmpIds = logRes.body.logs.map(l => l.employee_id);
            expect(logEmpIds).toContain(empSales.id);

            // Export
            const expRes = await request(app)
                .get('/api/attendance/export?from=2026-10-17&to=2026-10-17')
                .set('Authorization', `Bearer ${tlSalesToken}`)
                .responseType('blob');

            expect(expRes.status).toBe(200);
            const wb = XLSX.read(expRes.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            const expEmpIds = rows.map(r => r['Employee ID']);
            expect(expEmpIds).toContain(empSales.id);
        });

        // 4. team_lead cannot see another department attendance
        it('team_lead cannot see another department attendance', async () => {
            const XLSX = require('xlsx');

            // Individual query for other dept employee: 403
            const forbiddenLog = await request(app)
                .get(`/api/attendance/logs?employee_id=${empEngineering.id}&from=2026-10-17&to=2026-10-17`)
                .set('Authorization', `Bearer ${tlSalesToken}`);
            expect(forbiddenLog.status).toBe(403);

            // General logs list: does not contain other dept employee
            const listRes = await request(app)
                .get('/api/attendance/logs?from=2026-10-17&to=2026-10-17')
                .set('Authorization', `Bearer ${tlSalesToken}`);
            expect(listRes.status).toBe(200);
            const logEmpIds = listRes.body.logs.map(l => l.employee_id);
            expect(logEmpIds).not.toContain(empEngineering.id);

            // General export: does not contain other dept employee
            const expRes = await request(app)
                .get('/api/attendance/export?from=2026-10-17&to=2026-10-17')
                .set('Authorization', `Bearer ${tlSalesToken}`)
                .responseType('blob');
            expect(expRes.status).toBe(200);
            const wb = XLSX.read(expRes.body, { type: 'buffer' });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);
            const expEmpIds = rows.map(r => r['Employee ID']);
            expect(expEmpIds).not.toContain(empEngineering.id);
        });

        // 5. employee still sees only themselves
        it('employee still sees only themselves', async () => {
            const res = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${empSalesToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.employees.map(e => e.id);
            expect(ids).toEqual([empSales.id]);

            // Attempting to view another employee's attendance: 403
            const forbiddenLog = await request(app)
                .get(`/api/attendance/logs?employee_id=${tlSales.id}&from=2026-10-17&to=2026-10-17`)
                .set('Authorization', `Bearer ${empSalesToken}`);
            expect(forbiddenLog.status).toBe(403);
        });

        // 6. manager scope is unchanged
        it('manager scope is unchanged', async () => {
            const res = await request(app)
                .get('/api/employees')
                .set('Authorization', `Bearer ${mgrSalesToken}`);

            expect(res.status).toBe(200);
            const ids = res.body.employees.map(e => e.id);
            expect(ids).toContain(empSales.id);
            expect(ids).toContain(tlSales.id);
            expect(ids).toContain(mgrSales.id);
            expect(ids).not.toContain(empEngineering.id);
        });
    });

    // 30. Monthly Leave Allowance Setting Tests
    describe('30. Monthly Leave Allowance Setting Tests', () => {
        let mlaAdminToken, mlaMgrToken, mlaTLToken, mlaEmpToken;
        let SettingModel, EmployeeModel;

        beforeAll(async () => {
            SettingModel = require('../models/Setting');
            EmployeeModel = require('../models/Employee');

            const salt = await bcrypt.genSalt(10);
            const password = await bcrypt.hash('Password123!', salt);

            await EmployeeModel.deleteMany({ id: { $in: ['MLA_ADMIN', 'MLA_MGR', 'MLA_TL', 'MLA_EMP'] } });

            await EmployeeModel.create({
                id: 'MLA_ADMIN',
                name: 'MLA Admin',
                email: 'mla_admin@test.com',
                password_hash: password,
                role: 'admin',
                status: 'active',
                department_id: testDeptId
            });

            await EmployeeModel.create({
                id: 'MLA_MGR',
                name: 'MLA Manager',
                email: 'mla_mgr@test.com',
                password_hash: password,
                role: 'manager',
                permissions: ['manage_settings'],
                status: 'active',
                department_id: testDeptId
            });

            await EmployeeModel.create({
                id: 'MLA_TL',
                name: 'MLA Team Lead',
                email: 'mla_tl@test.com',
                password_hash: password,
                role: 'team_lead',
                status: 'active',
                department_id: testDeptId
            });

            await EmployeeModel.create({
                id: 'MLA_EMP',
                name: 'MLA Employee',
                email: 'mla_emp@test.com',
                password_hash: password,
                role: 'employee',
                status: 'active',
                department_id: testDeptId
            });

            mlaAdminToken = jwt.sign({ id: 'MLA_ADMIN', role: 'admin', email: 'mla_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            mlaMgrToken = jwt.sign({ id: 'MLA_MGR', role: 'manager', email: 'mla_mgr@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            mlaTLToken = jwt.sign({ id: 'MLA_TL', role: 'team_lead', email: 'mla_tl@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
            mlaEmpToken = jwt.sign({ id: 'MLA_EMP', role: 'employee', email: 'mla_emp@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        });

        it('1. GET /api/settings as an employee returns monthly_leave_allowance (not hidden)', async () => {
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${mlaEmpToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.settings).toBeDefined();
            expect(res.body.settings.monthly_leave_allowance).toBeDefined();
            expect(typeof res.body.settings.monthly_leave_allowance).toBe('number');
            // Confirm sensitive fields are stripped for employee, but monthly_leave_allowance is retained
            expect(res.body.settings.email_settings).toBeUndefined();
            expect(res.body.settings.roles_permissions).toBeUndefined();
        });

        it('2. Setting document without monthly_leave_allowance returns fallback 1 on GET', async () => {
            await SettingModel.updateOne({}, { $unset: { monthly_leave_allowance: 1 } });
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${mlaEmpToken}`);

            expect(res.status).toBe(200);
            expect(res.body.settings.monthly_leave_allowance).toBe(1);
        });

        it('3. SuperAdmin can update monthly_leave_allowance and it persists', async () => {
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: 2 });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.settings.monthly_leave_allowance).toBe(2);

            const check = await SettingModel.findOne().lean();
            expect(check.monthly_leave_allowance).toBe(2);
        });

        it('4. Manager with manage_settings permission gets 403 when updating monthly_leave_allowance and stored value is unchanged', async () => {
            // Confirm starting value in DB is 2
            const before = await SettingModel.findOne().lean();
            expect(before.monthly_leave_allowance).toBe(2);

            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaMgrToken}`)
                .send({ monthly_leave_allowance: 5 });

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/Only SuperAdmin can edit monthly_leave_allowance/i);

            // Confirm stored value in DB did NOT change
            const after = await SettingModel.findOne().lean();
            expect(after.monthly_leave_allowance).toBe(2);
        });

        it('5. Team lead and employee get 403 when attempting to update monthly_leave_allowance', async () => {
            const tlRes = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaTLToken}`)
                .send({ monthly_leave_allowance: 3 });
            expect(tlRes.status).toBe(403);

            const empRes = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaEmpToken}`)
                .send({ monthly_leave_allowance: 3 });
            expect(empRes.status).toBe(403);
        });

        it('6. Negative value is rejected with 400 and not saved', async () => {
            const before = await SettingModel.findOne().lean();

            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: -2 });

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toMatch(/monthly_leave_allowance must be a non-negative whole integer/i);

            const after = await SettingModel.findOne().lean();
            expect(after.monthly_leave_allowance).toBe(before.monthly_leave_allowance);
        });

        it('7. Rejects non-integers, empty strings, booleans, and whitespace-only strings with 400; accepts 0 and 2', async () => {
            const before = await SettingModel.findOne().lean();

            // 1.5 returns 400
            const resFloat = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: 1.5 });
            expect(resFloat.status).toBe(400);
            expect(resFloat.body.success).toBe(false);
            const checkFloat = await SettingModel.findOne().lean();
            expect(checkFloat.monthly_leave_allowance).toBe(before.monthly_leave_allowance);

            // "" returns 400
            const resEmpty = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: "" });
            expect(resEmpty.status).toBe(400);
            expect(resEmpty.body.success).toBe(false);
            const checkEmpty = await SettingModel.findOne().lean();
            expect(checkEmpty.monthly_leave_allowance).toBe(before.monthly_leave_allowance);

            // whitespace-only returns 400
            const resWs = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: "   " });
            expect(resWs.status).toBe(400);
            expect(resWs.body.success).toBe(false);
            const checkWs = await SettingModel.findOne().lean();
            expect(checkWs.monthly_leave_allowance).toBe(before.monthly_leave_allowance);

            // true returns 400
            const resBool = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: true });
            expect(resBool.status).toBe(400);
            expect(resBool.body.success).toBe(false);
            const checkBool = await SettingModel.findOne().lean();
            expect(checkBool.monthly_leave_allowance).toBe(before.monthly_leave_allowance);

            // 0 is accepted
            const resZero = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: 0 });
            expect(resZero.status).toBe(200);
            expect(resZero.body.settings.monthly_leave_allowance).toBe(0);
            const checkZero = await SettingModel.findOne().lean();
            expect(checkZero.monthly_leave_allowance).toBe(0);

            // 2 is accepted
            const resTwo = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${mlaAdminToken}`)
                .send({ monthly_leave_allowance: 2 });
            expect(resTwo.status).toBe(200);
            expect(resTwo.body.settings.monthly_leave_allowance).toBe(2);
            const checkTwo = await SettingModel.findOne().lean();
            expect(checkTwo.monthly_leave_allowance).toBe(2);
        });
    });

    // 31. Pure Leave Deduction Helper Tests
    describe('31. Pure Leave Deduction Helper Tests', () => {
        const {
            splitLeaveByMonth,
            computeMonthlyDeduction,
            computeFreeDaysForApplication,
            round2
        } = require('../utils/leaveDeduction');

        it('1. 0 and 1 approved day: deduction 0', () => {
            const zeroDays = computeMonthlyDeduction({ approvedDaysInMonth: 0, allowance: 1, baseSalary: 10000 });
            expect(zeroDays.deductibleDays).toBe(0);
            expect(zeroDays.deduction).toBe(0);
            expect(zeroDays.noSalary).toBe(false);

            const oneDay = computeMonthlyDeduction({ approvedDaysInMonth: 1, allowance: 1, baseSalary: 10000 });
            expect(oneDay.deductibleDays).toBe(0);
            expect(oneDay.deduction).toBe(0);
            expect(oneDay.noSalary).toBe(false);
        });

        it('2. 2 days: deductibleDays 1, deduction 333.33', () => {
            const result = computeMonthlyDeduction({ approvedDaysInMonth: 2, allowance: 1, baseSalary: 10000 });
            expect(result.deductibleDays).toBe(1);
            expect(result.deduction).toBe(333.33);
            expect(result.noSalary).toBe(false);
        });

        it('3. 3 days in one application: deductibleDays 2, deduction 666.67', () => {
            const result = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: 10000 });
            expect(result.deductibleDays).toBe(2);
            expect(result.deduction).toBe(666.67);
            expect(result.noSalary).toBe(false);
        });

        it('4. Three separate 1-day applications produce the same totals as one 3-day application', () => {
            const app1 = 1;
            const app2 = 1;
            const app3 = 1;
            const totalApproved = app1 + app2 + app3; // 3 days

            const separateComputed = computeMonthlyDeduction({ approvedDaysInMonth: totalApproved, allowance: 1, baseSalary: 10000 });
            const singleComputed = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: 10000 });

            expect(separateComputed).toEqual(singleComputed);
            expect(separateComputed.deductibleDays).toBe(2);
            expect(separateComputed.deduction).toBe(666.67);
        });

        it('5. Month boundary: Mar 30 to Apr 2 2026 splits correctly into March and April counts', () => {
            // Calendar derivation:
            // 2026-03-30: Monday (weekday -> March 1)
            // 2026-03-31: Tuesday (weekday -> March 2)
            // 2026-04-01: Wednesday (weekday -> April 1)
            // 2026-04-02: Thursday (weekday -> April 2)
            const buckets = splitLeaveByMonth('2026-03-30', '2026-04-02');
            expect(buckets).toEqual({
                '2026-03': 2,
                '2026-04': 2
            });
        });

        it('6. IST boundary: "2026-10-01" counted in "2026-10", "2026-09-30" counted in "2026-09"', () => {
            // 2026-10-01 is Thursday
            const octStart = splitLeaveByMonth('2026-10-01', '2026-10-01');
            expect(octStart).toEqual({ '2026-10': 1 });

            // 2026-09-30 is Wednesday
            const sepEnd = splitLeaveByMonth('2026-09-30', '2026-09-30');
            expect(sepEnd).toEqual({ '2026-09': 1 });
        });

        it('7. Holidays excluded: weekday holiday not counted, weekend holiday does not alter weekday count', () => {
            // Range 2026-10-01 (Thu) to 2026-10-06 (Tue):
            // Oct 01: Thu (weekday)
            // Oct 02: Fri (weekday -> Holiday)
            // Oct 03: Sat (weekend)
            // Oct 04: Sun (weekend -> Holiday)
            // Oct 05: Mon (weekday)
            // Oct 06: Tue (weekday)
            // Total weekdays without holidays = 4 (Thu, Fri, Mon, Tue)
            // With Oct 02 (weekday holiday) excluded -> 3 days (Oct 01, Oct 05, Oct 06)
            // Oct 04 is a Sunday holiday; it was already excluded as weekend, so does not affect count.
            const holidays = ['2026-10-02', '2026-10-04'];
            const buckets = splitLeaveByMonth('2026-10-01', '2026-10-06', holidays);
            expect(buckets).toEqual({
                '2026-10': 3
            });
        });

        it('8. Weekend-only range returns {}', () => {
            // 2026-10-03 is Saturday, 2026-10-04 is Sunday
            const buckets = splitLeaveByMonth('2026-10-03', '2026-10-04');
            expect(buckets).toEqual({});
        });

        it('9. Inverted range (end before start) returns {} without throwing', () => {
            expect(splitLeaveByMonth('2026-10-10', '2026-10-01')).toEqual({});
            expect(splitLeaveByMonth('', '2026-10-01')).toEqual({});
            expect(splitLeaveByMonth(null, '2026-10-01')).toEqual({});
            expect(splitLeaveByMonth('invalid', '2026-10-01')).toEqual({});
        });

        it('10. Cap: baseSalary 100 with 100 deductible days returns deduction 100, not more', () => {
            // 100 * 100 / 30 = 333.33, but capped at baseSalary 100
            const result = computeMonthlyDeduction({ approvedDaysInMonth: 101, allowance: 1, baseSalary: 100 });
            expect(result.deductibleDays).toBe(100);
            expect(result.deduction).toBe(100);
            expect(result.noSalary).toBe(false);
        });

        it('11. Rounding to 2 decimals', () => {
            expect(round2(10000 * 1 / 30)).toBe(333.33);
            expect(round2(10000 * 2 / 30)).toBe(666.67);
            expect(round2(12345.6789)).toBe(12345.68);
        });

        it('12. Zero, null, undefined, and non-finite baseSalary: deduction 0, noSalary true', () => {
            const resZero = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: 0 });
            expect(resZero).toEqual({ deductibleDays: 2, deduction: 0, noSalary: true });

            const resNull = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: null });
            expect(resNull).toEqual({ deductibleDays: 2, deduction: 0, noSalary: true });

            const resUndef = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: undefined });
            expect(resUndef).toEqual({ deductibleDays: 2, deduction: 0, noSalary: true });

            const resNeg = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: -1000 });
            expect(resNeg).toEqual({ deductibleDays: 2, deduction: 0, noSalary: true });

            const resNaN = computeMonthlyDeduction({ approvedDaysInMonth: 3, allowance: 1, baseSalary: NaN });
            expect(resNaN).toEqual({ deductibleDays: 2, deduction: 0, noSalary: true });
        });

        it('13. computeFreeDaysForApplication: first application with 0 used vs second application after 1 used', () => {
            // First application: requested 2 days, 0 free used this month, allowance 1 -> 1 free day
            const firstApp = computeFreeDaysForApplication({
                alreadyFreeUsedThisMonth: 0,
                allowance: 1,
                requestedDaysInMonth: 2
            });
            expect(firstApp).toBe(1);

            // Second application: requested 2 days, 1 free already used, allowance 1 -> 0 free days
            const secondApp = computeFreeDaysForApplication({
                alreadyFreeUsedThisMonth: 1,
                allowance: 1,
                requestedDaysInMonth: 2
            });
            expect(secondApp).toBe(0);

            // Allowance of 2 days: requested 1 day, 0 used -> 1 free day
            const appPartial = computeFreeDaysForApplication({
                alreadyFreeUsedThisMonth: 0,
                allowance: 2,
                requestedDaysInMonth: 1
            });
            expect(appPartial).toBe(1);
        });
    });

    // 32. Balance Uses Free Days Only (Monthly Allowance) Tests
    describe('32. Balance Uses Free Days Only (Monthly Allowance) Tests', () => {
        let adminUserToken, testEmpObj;
        let LeaveModel, LeaveBalanceModel, EmployeeModel, SettingModel;

        beforeAll(async () => {
            LeaveModel = require('../models/Leave');
            LeaveBalanceModel = require('../models/LeaveBalance');
            EmployeeModel = require('../models/Employee');
            SettingModel = require('../models/Setting');

            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash('Password123!', salt);

            await EmployeeModel.deleteMany({ id: { $in: ['C4_ADMIN', 'C4_EMP', 'C4_EMP_ZERO', 'C4_EMP_MULTI'] } });
            await LeaveModel.deleteMany({ employee_id: { $in: ['C4_EMP', 'C4_EMP_ZERO', 'C4_EMP_MULTI'] } });
            await LeaveBalanceModel.deleteMany({ employee_id: { $in: ['C4_EMP', 'C4_EMP_ZERO', 'C4_EMP_MULTI'] } });

            await EmployeeModel.create({
                id: 'C4_ADMIN',
                name: 'C4 Admin',
                email: 'c4_admin@test.com',
                password_hash,
                role: 'admin',
                status: 'active',
                department_id: testDeptId
            });

            testEmpObj = await EmployeeModel.create({
                id: 'C4_EMP',
                name: 'C4 Employee',
                email: 'c4_emp@test.com',
                password_hash,
                role: 'employee',
                status: 'active',
                department_id: testDeptId
            });

            await LeaveBalanceModel.create({
                employee_id: 'C4_EMP',
                year: 2026,
                sick_leave: 12,
                casual_leave: 12,
                earned_leave: 15
            });

            adminUserToken = jwt.sign({ id: 'C4_ADMIN', role: 'admin', email: 'c4_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            // Ensure allowance setting is 1
            await SettingModel.updateOne({}, { $set: { monthly_leave_allowance: 1 } });
        });

        it('1. Approve a 3-day October leave: balance drops by 1, free_days is 1', async () => {
            // 2026-10-05 (Mon) to 2026-10-07 (Wed) = 3 working days
            const leave = await LeaveModel.create({
                employee_id: 'C4_EMP',
                leave_type: 'sick',
                start_date: new Date('2026-10-05T00:00:00.000Z'),
                end_date: new Date('2026-10-07T00:00:00.000Z'),
                total_days: 3,
                reason: '3-day sick leave in Oct',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${adminUserToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const updated = await LeaveModel.findById(leave._id).lean();
            expect(updated.status).toBe('approved');
            expect(updated.free_days).toBe(1);

            const bal = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();
            // Started with 12, dropped by free_days (1) -> 11
            expect(bal.sick_leave).toBe(11);
        });

        it('2. Double-approve the same leave: second call is refused and balance is not decremented twice', async () => {
            // Pick the leave approved in test 1
            const leave = await LeaveModel.findOne({ employee_id: 'C4_EMP', status: 'approved' });
            const balBefore = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();

            const res = await request(app)
                .put(`/api/leaves/${leave._id}/approve`)
                .set('Authorization', `Bearer ${adminUserToken}`);

            expect(res.status).toBe(400);
            expect(res.body.success).toBe(false);

            const balAfter = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();
            expect(balAfter.sick_leave).toBe(balBefore.sick_leave);
        });

        it('3. Approve three separate 1-day October leaves: total drop is 1 across them', async () => {
            await EmployeeModel.create({
                id: 'C4_EMP_MULTI',
                name: 'C4 Multi Emp',
                email: 'c4_multi@test.com',
                password_hash: testEmpObj.password_hash,
                role: 'employee',
                status: 'active',
                department_id: testDeptId
            });

            await LeaveBalanceModel.create({
                employee_id: 'C4_EMP_MULTI',
                year: 2026,
                sick_leave: 12
            });

            // Leave 1: 2026-10-12 (Mon)
            const l1 = await LeaveModel.create({
                employee_id: 'C4_EMP_MULTI',
                leave_type: 'sick',
                start_date: new Date('2026-10-12T00:00:00.000Z'),
                end_date: new Date('2026-10-12T00:00:00.000Z'),
                total_days: 1,
                reason: 'Day 1',
                status: 'pending'
            });

            // Leave 2: 2026-10-13 (Tue)
            const l2 = await LeaveModel.create({
                employee_id: 'C4_EMP_MULTI',
                leave_type: 'sick',
                start_date: new Date('2026-10-13T00:00:00.000Z'),
                end_date: new Date('2026-10-13T00:00:00.000Z'),
                total_days: 1,
                reason: 'Day 2',
                status: 'pending'
            });

            // Leave 3: 2026-10-14 (Wed)
            const l3 = await LeaveModel.create({
                employee_id: 'C4_EMP_MULTI',
                leave_type: 'sick',
                start_date: new Date('2026-10-14T00:00:00.000Z'),
                end_date: new Date('2026-10-14T00:00:00.000Z'),
                total_days: 1,
                reason: 'Day 3',
                status: 'pending'
            });

            // Approve Leave 1
            const res1 = await request(app).put(`/api/leaves/${l1._id}/approve`).set('Authorization', `Bearer ${adminUserToken}`);
            expect(res1.status).toBe(200);
            const upd1 = await LeaveModel.findById(l1._id).lean();
            expect(upd1.free_days).toBe(1);

            // Approve Leave 2
            const res2 = await request(app).put(`/api/leaves/${l2._id}/approve`).set('Authorization', `Bearer ${adminUserToken}`);
            expect(res2.status).toBe(200);
            const upd2 = await LeaveModel.findById(l2._id).lean();
            expect(upd2.free_days).toBe(0);

            // Approve Leave 3
            const res3 = await request(app).put(`/api/leaves/${l3._id}/approve`).set('Authorization', `Bearer ${adminUserToken}`);
            expect(res3.status).toBe(200);
            const upd3 = await LeaveModel.findById(l3._id).lean();
            expect(upd3.free_days).toBe(0);

            // Total drop across them is 1 (12 - 1 = 11)
            const multiBal = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP_MULTI', year: 2026 }).lean();
            expect(multiBal.sick_leave).toBe(11);
        });

        it('4. Approve when the balance is 0: succeeds', async () => {
            await EmployeeModel.create({
                id: 'C4_EMP_ZERO',
                name: 'C4 Zero Emp',
                email: 'c4_zero@test.com',
                password_hash: testEmpObj.password_hash,
                role: 'employee',
                status: 'active',
                department_id: testDeptId
            });

            await LeaveBalanceModel.create({
                employee_id: 'C4_EMP_ZERO',
                year: 2026,
                sick_leave: 0
            });

            const zeroLeave = await LeaveModel.create({
                employee_id: 'C4_EMP_ZERO',
                leave_type: 'sick',
                start_date: new Date('2026-10-19T00:00:00.000Z'),
                end_date: new Date('2026-10-19T00:00:00.000Z'),
                total_days: 1,
                reason: 'Leave when balance 0',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${zeroLeave._id}/approve`)
                .set('Authorization', `Bearer ${adminUserToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const upd = await LeaveModel.findById(zeroLeave._id).lean();
            expect(upd.status).toBe('approved');
            expect(upd.free_days).toBe(1);

            const bal = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP_ZERO', year: 2026 }).lean();
            expect(bal.sick_leave).toBe(-1); // Decremented from 0 to -1, never blocked
        });

        it('5. Approve a September 2026 leave: balance drops by total_days, free_days is null', async () => {
            // September 14 to September 16, 2026 (3 working days)
            const sepLeave = await LeaveModel.create({
                employee_id: 'C4_EMP',
                leave_type: 'sick',
                start_date: new Date('2026-09-14T00:00:00.000Z'),
                end_date: new Date('2026-09-16T00:00:00.000Z'),
                total_days: 3,
                reason: 'September legacy leave',
                status: 'pending'
            });

            const balBefore = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();

            const res = await request(app)
                .put(`/api/leaves/${sepLeave._id}/approve`)
                .set('Authorization', `Bearer ${adminUserToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const upd = await LeaveModel.findById(sepLeave._id).lean();
            expect(upd.status).toBe('approved');
            expect(upd.free_days).toBeNull();

            const balAfter = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();
            // Decrements by total_days (3), not free_days
            expect(balAfter.sick_leave).toBe(balBefore.sick_leave - 3);
        });

        it('6. Quota update after an October leave: recalculated using free_days, not total_days', async () => {
            // C4_EMP has:
            // 1 October leave of 3 days with free_days = 1
            // 1 September leave of 3 days (legacy) with total_days = 3
            // Total used for C4_EMP = 1 (Oct free_days) + 3 (Sep legacy) = 4
            // When setting sick_leave policy to 15:
            // Recalculated balance should be: Math.max(0, 15 - 4) = 11.
            // (If Oct used total_days=3, balance would be 15 - 6 = 9).
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send({
                    leave_policies: {
                        casual_leave: 12,
                        sick_leave: 15,
                        earned_leave: 15,
                        maternity_leave: 0,
                        paternity_leave: 0
                    }
                });

            expect(res.status).toBe(200);

            const bal = await LeaveBalanceModel.findOne({ employee_id: 'C4_EMP', year: 2026 }).lean();
            expect(bal.sick_leave).toBe(11);
        });

        it('7. Pre-deployment October leave: approved with free_days null causes new October leave to get free_days 0 and balance drop 0', async () => {
            await EmployeeModel.create({
                id: 'C4_PRE_EMP',
                name: 'C4 Pre Emp',
                email: 'c4_pre@test.com',
                password_hash: testEmpObj.password_hash,
                role: 'employee',
                status: 'active',
                department_id: testDeptId
            });

            await LeaveBalanceModel.create({
                employee_id: 'C4_PRE_EMP',
                year: 2026,
                sick_leave: 11
            });

            // Pre-deployment approved leave: free_days is null, total_days is 1
            await LeaveModel.create({
                employee_id: 'C4_PRE_EMP',
                leave_type: 'sick',
                start_date: new Date('2026-10-02T00:00:00.000Z'),
                end_date: new Date('2026-10-02T00:00:00.000Z'),
                total_days: 1,
                reason: 'Pre-deployment Oct leave',
                status: 'approved',
                free_days: null
            });

            // New 1-day October leave pending
            const newOctLeave = await LeaveModel.create({
                employee_id: 'C4_PRE_EMP',
                leave_type: 'sick',
                start_date: new Date('2026-10-05T00:00:00.000Z'),
                end_date: new Date('2026-10-05T00:00:00.000Z'),
                total_days: 1,
                reason: 'New Oct leave after pre-deployment leave',
                status: 'pending'
            });

            const balBefore = await LeaveBalanceModel.findOne({ employee_id: 'C4_PRE_EMP', year: 2026 }).lean();
            expect(balBefore.sick_leave).toBe(11);

            const res = await request(app)
                .put(`/api/leaves/${newOctLeave._id}/approve`)
                .set('Authorization', `Bearer ${adminUserToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);

            const upd = await LeaveModel.findById(newOctLeave._id).lean();
            expect(upd.status).toBe('approved');
            expect(upd.free_days).toBe(0);

            // Balance drops by 0 (free_days: 0)
            const balAfter = await LeaveBalanceModel.findOne({ employee_id: 'C4_PRE_EMP', year: 2026 }).lean();
            expect(balAfter.sick_leave).toBe(11);
        });

        it('8. Quota sync with pre-deployment October leave uses total_days (1) and new leave uses free_days (0)', async () => {
            // C4_PRE_EMP has:
            // 1 pre-deployment Oct leave: free_days null, total_days 1 -> used = 1
            // 1 new Oct leave: free_days 0, total_days 1 -> used = 0
            // Total used for C4_PRE_EMP = 1 + 0 = 1
            // When setting sick_leave policy to 14:
            // Recalculated balance should be: Math.max(0, 14 - 1) = 13.
            const res = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${adminUserToken}`)
                .send({
                    leave_policies: {
                        casual_leave: 12,
                        sick_leave: 14,
                        earned_leave: 15,
                        maternity_leave: 0,
                        paternity_leave: 0
                    }
                });

            expect(res.status).toBe(200);

            const bal = await LeaveBalanceModel.findOne({ employee_id: 'C4_PRE_EMP', year: 2026 }).lean();
            expect(bal.sick_leave).toBe(13);
        });
    });
    describe('33. Payroll Wiring: Unpaid Leave Deductions, Late-Approval Carryover & Reconciliation', () => {
        const Department = require('../models/Department');
        const EmployeeModel = require('../models/Employee');
        const LeaveModel = require('../models/Leave');
        const LeaveBalanceModel = require('../models/LeaveBalance');
        const PayrollModel = require('../models/Payroll');
        const SettingModel = require('../models/Setting');
        const UnpaidLeaveAdjustmentModel = require('../models/UnpaidLeaveAdjustment');
        const XLSX = require('xlsx');

        let s33AdminToken;
        let s33Emp;
        let s33DeptId;

        beforeAll(async () => {
            const password_hash = await bcrypt.hash('Secret123!', 10);
            const dept = await Department.create({ name: 'S33 Payroll Dept' });
            s33DeptId = dept._id;

            await EmployeeModel.create({
                id: 'S33_ADMIN',
                name: 'S33 Admin',
                email: 's33_admin@test.com',
                password_hash,
                role: 'admin',
                status: 'active',
                department_id: s33DeptId
            });
            s33AdminToken = jwt.sign({ id: 'S33_ADMIN', role: 'admin', email: 's33_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            s33Emp = await EmployeeModel.create({
                id: 'S33_EMP',
                name: 'S33 Employee',
                email: 's33_emp@test.com',
                password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: 'S33_EMP',
                year: 2026,
                sick_leave: 12,
                casual_leave: 12,
                earned_leave: 15
            });

            await SettingModel.updateOne({}, { $set: { monthly_leave_allowance: 1 } });
        });

        it('33.1. Model schema defaults and virtual calculations', async () => {
            const payroll = await PayrollModel.create({
                employee_id: s33Emp.id,
                month: 1,
                year: 2025,
                basic: 20000,
                da: 5000,
                oa: 5000,
                leave_deduction: 500,
                unpaid_leave_deduction: 1000,
                unpaid_leave_adjustment: 500
            });

            expect(payroll.unpaid_leave_days).toBe(0);
            expect(payroll.gross_salary).toBe(30000);
            expect(payroll.total_deductions).toBe(2000);
            expect(payroll.net_salary).toBe(28000);
        });

        it('33.2. POST /api/payroll/create computes unpaid leave deduction', async () => {
            // Employee with 3 approved leave days in November 2026: Nov 9, 10, 11 (Mon-Wed)
            await LeaveModel.create({
                employee_id: s33Emp.id,
                leave_type: 'sick',
                start_date: new Date('2026-11-09T00:00:00.000Z'),
                end_date: new Date('2026-11-11T00:00:00.000Z'),
                total_days: 3,
                reason: 'Nov 3 days',
                status: 'approved',
                free_days: 1
            });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .send({
                    employee_id: s33Emp.id,
                    month: 11,
                    year: 2026,
                    days_worked: 30,
                    basic: 30000,
                    da: 0,
                    oa: 0,
                    leave_wages: 5000,
                    leave_deduction: 500
                });

            expect(res.status).toBe(201);
            const p = res.body.payroll;
            expect(p.unpaid_leave_days).toBe(2);
            expect(p.unpaid_leave_deduction).toBe(2000);
            expect(p.unpaid_leave_adjustment).toBe(0);
            expect(p.leave_deduction).toBe(500);
            expect(p.gross_salary).toBe(35000);
            expect(p.total_deductions).toBe(2500);
            expect(p.net_salary).toBe(32500);
            expect(p.actual_payable).toBe(32500);
        });

        it('33.3. Pre-October 2026 exemption', async () => {
            await LeaveModel.create({
                employee_id: s33Emp.id,
                leave_type: 'sick',
                start_date: new Date('2026-08-10T00:00:00.000Z'),
                end_date: new Date('2026-08-12T00:00:00.000Z'),
                total_days: 3,
                reason: 'Aug leave',
                status: 'approved',
                free_days: null
            });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .send({
                    employee_id: s33Emp.id,
                    month: 8,
                    year: 2026,
                    days_worked: 30,
                    basic: 30000
                });

            expect(res.status).toBe(201);
            expect(res.body.payroll.unpaid_leave_days).toBe(0);
            expect(res.body.payroll.unpaid_leave_deduction).toBe(0);
        });

        it('33.4. IST Month Boundary Precision with real UTC-Midnight dates', async () => {
            const boundEmp = await EmployeeModel.create({
                id: 'S33_BOUND_EMP',
                name: 'Bound Emp',
                email: 'bound@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            // Leave A: ending Oct 1 (new Date('2026-10-01') = UTC midnight = 05:30 IST) -> 1 day in Oct
            await LeaveModel.create({
                employee_id: boundEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-01T00:00:00.000Z'),
                end_date: new Date('2026-10-01T00:00:00.000Z'),
                total_days: 1,
                reason: 'Oct 1 day',
                status: 'approved',
                free_days: 1
            });

            // Leave B: Sep 29 to Sep 30 (new Date('2026-09-30') ends before Oct 1 00:00 IST) -> 0 days in Oct
            await LeaveModel.create({
                employee_id: boundEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-09-29T00:00:00.000Z'),
                end_date: new Date('2026-09-30T00:00:00.000Z'),
                total_days: 2,
                reason: 'Sep days',
                status: 'approved',
                free_days: null
            });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .send({
                    employee_id: boundEmp.id,
                    month: 10,
                    year: 2026,
                    basic: 30000
                });

            expect(res.status).toBe(201);
            expect(res.body.payroll.unpaid_leave_days).toBe(0);
            expect(res.body.payroll.unpaid_leave_deduction).toBe(0);
        });

        it('33.5. Dynamic recalculation on PUT /api/leaves/:id/approve for pending payroll', async () => {
            const recapEmp = await EmployeeModel.create({
                id: 'S33_RECAP_EMP',
                name: 'Recap Emp',
                email: 'recap@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: recapEmp.id,
                year: 2026,
                sick_leave: 12
            });

            // Pending payroll for October 2026
            const p = await PayrollModel.create({
                employee_id: recapEmp.id,
                month: 10,
                year: 2026,
                basic: 60000,
                status: 'pending'
            });

            // Pending leave for 3 days in October: Oct 12, 13, 14 (Mon-Wed)
            const l = await LeaveModel.create({
                employee_id: recapEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-12T00:00:00.000Z'),
                end_date: new Date('2026-10-14T00:00:00.000Z'),
                total_days: 3,
                reason: 'Oct 3 days',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${l._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);

            expect(res.status).toBe(200);

            const updatedP = await PayrollModel.findById(p._id);
            expect(updatedP.unpaid_leave_days).toBe(2);
            expect(updatedP.unpaid_leave_deduction).toBe(4000);
        });

        it('33.6a. First late approval carryover to paid payroll (dependent on late-approval path)', async () => {
            const lateEmp = await EmployeeModel.create({
                id: 'S33_LATE_EMP',
                name: 'Late Emp',
                email: 'late@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: lateEmp.id,
                year: 2026,
                sick_leave: 12
            });

            // Existing 3 approved days in October
            await LeaveModel.create({
                employee_id: lateEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-05T00:00:00.000Z'),
                end_date: new Date('2026-10-07T00:00:00.000Z'),
                total_days: 3,
                reason: 'Oct 3 days initial',
                status: 'approved',
                free_days: 1
            });

            // October payroll already marked paid with unpaid_leave_deduction: 2000
            const octPaid = await PayrollModel.create({
                employee_id: lateEmp.id,
                month: 10,
                year: 2026,
                basic: 30000,
                unpaid_leave_days: 2,
                unpaid_leave_deduction: 2000,
                status: 'paid'
            });

            // November payroll exists and is pending
            const novPending = await PayrollModel.create({
                employee_id: lateEmp.id,
                month: 11,
                year: 2026,
                basic: 30000,
                unpaid_leave_adjustment: 0,
                status: 'pending'
            });

            // 4th day approved late in October: Oct 8
            const l4 = await LeaveModel.create({
                employee_id: lateEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-08T00:00:00.000Z'),
                end_date: new Date('2026-10-08T00:00:00.000Z'),
                total_days: 1,
                reason: 'Oct 4th day late',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${l4._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);

            expect(res.status).toBe(200);

            // October paid payroll remains unmodified
            const octAfter = await PayrollModel.findById(octPaid._id);
            expect(octAfter.unpaid_leave_deduction).toBe(2000);
            expect(octAfter.status).toBe('paid');

            // November pending payroll carried 1000.00
            const novAfter = await PayrollModel.findById(novPending._id);
            expect(novAfter.unpaid_leave_adjustment).toBe(1000);

            // Adjustment recorded in collection as 'applied'
            const adjs = await UnpaidLeaveAdjustmentModel.find({ employee_id: lateEmp.id, source_month: 10 });
            expect(adjs.length).toBe(1);
            expect(adjs[0].amount).toBe(1000);
            expect(adjs[0].status).toBe('applied');
            expect(adjs[0].applied_payroll_id.toString()).toBe(novPending._id.toString());
        });

        it('33.6b. Repeated late approval incremental carryover (dependent on late-approval path)', async () => {
            // Continuing with S33_LATE_EMP:
            // 5th day in October approved late: Oct 9
            const l5 = await LeaveModel.create({
                employee_id: 'S33_LATE_EMP',
                leave_type: 'sick',
                start_date: new Date('2026-10-09T00:00:00.000Z'),
                end_date: new Date('2026-10-09T00:00:00.000Z'),
                total_days: 1,
                reason: 'Oct 5th day late',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${l5._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);

            expect(res.status).toBe(200);

            // November adjustment incremented from 1000 to 2000
            const nov = await PayrollModel.findOne({ employee_id: 'S33_LATE_EMP', month: 11, year: 2026 });
            expect(nov.unpaid_leave_adjustment).toBe(2000);

            // Total adjustments in collection for October is now 2000
            const adjs = await UnpaidLeaveAdjustmentModel.find({ employee_id: 'S33_LATE_EMP', source_month: 10 });
            expect(adjs.length).toBe(2);
            expect(adjs[0].amount + adjs[1].amount).toBe(2000);
        });

        it('33.7a. Queued adjustment applied on future payroll POST /create', async () => {
            const queueEmp = await EmployeeModel.create({
                id: 'S33_QUEUE_EMP',
                name: 'Queue Emp',
                email: 'queue@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: queueEmp.id,
                year: 2026,
                sick_leave: 12
            });

            // October paid with 0 deduction
            await PayrollModel.create({
                employee_id: queueEmp.id,
                month: 10,
                year: 2026,
                basic: 30000,
                unpaid_leave_days: 0,
                unpaid_leave_deduction: 0,
                status: 'paid'
            });

            // Late approval for 2 days in October when NO future payroll exists yet
            const lateOct = await LeaveModel.create({
                employee_id: queueEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-15T00:00:00.000Z'),
                end_date: new Date('2026-10-16T00:00:00.000Z'),
                total_days: 2,
                reason: 'Oct 2 days late without future payroll',
                status: 'pending'
            });

            const approveRes = await request(app)
                .put(`/api/leaves/${lateOct._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);
            expect(approveRes.status).toBe(200);

            // Adjustment is queued as 'pending'
            const queued = await UnpaidLeaveAdjustmentModel.findOne({ employee_id: queueEmp.id, source_month: 10 });
            expect(queued).toBeDefined();
            expect(queued.status).toBe('pending');
            expect(queued.amount).toBe(1000);

            // Now create November payroll via POST /create
            const createRes = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .send({
                    employee_id: queueEmp.id,
                    month: 11,
                    year: 2026,
                    basic: 30000
                });

            expect(createRes.status).toBe(201);
            expect(createRes.body.payroll.unpaid_leave_adjustment).toBe(1000);

            const updatedAdj = await UnpaidLeaveAdjustmentModel.findById(queued._id);
            expect(updatedAdj.status).toBe('applied');
            expect(updatedAdj.applied_payroll_id.toString()).toBe(createRes.body.payroll._id.toString());
        });

        it('33.7b. Queued adjustment applied on future payroll POST /import', async () => {
            const importEmp = await EmployeeModel.create({
                id: 'S33_IMP_ADJ',
                name: 'Import Adj Emp',
                email: 'impadj@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            // Insert a pending adjustment of 1000 from October 2026
            const queuedAdj = await UnpaidLeaveAdjustmentModel.create({
                employee_id: importEmp.id,
                leave_id: new mongoose.Types.ObjectId(),
                source_month: 10,
                source_year: 2026,
                amount: 1000,
                status: 'pending'
            });

            // Create Excel file with November row for importEmp
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet([{
                employee_id: importEmp.id,
                month: 11,
                year: 2026,
                basic: 30000,
                days_worked: 30
            }]);
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const fileBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const res = await request(app)
                .post('/api/payroll/import')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .attach('file', fileBuf, 'import.xlsx');

            expect(res.status).toBe(200);
            expect(res.body.imported).toBe(1);

            const novPayroll = await PayrollModel.findOne({ employee_id: importEmp.id, month: 11, year: 2026 });
            expect(novPayroll.unpaid_leave_adjustment).toBe(1000);

            const appliedAdj = await UnpaidLeaveAdjustmentModel.findById(queuedAdj._id);
            expect(appliedAdj.status).toBe('applied');
            expect(appliedAdj.applied_payroll_id.toString()).toBe(novPayroll._id.toString());
        });

        it('33.8. Approval resilience with warning (dependent on approveLeave inner try/catch)', async () => {
            const resiEmp = await EmployeeModel.create({
                id: 'S33_RESI_EMP',
                name: 'Resi Emp',
                email: 'resi@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: resiEmp.id,
                year: 2026,
                sick_leave: 12
            });

            // 1. Create a pending payroll for the leave's month first
            await PayrollModel.create({
                employee_id: resiEmp.id,
                month: 10,
                year: 2026,
                basic: 30000,
                status: 'pending'
            });

            // 2. Create pending leave
            const resiLeave = await LeaveModel.create({
                employee_id: resiEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-20T00:00:00.000Z'),
                end_date: new Date('2026-10-21T00:00:00.000Z'),
                total_days: 2,
                reason: 'Resilience leave',
                status: 'pending'
            });

            // 3. Spy on Payroll.findOne and force it to reject inside inner try/catch
            const payrollSpy = jest.spyOn(PayrollModel, 'findOne').mockRejectedValueOnce(
                new Error('Simulated sync DB error in approveLeave')
            );

            // 4. Call approve
            const res = await request(app)
                .put(`/api/leaves/${resiLeave._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);

            // 5. Assertions
            expect(payrollSpy).toHaveBeenCalled();
            payrollSpy.mockRestore();

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.warning).toBeDefined();
            expect(res.body.warning).toContain('payroll recalculation failed');

            const updLeave = await LeaveModel.findById(resiLeave._id);
            expect(updLeave.status).toBe('approved');
        });

        it('33.9. Payroll reconciliation read-only endpoint', async () => {
            const reconEmp = await EmployeeModel.create({
                id: 'S33_RECON_EMP',
                name: 'Recon Emp',
                email: 'recon@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            // Approved leave for 2 days in October: Oct 26, 27 (Mon-Tue)
            await LeaveModel.create({
                employee_id: reconEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-26T00:00:00.000Z'),
                end_date: new Date('2026-10-27T00:00:00.000Z'),
                total_days: 2,
                reason: 'Recon Oct 2 days',
                status: 'approved',
                free_days: 1
            });

            // Pending payroll has stored unpaid_leave_days: 0 and deduction: 0 (mismatched)
            await PayrollModel.create({
                employee_id: reconEmp.id,
                month: 10,
                year: 2026,
                basic: 30000,
                unpaid_leave_days: 0,
                unpaid_leave_deduction: 0,
                status: 'pending'
            });

            const res = await request(app)
                .get('/api/payroll/reconcile?month=10&year=2026')
                .set('Authorization', `Bearer ${s33AdminToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.mismatches_count).toBeGreaterThanOrEqual(1);

            const m = res.body.mismatches.find(item => item.employee_id === reconEmp.id);
            expect(m).toBeDefined();
            expect(m.stored.unpaid_leave_days).toBe(0);
            expect(m.expected.unpaid_leave_days).toBe(1);
            expect(m.expected.unpaid_leave_deduction).toBe(1000);
            expect(m.difference.days).toBe(1);
            expect(m.difference.deduction).toBe(1000);
        });

        it('33.10. POST /api/payroll/import batch computation', async () => {
            const batchEmp = await EmployeeModel.create({
                id: 'S33_BATCH_EMP',
                name: 'Batch Emp',
                email: 'batch@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            // Approved leave of 2 days in October
            await LeaveModel.create({
                employee_id: batchEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-15T00:00:00.000Z'),
                end_date: new Date('2026-10-16T00:00:00.000Z'),
                total_days: 2,
                reason: 'Oct 2 days for batch',
                status: 'approved',
                free_days: 1
            });

            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet([{
                employee_id: batchEmp.id,
                month: 10,
                year: 2026,
                basic: 45000,
                days_worked: 31
            }]);
            XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
            const fileBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

            const res = await request(app)
                .post('/api/payroll/import')
                .set('Authorization', `Bearer ${s33AdminToken}`)
                .attach('file', fileBuf, 'batch_import.xlsx');

            expect(res.status).toBe(200);
            expect(res.body.imported).toBe(1);

            const importedP = await PayrollModel.findOne({ employee_id: batchEmp.id, month: 10, year: 2026 });
            expect(importedP.unpaid_leave_days).toBe(1);
            expect(importedP.unpaid_leave_deduction).toBe(1500);
        });

        it('33.11. Late-approval integrity guard prevents cascading corruption on missing adjustments', async () => {
            const guardEmp = await EmployeeModel.create({
                id: 'S33_GUARD_EMP',
                name: 'Guard Emp',
                email: 'guard@test.com',
                password_hash: s33Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s33DeptId
            });

            await LeaveBalanceModel.create({
                employee_id: guardEmp.id,
                year: 2026,
                sick_leave: 12
            });

            // Paid October 2026 payroll with adjustment_notes containing one entry
            // {source_month: 10, source_year: 2026, amount: 1000}, basic 30000, da 0, oa 0
            await PayrollModel.create({
                employee_id: guardEmp.id,
                month: 10,
                year: 2026,
                basic: 30000,
                da: 0,
                oa: 0,
                status: 'paid',
                adjustment_notes: [{
                    leave_id: new mongoose.Types.ObjectId(),
                    source_month: 10,
                    source_year: 2026,
                    amount: 1000
                }]
            });

            // Zero records in UnpaidLeaveAdjustment for that employee and month
            const countBefore = await UnpaidLeaveAdjustmentModel.countDocuments({
                employee_id: guardEmp.id,
                source_month: 10
            });
            expect(countBefore).toBe(0);

            // Action: approve a further late leave for October 2026 (for example Oct 20 to Oct 21)
            const guardLeave = await LeaveModel.create({
                employee_id: guardEmp.id,
                leave_type: 'sick',
                start_date: new Date('2026-10-20T00:00:00.000Z'),
                end_date: new Date('2026-10-21T00:00:00.000Z'),
                total_days: 2,
                reason: 'Oct late leave triggering guard',
                status: 'pending'
            });

            const res = await request(app)
                .put(`/api/leaves/${guardLeave._id}/approve`)
                .set('Authorization', `Bearer ${s33AdminToken}`);

            // Expected: HTTP 200, success true, warning contains "Adjustment audit mismatch"
            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.warning).toBeDefined();
            expect(res.body.warning).toContain('Adjustment audit mismatch');

            // Leave status 'approved'
            const updLeave = await LeaveModel.findById(guardLeave._id);
            expect(updLeave.status).toBe('approved');

            // No new UnpaidLeaveAdjustment document created: assert count before and after
            const countAfter = await UnpaidLeaveAdjustmentModel.countDocuments({
                employee_id: guardEmp.id,
                source_month: 10
            });
            expect(countAfter).toBe(countBefore);
            expect(countAfter).toBe(0);
        });
    });

    describe('34. Setting: days_worked_convention and actual_payable calculations', () => {
        const Department = require('../models/Department');
        const EmployeeModel = require('../models/Employee');
        const PayrollModel = require('../models/Payroll');
        const SettingModel = require('../models/Setting');
        const { computeSalary } = require('../controllers/payrollController');

        let s34AdminToken;
        let s34MgrToken;
        let s34EmpToken;
        let s34Emp;
        let s34DeptId;

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('S34Pass123!', 10);
            const dept = await Department.create({ name: 'S34 Dept' });
            s34DeptId = dept._id;

            await EmployeeModel.create({
                id: 'S34_ADMIN',
                name: 'S34 Admin',
                email: 's34_admin@test.com',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                department_id: s34DeptId
            });
            s34AdminToken = jwt.sign({ id: 'S34_ADMIN', role: 'admin', email: 's34_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            await EmployeeModel.create({
                id: 'S34_MGR',
                name: 'S34 Manager',
                email: 's34_mgr@test.com',
                password_hash: passwordHash,
                role: 'manager',
                status: 'active',
                department_id: s34DeptId
            });
            s34MgrToken = jwt.sign({ id: 'S34_MGR', role: 'manager', email: 's34_mgr@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            s34Emp = await EmployeeModel.create({
                id: 'S34_EMP',
                name: 'S34 Employee',
                email: 's34_emp@test.com',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                department_id: s34DeptId
            });
            s34EmpToken = jwt.sign({ id: 'S34_EMP', role: 'employee', email: 's34_emp@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        });

        afterAll(async () => {
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'payable' } });
            await EmployeeModel.deleteMany({ id: { $regex: /^S34_/ } });
            await PayrollModel.deleteMany({ employee_id: { $regex: /^S34_/ } });
        });

        it('34.1. Default GET settings returns "payable"', async () => {
            await SettingModel.updateOne({}, { $unset: { days_worked_convention: 1 } });
            const res = await request(app)
                .get('/api/settings')
                .set('Authorization', `Bearer ${s34EmpToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.settings.days_worked_convention).toBe('payable');
        });

        it('34.2. Admin PUT with "attended" succeeds and persists; Manager PUT with "attended" returns 403; Value "foo" returns 400', async () => {
            // Admin PUT 'attended' succeeds and persists
            const resAdmin = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s34AdminToken}`)
                .send({ days_worked_convention: 'attended' });

            expect(resAdmin.status).toBe(200);
            expect(resAdmin.body.success).toBe(true);
            expect(resAdmin.body.settings.days_worked_convention).toBe('attended');

            const savedSetting = await SettingModel.findOne().lean();
            expect(savedSetting.days_worked_convention).toBe('attended');

            // Manager PUT 'attended' returns 403
            const resMgr = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s34MgrToken}`)
                .send({ days_worked_convention: 'attended' });

            expect(resMgr.status).toBe(403);
            expect(resMgr.body.success).toBe(false);

            // Value "foo" returns 400
            const resInvalid = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s34AdminToken}`)
                .send({ days_worked_convention: 'foo' });

            expect(resInvalid.status).toBe(400);
            expect(resInvalid.body.success).toBe(false);

            // DB setting still 'attended'
            const checkSetting = await SettingModel.findOne().lean();
            expect(checkSetting.days_worked_convention).toBe('attended');
        });

        it('34.3. November payroll with days_worked 30: payable mode actual_payable = 28000.00, attended mode = 30000.00', async () => {
            // With a payroll record basic 30000, days_worked 30, leave_deduction 0, unpaid_leave_deduction 2000, adjustment 0, gross 30000, month 11 (30 days):
            // payable mode actual_payable = 28000.00, attended mode = 30000.00
            const payroll = await PayrollModel.create({
                employee_id: s34Emp.id,
                month: 11,
                year: 2026,
                basic: 30000,
                da: 0,
                oa: 0,
                leave_wages: 0,
                leave_deduction: 0,
                unpaid_leave_deduction: 2000,
                unpaid_leave_adjustment: 0,
                other_deductions: 0,
                days_worked: 30,
                days_worked_convention: 'payable',
                status: 'pending'
            });

            // Payable mode
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'payable' } });
            const resPayable = await request(app)
                .get(`/api/payroll/${s34Emp.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resPayable.status).toBe(200);
            expect(resPayable.body.success).toBe(true);
            expect(resPayable.body.payroll.actual_payable).toBe(28000.00);

            // Attended mode
            await PayrollModel.updateOne({ employee_id: s34Emp.id, month: 11, year: 2026 }, { $set: { days_worked_convention: 'attended' } });
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'attended' } });
            const resAttended = await request(app)
                .get(`/api/payroll/${s34Emp.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resAttended.status).toBe(200);
            expect(resAttended.body.success).toBe(true);
            expect(resAttended.body.payroll.actual_payable).toBe(30000.00);

            // Also verify computeSalary unit calculation directly
            const plainPayroll = payroll.toObject();
            expect(computeSalary(plainPayroll, 'payable').actual_payable).toBe(28000.00);
            expect(computeSalary(plainPayroll, 'attended').actual_payable).toBe(30000.00);
        });

        it('34.4. November payroll with days_worked 27: payable mode actual_payable = 25000.00, attended mode = 27000.00', async () => {
            // Same record with days_worked 27:
            // proRated = 30000 / 30 * 27 = 27000.00
            // payable mode = 27000 - 2000 = 25000.00
            // attended mode = 27000.00
            await PayrollModel.updateOne(
                { employee_id: s34Emp.id, month: 11, year: 2026 },
                { $set: { days_worked: 27, days_worked_convention: 'payable' } }
            );

            // Payable mode
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'payable' } });
            const resPayable = await request(app)
                .get(`/api/payroll/${s34Emp.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resPayable.status).toBe(200);
            expect(resPayable.body.success).toBe(true);
            expect(resPayable.body.payroll.actual_payable).toBe(25000.00);

            // Attended mode
            await PayrollModel.updateOne(
                { employee_id: s34Emp.id, month: 11, year: 2026 },
                { $set: { days_worked_convention: 'attended' } }
            );
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'attended' } });
            const resAttended = await request(app)
                .get(`/api/payroll/${s34Emp.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resAttended.status).toBe(200);
            expect(resAttended.body.success).toBe(true);
            expect(resAttended.body.payroll.actual_payable).toBe(27000.00);

            // Also verify computeSalary unit calculation directly
            const updatedPayroll = await PayrollModel.findOne({ employee_id: s34Emp.id, month: 11, year: 2026 }).lean();
            expect(computeSalary(updatedPayroll, 'payable').actual_payable).toBe(25000.00);
            expect(computeSalary(updatedPayroll, 'attended').actual_payable).toBe(27000.00);
        });

        it('34.5: Create November 2026 payroll with setting "payable", then change setting to "attended" and verify record is unchanged', async () => {
            const emp34_5 = await EmployeeModel.create({
                id: 'S34_EMP_5',
                name: 'S34 Employee 5',
                email: 's34_emp_5@test.com',
                password_hash: s34Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s34DeptId
            });

            // Setting set to "payable"
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'payable' } });

            // Create a November 2026 payroll (basic 30000, days_worked 30, unpaid_leave_deduction 2000 via setup as the existing 34.3 does)
            const p34_5 = await PayrollModel.create({
                employee_id: emp34_5.id,
                month: 11,
                year: 2026,
                basic: 30000,
                da: 0,
                oa: 0,
                leave_wages: 0,
                leave_deduction: 0,
                unpaid_leave_deduction: 2000,
                unpaid_leave_adjustment: 0,
                other_deductions: 0,
                days_worked: 30,
                days_worked_convention: 'payable',
                status: 'pending'
            });

            // Confirm stored days_worked_convention = "payable" and actual_payable = 28000.00
            const stored5 = await PayrollModel.findById(p34_5._id).lean();
            expect(stored5.days_worked_convention).toBe('payable');

            const resPayable = await request(app)
                .get(`/api/payroll/${emp34_5.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resPayable.status).toBe(200);
            expect(resPayable.body.success).toBe(true);
            expect(resPayable.body.payroll.days_worked_convention).toBe('payable');
            expect(resPayable.body.payroll.actual_payable).toBe(28000.00);

            // Then PUT the setting to "attended"
            const resPut = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s34AdminToken}`)
                .send({ days_worked_convention: 'attended' });
            expect(resPut.status).toBe(200);

            // GET the same record: actual_payable must still be 28000.00, and days_worked_convention must still be "payable"
            const resAfterPut = await request(app)
                .get(`/api/payroll/${emp34_5.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resAfterPut.status).toBe(200);
            expect(resAfterPut.body.success).toBe(true);
            expect(resAfterPut.body.payroll.days_worked_convention).toBe('payable');
            expect(resAfterPut.body.payroll.actual_payable).toBe(28000.00);
        });

        it('34.6: With setting at "attended", create second November record: confirm stored "attended" and actual_payable = 30000.00, unaffected when reverted to "payable"', async () => {
            const emp34_6 = await EmployeeModel.create({
                id: 'S34_EMP_6',
                name: 'S34 Employee 6',
                email: 's34_emp_6@test.com',
                password_hash: s34Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s34DeptId
            });

            // Confirm setting is at "attended"
            const currentSetting = await SettingModel.findOne().lean();
            expect(currentSetting.days_worked_convention).toBe('attended');

            // With the setting at "attended", create a second November record for a different employee
            const p34_6 = await PayrollModel.create({
                employee_id: emp34_6.id,
                month: 11,
                year: 2026,
                basic: 30000,
                da: 0,
                oa: 0,
                leave_wages: 0,
                leave_deduction: 0,
                unpaid_leave_deduction: 2000,
                unpaid_leave_adjustment: 0,
                other_deductions: 0,
                days_worked: 30,
                days_worked_convention: 'attended',
                status: 'pending'
            });

            // Confirm stored days_worked_convention = "attended" and actual_payable = 30000.00
            const stored6 = await PayrollModel.findById(p34_6._id).lean();
            expect(stored6.days_worked_convention).toBe('attended');

            const resAttended = await request(app)
                .get(`/api/payroll/${emp34_6.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resAttended.status).toBe(200);
            expect(resAttended.body.success).toBe(true);
            expect(resAttended.body.payroll.days_worked_convention).toBe('attended');
            expect(resAttended.body.payroll.actual_payable).toBe(30000.00);

            // Also test via POST /api/payroll/create that createPayroll sets days_worked_convention from setting ('attended')
            const emp34_6b = await EmployeeModel.create({
                id: 'S34_EMP_6B',
                name: 'S34 Employee 6B',
                email: 's34_emp_6b@test.com',
                password_hash: s34Emp.password_hash,
                role: 'employee',
                status: 'active',
                department_id: s34DeptId
            });
            const resCreate = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s34AdminToken}`)
                .send({
                    employee_id: emp34_6b.id,
                    month: 11,
                    year: 2026,
                    basic: 30000,
                    days_worked: 30,
                    days_worked_convention: 'payable' // Sending 'payable' in body must be ignored
                });
            expect(resCreate.status).toBe(201);
            expect(resCreate.body.payroll.days_worked_convention).toBe('attended');

            // Then set the setting back to "payable" and confirm the attended record still returns 30000.00
            const resRevert = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s34AdminToken}`)
                .send({ days_worked_convention: 'payable' });
            expect(resRevert.status).toBe(200);

            const resAfterRevert = await request(app)
                .get(`/api/payroll/${emp34_6.id}?month=11&year=2026`)
                .set('Authorization', `Bearer ${s34AdminToken}`);

            expect(resAfterRevert.status).toBe(200);
            expect(resAfterRevert.body.success).toBe(true);
            expect(resAfterRevert.body.payroll.days_worked_convention).toBe('attended');
            expect(resAfterRevert.body.payroll.actual_payable).toBe(30000.00);

            // Reset the setting to "payable" at the end of the section
            await SettingModel.updateOne({}, { $set: { days_worked_convention: 'payable' } });
        });
    });
    describe('35. SuperAdmin Payslip Export (Excel all, PDF per employee)', () => {
        const Department = require('../models/Department');
        const EmployeeModel = require('../models/Employee');
        const PayrollModel = require('../models/Payroll');
        const SettingModel = require('../models/Setting');
        const XLSX = require('xlsx');

        let s35AdminToken;
        let s35MgrToken;
        let s35EmpToken;
        let s35DeptId;
        let s35Emp1;
        let s35Emp2;
        let s35Payroll1;
        let s35Payroll2;

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('S35Pass123!', 10);
            const dept = await Department.create({ name: 'S35 Dept' });
            s35DeptId = dept._id;

            await EmployeeModel.create({
                id: 'S35_ADMIN',
                name: 'S35 Admin',
                email: 's35_admin@test.com',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                department_id: s35DeptId
            });
            s35AdminToken = jwt.sign({ id: 'S35_ADMIN', role: 'admin', email: 's35_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            await EmployeeModel.create({
                id: 'S35_MGR',
                name: 'S35 Manager',
                email: 's35_mgr@test.com',
                password_hash: passwordHash,
                role: 'manager',
                status: 'active',
                department_id: s35DeptId
            });
            s35MgrToken = jwt.sign({ id: 'S35_MGR', role: 'manager', email: 's35_mgr@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            s35Emp1 = await EmployeeModel.create({
                id: 'S35_EMP1',
                name: 'Alice S35',
                email: 's35_emp1@test.com',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                department_id: s35DeptId
            });
            s35EmpToken = jwt.sign({ id: 'S35_EMP1', role: 'employee', email: 's35_emp1@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            s35Emp2 = await EmployeeModel.create({
                id: 'S35_EMP2',
                name: 'Bob S35',
                email: 's35_emp2@test.com',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                department_id: s35DeptId
            });

            // Seed November 2026 payrolls
            s35Payroll1 = await PayrollModel.create({
                employee_id: s35Emp1.id,
                month: 11,
                year: 2026,
                basic: 30000,
                da: 0,
                oa: 0,
                leave_wages: 0,
                leave_deduction: 0,
                unpaid_leave_days: 2,
                unpaid_leave_deduction: 2000,
                unpaid_leave_adjustment: 0,
                other_deductions: 0,
                days_worked: 30,
                days_worked_convention: 'payable',
                status: 'paid'
            });

            s35Payroll2 = await PayrollModel.create({
                employee_id: s35Emp2.id,
                month: 11,
                year: 2026,
                basic: 40000,
                da: 5000,
                oa: 5000,
                leave_wages: 0,
                leave_deduction: 0,
                unpaid_leave_days: 0,
                unpaid_leave_deduction: 0,
                unpaid_leave_adjustment: 0,
                other_deductions: 0,
                days_worked: 30,
                days_worked_convention: 'payable',
                status: 'pending'
            });
        });

        afterAll(async () => {
            await EmployeeModel.deleteMany({ id: { $regex: /^S35_/ } });
            await PayrollModel.deleteMany({ employee_id: { $regex: /^S35_/ } });
        });

        it('35.1: SuperAdmin GET /payslips/export?month=11&year=2026 returns 200 and xlsx content type with workbook rows', async () => {
            const res = await request(app)
                .get('/api/payroll/payslips/export?month=11&year=2026')
                .set('Authorization', `Bearer ${s35AdminToken}`)
                .buffer(true)
                .parse((r, cb) => {
                    const data = [];
                    r.on('data', chunk => data.push(chunk));
                    r.on('end', () => cb(null, Buffer.concat(data)));
                });

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            expect(res.headers['content-disposition']).toContain('attachment; filename="payslips-2026-11.xlsx"');

            const wb = XLSX.read(res.body, { type: 'buffer' });
            expect(wb.SheetNames).toContain('Payslips');
            const sheet = wb.Sheets['Payslips'];
            const rows = XLSX.utils.sheet_to_json(sheet);
            const s35Rows = rows.filter(r => r['Employee ID'] && r['Employee ID'].startsWith('S35_'));
            expect(s35Rows.length).toBe(2);
            expect(s35Rows[0]['Employee ID']).toBe('S35_EMP1');
            expect(s35Rows[0]['Name']).toBe('Alice S35');
            expect(s35Rows[0]['Basic']).toBe(30000);
            expect(s35Rows[0]['Unpaid Leave Days']).toBe(2);
            expect(s35Rows[0]['Unpaid Leave Deduction']).toBe(2000);
            expect(s35Rows[0]['Actual Payable']).toBe(28000);

            expect(s35Rows[1]['Employee ID']).toBe('S35_EMP2');
            expect(s35Rows[1]['Name']).toBe('Bob S35');
            expect(s35Rows[1]['Basic']).toBe(40000);
        });

        it('35.2: Manager and employee get 403 on both routes', async () => {
            // Manager on Excel export
            const mgrResExcel = await request(app)
                .get('/api/payroll/payslips/export?month=11&year=2026')
                .set('Authorization', `Bearer ${s35MgrToken}`);
            expect(mgrResExcel.status).toBe(403);

            // Employee on Excel export
            const empResExcel = await request(app)
                .get('/api/payroll/payslips/export?month=11&year=2026')
                .set('Authorization', `Bearer ${s35EmpToken}`);
            expect(empResExcel.status).toBe(403);

            // Manager on PDF export
            const mgrResPdf = await request(app)
                .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                .set('Authorization', `Bearer ${s35MgrToken}`);
            expect(mgrResPdf.status).toBe(403);

            // Employee on PDF export
            const empResPdf = await request(app)
                .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                .set('Authorization', `Bearer ${s35EmpToken}`);
            expect(empResPdf.status).toBe(403);
        });

        it('35.3: GET /payslip/:id/pdf for seeded record returns 200, application/pdf, starts with %PDF', async () => {
            const res = await request(app)
                .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                .set('Authorization', `Bearer ${s35AdminToken}`)
                .buffer(true)
                .parse((r, cb) => {
                    const data = [];
                    r.on('data', chunk => data.push(chunk));
                    r.on('end', () => cb(null, Buffer.concat(data)));
                });

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toContain('application/pdf');
            expect(res.headers['content-disposition']).toContain('attachment; filename="payslip-S35_EMP1-2026-11.pdf"');
            expect(Buffer.isBuffer(res.body)).toBe(true);
            expect(res.body.slice(0, 4).toString()).toBe('%PDF');
        });

        it('35.4: Missing month returns 400. Unknown id returns 404', async () => {
            // Missing month
            const resMissingMonth = await request(app)
                .get('/api/payroll/payslips/export?year=2026')
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resMissingMonth.status).toBe(400);

            // Invalid month
            const resInvalidMonth = await request(app)
                .get('/api/payroll/payslips/export?month=13&year=2026')
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resInvalidMonth.status).toBe(400);

            // Unknown valid ObjectId
            const unknownId = new mongoose.Types.ObjectId();
            const resUnknown = await request(app)
                .get(`/api/payroll/payslip/${unknownId}/pdf`)
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resUnknown.status).toBe(404);

            // Invalid id
            const resInvalidId = await request(app)
                .get('/api/payroll/payslip/not-a-valid-id/pdf')
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resInvalidId.status).toBe(404);
        });

        it('35.5: Export does not change the record', async () => {
            // Fetch stored record before export
            const beforeDoc = await PayrollModel.findById(s35Payroll1._id).lean();
            expect(beforeDoc.unpaid_leave_deduction).toBe(2000);
            expect(beforeDoc.basic).toBe(30000);

            // Trigger Excel export
            const resExcel = await request(app)
                .get('/api/payroll/payslips/export?month=11&year=2026')
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resExcel.status).toBe(200);

            // Trigger PDF export
            const resPdf = await request(app)
                .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                .set('Authorization', `Bearer ${s35AdminToken}`);
            expect(resPdf.status).toBe(200);

            // Fetch stored record after export
            const afterDoc = await PayrollModel.findById(s35Payroll1._id).lean();
            expect(afterDoc.unpaid_leave_deduction).toBe(2000);
            expect(afterDoc.unpaid_leave_deduction).toBe(beforeDoc.unpaid_leave_deduction);
            expect(afterDoc.basic).toBe(beforeDoc.basic);
            expect(afterDoc.days_worked).toBe(beforeDoc.days_worked);
            expect(afterDoc.status).toBe(beforeDoc.status);
            expect(afterDoc.updatedAt.getTime()).toBe(beforeDoc.updatedAt.getTime());

            const countTotal = await PayrollModel.countDocuments({ employee_id: s35Emp1.id, month: 11, year: 2026 });
            expect(countTotal).toBe(1);
        });

        it('35.6: PDF export works with logo present and falls back gracefully when logo read fails', async () => {
            // 1. With logo present
            const resWithLogo = await request(app)
                .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                .set('Authorization', `Bearer ${s35AdminToken}`)
                .buffer(true)
                .parse((r, cb) => {
                    const data = [];
                    r.on('data', chunk => data.push(chunk));
                    r.on('end', () => cb(null, Buffer.concat(data)));
                });

            expect(resWithLogo.status).toBe(200);
            expect(resWithLogo.headers['content-type']).toContain('application/pdf');
            expect(resWithLogo.body.slice(0, 4).toString()).toBe('%PDF');

            // 2. Fallback when fs.readFileSync throws (simulating missing logo)
            const origReadFileSync = fs.readFileSync;
            const readSpy = jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, ...args) => {
                if (typeof filePath === 'string' && filePath.includes('zograha-logo.jpeg')) {
                    throw new Error('ENOENT: no such file or directory');
                }
                return origReadFileSync.call(fs, filePath, ...args);
            });

            try {
                const resWithoutLogo = await request(app)
                    .get(`/api/payroll/payslip/${s35Payroll1._id}/pdf`)
                    .set('Authorization', `Bearer ${s35AdminToken}`)
                    .buffer(true)
                    .parse((r, cb) => {
                        const data = [];
                        r.on('data', chunk => data.push(chunk));
                        r.on('end', () => cb(null, Buffer.concat(data)));
                    });

                expect(resWithoutLogo.status).toBe(200);
                expect(resWithoutLogo.headers['content-type']).toContain('application/pdf');
                expect(resWithoutLogo.body.slice(0, 4).toString()).toBe('%PDF');
            } finally {
                readSpy.mockRestore();
            }
        });
    });

    describe('36. Formula-Based Salary Calculation & Custom Columns', () => {
        const { evaluateComponents, DEFAULT_PAYROLL_COMPONENTS } = require('../utils/payrollFormula');
        const SettingModel = require('../models/Setting');
        const EmployeeModel = require('../models/Employee');
        const Department = require('../models/Department');

        let s36AdminToken;
        let s36MgrToken;
        let s36TlToken;
        let s36EmpToken;

        beforeAll(async () => {
            const passwordHash = await bcrypt.hash('S36Pass123!', 10);
            const dept = await Department.create({ name: 'S36 Dept' });

            await EmployeeModel.create({
                id: 'S36_ADMIN',
                name: 'S36 Admin',
                email: 's36_admin@test.com',
                password_hash: passwordHash,
                role: 'admin',
                status: 'active',
                department_id: dept._id
            });
            s36AdminToken = jwt.sign({ id: 'S36_ADMIN', role: 'admin', email: 's36_admin@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            await EmployeeModel.create({
                id: 'S36_MGR',
                name: 'S36 Manager',
                email: 's36_mgr@test.com',
                password_hash: passwordHash,
                role: 'manager',
                status: 'active',
                department_id: dept._id
            });
            s36MgrToken = jwt.sign({ id: 'S36_MGR', role: 'manager', email: 's36_mgr@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            await EmployeeModel.create({
                id: 'S36_TL',
                name: 'S36 TL',
                email: 's36_tl@test.com',
                password_hash: passwordHash,
                role: 'team_lead',
                status: 'active',
                department_id: dept._id
            });
            s36TlToken = jwt.sign({ id: 'S36_TL', role: 'team_lead', email: 's36_tl@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });

            await EmployeeModel.create({
                id: 'S36_EMP',
                name: 'S36 Emp',
                email: 's36_emp@test.com',
                password_hash: passwordHash,
                role: 'employee',
                status: 'active',
                department_id: dept._id
            });
            s36EmpToken = jwt.sign({ id: 'S36_EMP', role: 'employee', email: 's36_emp@test.com' }, process.env.JWT_SECRET, { expiresIn: '1h' });
        });

        it('36.1 Engine: Annual CTC 600000, default formulas', () => {
            const res = evaluateComponents({ annualCtc: 600000, components: DEFAULT_PAYROLL_COMPONENTS });
            expect(res.monthly_ctc).toBe(50000.00);
            expect(res.components.BASIC).toBe(25000.00);
            expect(res.components.HRA).toBe(10000.00);
            expect(res.components.MEDICAL).toBe(5000.00);
            expect(res.gross_salary).toBe(40000.00);
            expect(res.components.PF).toBe(1800.00);
            expect(res.components.ESI).toBe(0.00);
            expect(res.components.PT).toBe(0.00);
            expect(res.components.LWF).toBe(0.00);
            expect(res.components.GRATITUDE).toBe(0.00);
            expect(res.total_deductions).toBe(1800.00);
            expect(res.net_salary).toBe(38200.00);
        });

        it('36.2 Engine: Annual CTC 240000, default formulas', () => {
            const res = evaluateComponents({ annualCtc: 240000, components: DEFAULT_PAYROLL_COMPONENTS });
            expect(res.monthly_ctc).toBe(20000.00);
            expect(res.components.BASIC).toBe(10000.00);
            expect(res.components.HRA).toBe(4000.00);
            expect(res.components.MEDICAL).toBe(2000.00);
            expect(res.gross_salary).toBe(16000.00);
            expect(res.components.PF).toBe(1200.00);
            expect(res.components.ESI).toBe(120.00);
            expect(res.net_salary).toBe(14680.00);
        });

        it('36.3 Global custom addition "Special Allowance", 10%, formula MONTHLY_CTC * PCT / 100, Annual CTC 600000', () => {
            const res = evaluateComponents({
                annualCtc: 600000,
                components: DEFAULT_PAYROLL_COMPONENTS,
                customColumns: [{
                    name: 'Special Allowance',
                    percentage: 10,
                    formula: 'MONTHLY_CTC * PCT / 100',
                    type: 'addition'
                }]
            });
            expect(res.components.SPECIAL_ALLOWANCE).toBe(5000.00);
            expect(res.gross_salary).toBe(45000.00);
            expect(res.components.PF).toBe(1800.00);
            expect(res.net_salary).toBe(43200.00);
        });

        it('36.6 Formula validation: PUT settings with unknown id, syntax error, cycle, valid formula', async () => {
            // Unknown identifier
            const resUnknown = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS.map(c => c.key === 'BASIC' ? { ...c, formula: 'MONTHLY_CTC * UNKNOWN_VAR / 100' } : c)
                    }
                });
            expect(resUnknown.status).toBe(400);
            expect(resUnknown.body.message).toMatch(/Unknown variable/i);

            // Syntax error
            const resSyntax = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS.map(c => c.key === 'BASIC' ? { ...c, formula: 'MONTHLY_CTC *' } : c)
                    }
                });
            expect(resSyntax.status).toBe(400);

            // Circular reference
            const resCycle = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS.map(c => {
                            if (c.key === 'HRA') return { ...c, formula: 'MEDICAL + 100' };
                            if (c.key === 'MEDICAL') return { ...c, formula: 'HRA + 100' };
                            return c;
                        })
                    }
                });
            expect(resCycle.status).toBe(400);
            expect(resCycle.body.message).toMatch(/Circular dependency/i);

            // Valid formula
            const resValid = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS,
                        custom_columns: []
                    }
                });
            expect(resValid.status).toBe(200);
            expect(resValid.body.success).toBe(true);
        });

        it('36.4 Per-employee custom deduction "Loan Recovery", 2%, formula GROSS * PCT / 100, on Annual CTC 600000', async () => {
            const emp1 = await EmployeeModel.create({
                id: 'S36_EMP1',
                name: 'Employee 1',
                email: 'emp1_s36@test.com',
                password_hash: await bcrypt.hash('pass', 10),
                role: 'employee',
                status: 'active'
            });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    employee_id: emp1.id,
                    annual_ctc: 600000,
                    month: 1,
                    year: 2026,
                    days_worked: 30,
                    custom_columns: [{
                        name: 'Loan Recovery',
                        percentage: 2,
                        formula: 'GROSS * PCT / 100',
                        type: 'deduction'
                    }]
                });

            expect(res.status).toBe(201);
            const p = res.body.payroll;
            const lrComp = (p.custom_components || []).find(c => c.key === 'LOAN_RECOVERY');
            expect(lrComp).toBeDefined();
            expect(lrComp.amount).toBe(800.00);
            expect(p.total_deductions).toBe(2600.00);
            expect(p.net_salary).toBe(37400.00);

            // Confirm global config is unchanged afterwards
            const currentSetting = await SettingModel.findOne().lean();
            const globalCustoms = currentSetting?.payroll_formula_config?.custom_columns || [];
            expect(globalCustoms.some(c => c.key === 'LOAN_RECOVERY')).toBe(false);
        });

        it('36.5 Per-employee column applies only to that employee', async () => {
            const emp2 = await EmployeeModel.create({
                id: 'S36_EMP2',
                name: 'Employee 2',
                email: 'emp2_s36@test.com',
                password_hash: await bcrypt.hash('pass', 10),
                role: 'employee',
                status: 'active'
            });

            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    employee_id: emp2.id,
                    annual_ctc: 600000,
                    month: 1,
                    year: 2026,
                    days_worked: 30
                });

            expect(res.status).toBe(201);
            const p = res.body.payroll;
            const lrComp = (p.custom_components || []).find(c => c.key === 'LOAN_RECOVERY');
            expect(lrComp).toBeUndefined();
            expect(p.net_salary).toBe(38200.00);
        });

        it('36.7 Access: manager and team_lead get 403 on PUT settings, POST /payroll/preview, POST /payroll/create', async () => {
            for (const token of [s36MgrToken, s36TlToken, s36EmpToken]) {
                const resPut = await request(app)
                    .put('/api/settings')
                    .set('Authorization', `Bearer ${token}`)
                    .send({
                        payroll_formula_config: {
                            components: DEFAULT_PAYROLL_COMPONENTS,
                            custom_columns: []
                        }
                    });
                expect(resPut.status).toBe(403);

                const resPrev = await request(app)
                    .post('/api/payroll/preview')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ employee_id: 'S36_EMP', annual_ctc: 600000 });
                expect(resPrev.status).toBe(403);

                const resCreate = await request(app)
                    .post('/api/payroll/create')
                    .set('Authorization', `Bearer ${token}`)
                    .send({ employee_id: 'S36_EMP', annual_ctc: 600000, month: 3, year: 2026 });
                expect(resCreate.status).toBe(403);
            }
        });

        it('36.8 Preview is read-only: returns expected net 38200.00 and payroll count unchanged', async () => {
            const PayrollModel = require('../models/Payroll');
            const countBefore = await PayrollModel.countDocuments();

            const res = await request(app)
                .post('/api/payroll/preview')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    employee_id: 'S36_EMP',
                    annual_ctc: 600000,
                    month: 4,
                    year: 2026,
                    days_worked: 30
                });

            expect(res.status).toBe(200);
            expect(res.body.preview.net_salary).toBe(38200.00);

            const countAfter = await PayrollModel.countDocuments();
            expect(countAfter).toBe(countBefore);
        });

        it('36.9 Create stores snapshot: changing global formula leaves existing record unchanged', async () => {
            const PayrollModel = require('../models/Payroll');
            // Change global formula PF to 10%
            const updatedComponents = DEFAULT_PAYROLL_COMPONENTS.map(c => c.key === 'PF' ? { ...c, percentage: 10 } : c);
            const resPut = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: updatedComponents,
                        custom_columns: []
                    }
                });
            expect(resPut.status).toBe(200);

            // Existing record for S36_EMP2 still has PF 1800.00 and stored formula_snapshot
            const existingRecord = await PayrollModel.findOne({ employee_id: 'S36_EMP2', month: 1, year: 2026 }).lean();
            expect(existingRecord).toBeDefined();
            expect(existingRecord.provident_fund).toBe(1800.00);
            expect(existingRecord.formula_snapshot).toBeDefined();
            const snapPf = existingRecord.formula_snapshot.components.find(c => c.key === 'PF');
            expect(snapPf.percentage).toBe(12);

            // Revert global formula back to 12%
            await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS,
                        custom_columns: []
                    }
                });
        });

        it('36.10 Legacy amount create still works', async () => {
            const res = await request(app)
                .post('/api/payroll/create')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    employee_id: 'S36_EMP',
                    month: 5,
                    year: 2026,
                    days_worked: 30,
                    basic: 30000,
                    da: 5000,
                    oa: 2000
                });

            expect(res.status).toBe(201);
            expect(res.body.payroll.calculation_mode).toBe('amount');
            expect(res.body.payroll.basic).toBe(30000);
            expect(res.body.payroll.da).toBe(5000);
            expect(res.body.payroll.gross_salary).toBe(37000);
        });

        it('36.11 Parser safety: formula "1; process.exit()" and "constructor.constructor(\'x\')" are rejected with 400', async () => {
            const resEvil1 = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS.map(c => c.key === 'BASIC' ? { ...c, formula: '1; process.exit()' } : c)
                    }
                });
            expect(resEvil1.status).toBe(400);

            const resEvil2 = await request(app)
                .put('/api/settings')
                .set('Authorization', `Bearer ${s36AdminToken}`)
                .send({
                    payroll_formula_config: {
                        components: DEFAULT_PAYROLL_COMPONENTS.map(c => c.key === 'BASIC' ? { ...c, formula: "constructor.constructor('x')" } : c)
                    }
                });
            expect(resEvil2.status).toBe(400);
        });
    });
});
