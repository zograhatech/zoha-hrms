/**
 * Test Suite: Auth Refresh Token Rotation Safety
 * 
 * Verifies:
 * 1. Normal rotation pushes new token and pulls old token.
 * 2. Fail-safe rotation: If step 2 ($pull) fails after step 1 ($push), the user
 *    is NEVER left without a valid session (newRefreshToken is in DB and active).
 * 3. Grace window accommodates concurrent requests.
 * 
 * Strict Guard: Uses MongoMemoryServer exclusively. NO hrms_db writes.
 */

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.JWT_SECRET = 'test_jwt_secret_auth_rotation_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_auth_rotation_12345';
process.env.DB_NAME = 'hrms_test_inmemory_auth';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/in_memory_guard';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Employee = require('../models/Employee');
const authController = require('../controllers/authController');

let mongoServer;
let testEmployee;

function mockReqRes(reqData = {}) {
    const req = {
        user: reqData.user || null,
        body: reqData.body || {},
        params: reqData.params || {},
        query: reqData.query || {},
        headers: reqData.headers || {},
        ip: '127.0.0.1',
        connection: { remoteAddress: '127.0.0.1' },
        get: () => 'test-agent',
        ...reqData
    };

    let statusCode = 200;
    let responseData = null;
    const res = {
        setHeader: jest.fn(),
        status: jest.fn(code => {
            statusCode = code;
            return res;
        }),
        json: jest.fn(data => {
            responseData = data;
            return res;
        }),
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;

    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
        throw new Error('FATAL: Non-memory database connected in test!');
    }

    await mongoose.connect(uri, { dbName: 'hrms_auth_rotation_test' });

    testEmployee = await Employee.create({
        id: 'EMP_ROT_001',
        employee_id: 'EMP_ROT_001',
        name: 'Rotation Test User',
        email: 'rot_test@example.com',
        role: 'employee',
        status: 'active',
        refresh_tokens: [],
        rotated_tokens: []
    });
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe('Safe Refresh Token Rotation (authController.refreshToken)', () => {

    test('1. Normal refresh rotation pushes new token and removes old token', async () => {
        // Issue active token
        const activeToken = jwt.sign(
            { id: testEmployee.id, rememberMe: true, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d' }
        );

        await Employee.updateOne(
            { _id: testEmployee._id },
            { $set: { refresh_tokens: [activeToken], rotated_tokens: [] } }
        );

        const { req, res } = mockReqRes({
            body: { refreshToken: activeToken }
        });

        await authController.refreshToken(req, res);
        expect(res.getStatusCode()).toBe(200);
        const data = res.getData();
        expect(data.success).toBe(true);
        expect(data.token).toBeDefined();
        expect(data.refreshToken).toBeDefined();
        expect(data.refreshToken).not.toBe(activeToken);

        // Verify in DB
        const updated = await Employee.findById(testEmployee._id);
        expect(updated.refresh_tokens).toContain(data.refreshToken);
        expect(updated.refresh_tokens).not.toContain(activeToken);
        expect(updated.rotated_tokens.some(r => r.old_token === activeToken)).toBe(true);
    });

    test('2. Safe rotation: if Step 2 ($pull) fails, user is NEVER left without a valid session', async () => {
        const initialToken = jwt.sign(
            { id: testEmployee.id, rememberMe: false, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '1d' }
        );

        await Employee.updateOne(
            { _id: testEmployee._id },
            { $set: { refresh_tokens: [initialToken] } }
        );

        // Spy on Employee.updateOne: Let step 1 ($push) pass, but force step 2 ($pull) to fail
        const originalUpdateOne = Employee.updateOne.bind(Employee);
        let stepCount = 0;

        jest.spyOn(Employee, 'updateOne').mockImplementation(async (filter, update, options) => {
            if (update && update.$pull && update.$pull.refresh_tokens) {
                // Simulate database crash or network timeout during the pull step
                throw new Error('Simulated database error during step 2 ($pull old refresh token)');
            }
            return originalUpdateOne(filter, update, options);
        });

        const { req, res } = mockReqRes({
            body: { refreshToken: initialToken }
        });

        await authController.refreshToken(req, res);

        // Restore original method
        Employee.updateOne.mockRestore();

        // The request must still succeed and return the new credentials
        expect(res.getStatusCode()).toBe(200);
        const data = res.getData();
        expect(data.success).toBe(true);
        expect(data.refreshToken).toBeDefined();

        // CRITICAL INVARIANT: The user must NOT be left without a valid session in the database!
        const empInDb = await Employee.findById(testEmployee._id);
        expect(empInDb.refresh_tokens).toContain(data.refreshToken);

        // Subsequent refresh with the new token must succeed completely
        const { req: nextReq, res: nextRes } = mockReqRes({
            body: { refreshToken: data.refreshToken }
        });
        await authController.refreshToken(nextReq, nextRes);
        expect(nextRes.getStatusCode()).toBe(200);
        expect(nextRes.getData().success).toBe(true);
    });

    test('3. Grace window absorbs concurrent refreshes with the rotated old token', async () => {
        const tokenForGrace = jwt.sign(
            { id: testEmployee.id, rememberMe: true, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d' }
        );

        await Employee.updateOne(
            { _id: testEmployee._id },
            { $set: { refresh_tokens: [tokenForGrace] } }
        );

        // First rotation
        const { req: req1, res: res1 } = mockReqRes({ body: { refreshToken: tokenForGrace } });
        await authController.refreshToken(req1, res1);
        expect(res1.getStatusCode()).toBe(200);
        const firstResult = res1.getData();

        // Immediate concurrent replay of the same old token (e.g. from another tab within 60s)
        const { req: req2, res: res2 } = mockReqRes({ body: { refreshToken: tokenForGrace } });
        await authController.refreshToken(req2, res2);
        expect(res2.getStatusCode()).toBe(200);
        const secondResult = res2.getData();
        expect(secondResult.success).toBe(true);
        expect(secondResult.grace).toBe(true);
        expect(secondResult.refreshToken).toBe(firstResult.refreshToken);
    });
});
