/**
 * Test Suite: Auth Refresh Token Rotation Safety
 * 
 * Verifies:
 * 1. Normal rotation pushes new token and removes old token.
 * 2. Fail-safe rotation: If step 2 ($pull) fails after step 1 ($push), the user
 *    is NEVER left without a valid session (newRefreshToken is in DB and active).
 * 3. Subsequent refresh with the newly pushed token succeeds.
 * 4. Grace window handles concurrent requests.
 * 
 * STRICT SAFETY: Connects exclusively to DB_NAME=hrms_dev. NEVER writes to hrms_db.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const { refreshToken: refreshTokenController } = require('../controllers/authController');

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
        setHeader: () => {},
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

async function run() {
    console.log('=== Starting Auth Safe Refresh Rotation Test Suite (hrms_dev) ===');
    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('FATAL: DB_NAME must be hrms_dev. Aborting to protect production.');
    }

    await connectDB();

    const timestamp = Date.now();
    const testEmpId = `TEST_ROT_${timestamp}`;
    let employee;

    try {
        console.log('\n--- 1. Creating Test Employee ---');
        employee = await Employee.create({
            id: testEmpId,
            employee_id: testEmpId,
            name: 'Rotation Safe User',
            email: `${testEmpId}@example.com`,
            password_hash: 'dummy_hash_for_test',
            role: 'employee',
            status: 'active',
            refresh_tokens: [],
            rotated_tokens: []
        });
        console.log(`[PASS] Test employee created: ${testEmpId}`);

        console.log('\n--- 2. Testing Normal Refresh Rotation (Push New, Pull Old) ---');
        const token1 = jwt.sign(
            { id: testEmpId, rememberMe: true, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d' }
        );

        await Employee.updateOne(
            { _id: employee._id },
            { $set: { refresh_tokens: [token1], rotated_tokens: [] } }
        );

        const { req: req1, res: res1 } = mockReqRes({ body: { refreshToken: token1 } });
        await refreshTokenController(req1, res1);

        if (res1.getStatusCode() !== 200) {
            throw new Error(`refreshToken failed with ${res1.getStatusCode()}: ${JSON.stringify(res1.getData())}`);
        }
        const data1 = res1.getData();
        if (!data1.token || !data1.refreshToken || data1.refreshToken === token1) {
            throw new Error('Rotation did not return new access and refresh tokens');
        }

        // Verify in DB: old token removed, new token present, rotated_tokens recorded
        const empAfter1 = await Employee.findById(employee._id);
        if (!empAfter1.refresh_tokens.includes(data1.refreshToken)) {
            throw new Error('newRefreshToken not found in employee.refresh_tokens');
        }
        if (empAfter1.refresh_tokens.includes(token1)) {
            throw new Error('Old token was NOT removed from employee.refresh_tokens');
        }
        if (!empAfter1.rotated_tokens.some(r => r.old_token === token1 && r.new_refresh_token === data1.refreshToken)) {
            throw new Error('Rotation history not recorded in rotated_tokens');
        }
        console.log('[PASS] Normal rotation successfully pushed new token, pulled old token, and recorded history.');

        console.log('\n--- 3. Testing Fail-Safe Rotation: Step 2 ($pull) Fails ---');
        // Setup active token
        const token2 = jwt.sign(
            { id: testEmpId, rememberMe: false, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '1d' }
        );

        await Employee.updateOne(
            { _id: employee._id },
            { $set: { refresh_tokens: [token2] } }
        );

        // Intercept Employee.updateOne to simulate a failure during step 2 ($pull)
        const originalUpdateOne = Employee.updateOne.bind(Employee);
        let pullAttempted = false;

        Employee.updateOne = async function (filter, update, options) {
            if (update && update.$pull && update.$pull.refresh_tokens) {
                pullAttempted = true;
                // Simulate network crash / timeout during pull
                throw new Error('Simulated database error during step 2 ($pull old refresh token)');
            }
            return originalUpdateOne(filter, update, options);
        };

        const { req: req2, res: res2 } = mockReqRes({ body: { refreshToken: token2 } });
        try {
            await refreshTokenController(req2, res2);
        } finally {
            // Restore original method
            Employee.updateOne = originalUpdateOne;
        }

        if (!pullAttempted) {
            throw new Error('Step 2 ($pull) was never attempted');
        }

        if (res2.getStatusCode() !== 200) {
            throw new Error(`Expected 200 even if step 2 failed, got ${res2.getStatusCode()}: ${JSON.stringify(res2.getData())}`);
        }
        const data2 = res2.getData();
        if (!data2.refreshToken) {
            throw new Error('newRefreshToken was not returned in response');
        }

        // CRITICAL INVARIANT: The user must NOT be left without a valid session in the database!
        const empAfterFail = await Employee.findById(employee._id);
        if (!empAfterFail.refresh_tokens.includes(data2.refreshToken)) {
            throw new Error('FATAL: Failure in step 2 left user without newRefreshToken in DB!');
        }
        console.log('[PASS] Invariant verified: user has newRefreshToken in DB even after Step 2 ($pull) failed.');

        console.log('\n--- 4. Testing Subsequent Refresh with the New Token ---');
        // Verify the user can immediately refresh again with data2.refreshToken
        const { req: req3, res: res3 } = mockReqRes({ body: { refreshToken: data2.refreshToken } });
        await refreshTokenController(req3, res3);
        if (res3.getStatusCode() !== 200 || !res3.getData().success) {
            throw new Error(`Subsequent refresh with new token failed: ${JSON.stringify(res3.getData())}`);
        }
        console.log('[PASS] Subsequent refresh with newly issued token succeeded smoothly.');

        console.log('\n--- 5. Testing Grace Window Concurrency ---');
        const tokenGrace = jwt.sign(
            { id: testEmpId, rememberMe: true, jti: crypto.randomBytes(16).toString('hex') },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d' }
        );

        await Employee.updateOne(
            { _id: employee._id },
            { $set: { refresh_tokens: [tokenGrace] } }
        );

        // Rotation
        const { req: reqG1, res: resG1 } = mockReqRes({ body: { refreshToken: tokenGrace } });
        await refreshTokenController(reqG1, resG1);
        const resultG1 = resG1.getData();

        // Immediate replay of rotated token within grace window
        const { req: reqG2, res: resG2 } = mockReqRes({ body: { refreshToken: tokenGrace } });
        await refreshTokenController(reqG2, resG2);
        const resultG2 = resG2.getData();

        if (resG2.getStatusCode() !== 200 || !resultG2.grace || resultG2.refreshToken !== resultG1.refreshToken) {
            throw new Error(`Grace window replay failed: ${JSON.stringify(resultG2)}`);
        }
        console.log('[PASS] Grace window replay verified.');

        console.log('\n===============================================================');
        console.log('✅ ALL SAFE REFRESH ROTATION TESTS PASSED');
        console.log('===============================================================\n');

    } finally {
        console.log('Cleaning up test employee in hrms_dev...');
        if (employee?._id) {
            await Employee.deleteOne({ _id: employee._id });
        }
        await mongoose.disconnect();
        console.log('Cleanup complete and disconnected.');
    }
}

run().catch(err => {
    console.error('\n❌ REFRESH ROTATION TEST FAILED:', err);
    process.exit(1);
});
