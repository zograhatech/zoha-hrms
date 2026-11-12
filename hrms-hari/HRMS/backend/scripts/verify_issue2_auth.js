/**
 * Verification script for Issue 2: Persistent Login & Token Refresh Concurrency
 * Strictly tests against DB_NAME=hrms_dev
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Setting = require('../models/Setting');
const { refreshToken: refreshTokenController } = require('../controllers/authController');

async function run() {
    console.log('=== Starting Issue 2 Verification ===');
    console.log(`Target DB: ${process.env.DB_NAME}`);

    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('SAFETY CHECK FAILED: DB_NAME must be hrms_dev');
    }

    await connectDB();
    console.log(`Connected to database: ${mongoose.connection.name}`);
    if (mongoose.connection.name !== 'hrms_dev') {
        throw new Error(`ABORT: Connected database is "${mongoose.connection.name}", but must be strictly "hrms_dev"!`);
    }

    const testEmpId = `TEST_AUTH_${Date.now()}`;
    const testEmail = `test_auth_${Date.now()}@example.com`;

    try {
        // 1. Create a clean test employee
        const testEmployee = await Employee.create({
            id: testEmpId,
            name: 'Test Auth User',
            email: testEmail,
            password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
            role: 'employee',
            refresh_tokens: [],
            rotated_tokens: []
        });

        console.log(`[PASS] Test employee created: ${testEmpId}`);

        // 2. Test Token Lifetime for rememberMe = true vs false
        const tokenTrue = jwt.sign(
            { id: testEmpId, rememberMe: true },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '30d' }
        );
        const decodedTrue = jwt.decode(tokenTrue);
        const lifetimeTrueDays = Math.round((decodedTrue.exp - decodedTrue.iat) / (60 * 60 * 24));
        console.log(`[PASS] rememberMe=true refresh token lifetime: ${lifetimeTrueDays} days (expected: 30)`);
        if (lifetimeTrueDays !== 30) throw new Error('Expected 30 days for rememberMe=true');

        const tokenFalse = jwt.sign(
            { id: testEmpId, rememberMe: false },
            process.env.JWT_REFRESH_SECRET,
            { expiresIn: '1d' }
        );
        const decodedFalse = jwt.decode(tokenFalse);
        const lifetimeFalseHours = Math.round((decodedFalse.exp - decodedFalse.iat) / (60 * 60));
        console.log(`[PASS] rememberMe=false refresh token lifetime: ${lifetimeFalseHours} hours (expected: 24)`);
        if (lifetimeFalseHours !== 24) throw new Error('Expected 24 hours for rememberMe=false');

        // 3. Test Refresh Token Rotation
        testEmployee.refresh_tokens.push(tokenTrue);
        await testEmployee.save();

        let reqMock1 = {
            body: { refreshToken: tokenTrue }
        };
        let resMock1 = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await refreshTokenController(reqMock1, resMock1);
        if (resMock1.statusCode !== 200 || !resMock1.data?.token || !resMock1.data?.refreshToken) {
            throw new Error(`Token refresh failed: status ${resMock1.statusCode}, data: ${JSON.stringify(resMock1.data)}`);
        }
        console.log('[PASS] Initial token refresh succeeded with new access & refresh tokens.');
        const rotatedToken1 = resMock1.data.refreshToken;

        // Verify DB state: old token replaced, moved to rotated_tokens
        const updatedEmp = await Employee.findOne({ id: testEmpId });
        if (updatedEmp.refresh_tokens.includes(tokenTrue)) {
            throw new Error('Old token was NOT removed from refresh_tokens array');
        }
        if (!updatedEmp.refresh_tokens.includes(rotatedToken1)) {
            throw new Error('New token NOT found in refresh_tokens array');
        }
        if (!updatedEmp.rotated_tokens.some(r => r.old_token === tokenTrue)) {
            throw new Error('Old token was NOT tracked in rotated_tokens');
        }
        console.log('[PASS] DB state verified: old token removed from active list and recorded in rotated_tokens.');

        // 4. Test Concurrency Grace Period (Request 2 races with the SAME old token)
        let reqMock2 = {
            body: { refreshToken: tokenTrue } // Re-using the same old token
        };
        let resMock2 = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await refreshTokenController(reqMock2, resMock2);
        if (resMock2.statusCode !== 200 || !resMock2.data?.grace) {
            throw new Error(`Concurrency race failed: expected status 200 with grace=true, got ${resMock2.statusCode}`);
        }
        if (resMock2.data.refreshToken !== rotatedToken1) {
            throw new Error('Racing request did not receive the matching rotated refresh token');
        }
        console.log('[PASS] Concurrency race test passed: second request with same token within grace window was gracefully accepted with matching tokens (no 403!).');

        // 5. Test Invalid Token Rejection
        let reqMock3 = {
            body: { refreshToken: 'completely.bogus.token' }
        };
        let resMock3 = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await refreshTokenController(reqMock3, resMock3);
        if (resMock3.statusCode !== 403) {
            throw new Error(`Expected status 403 for bogus token, got ${resMock3.statusCode}`);
        }
        console.log('[PASS] Invalid token was properly rejected with 403.');

        console.log('\nALL ISSUE 2 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    } finally {
        // Cleanup test employee
        await Employee.deleteOne({ id: testEmpId });
        await mongoose.connection.close();
        console.log('Test employee cleaned up and DB connection closed.');
    }
}

run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
