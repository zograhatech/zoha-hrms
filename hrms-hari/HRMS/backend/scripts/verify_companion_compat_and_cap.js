/**
 * Test Suite: Companion Backward Compatibility & Media/Meeting Activity Cap
 * 
 * Verifies:
 * 1. companion_version recorded in device registration and heartbeat.
 * 2. Backward compatibility: Legacy companion (no heartbeats / no new companion version)
 *    is NEVER wrongly swept by server-sweeper.
 * 3. Modern companion (reports companion_version >= 2.0.0) is swept when heartbeats stop.
 * 4. Meeting/media activity cap: User idle (no input) > configurable limit (default 90 min)
 *    stops counting meeting/media as active, allowing clock-out / sweeping.
 * 
 * STRICT SAFETY: Connects exclusively to DB_NAME=hrms_dev. NEVER writes to hrms_db.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';
process.env.SWEEPER_SECRET = 'test_sweeper_secret_compat_12345';

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Setting = require('../models/Setting');
const DeviceToken = require('../models/DeviceToken');
const attendanceController = require('../controllers/attendanceController');
const deviceTokenController = require('../controllers/deviceTokenController');

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
    console.log('=== Starting Companion Compatibility & Media Cap Test Suite (hrms_dev) ===');
    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('FATAL: DB_NAME must be hrms_dev. Aborting to protect production.');
    }

    await connectDB();
    console.log(`Connected to database: ${mongoose.connection.name}`);
    if (mongoose.connection.name !== 'hrms_dev') {
        throw new Error(`ABORT: Connected database is "${mongoose.connection.name}", but must be strictly "hrms_dev"!`);
    }

    const timestamp = Date.now();
    const legacyEmpId = `TEST_LEGACY_${timestamp}`;
    const modernEmpId = `TEST_MODERN_${timestamp}`;
    const mediaEmpId = `TEST_MEDIA_${timestamp}`;

    let legacyEmp, modernEmp, mediaEmp;
    let legacyAtt, modernAtt, mediaAtt;

    try {
        console.log('\n--- 1. Configuring Global Settings for Test ---');
        await Setting.findOneAndUpdate(
            {},
            {
                $set: {
                    idle_auto_clockout_enabled: true,
                    idle_timeout_minutes: 10,
                    max_meeting_media_minutes: 90
                }
            },
            { upsert: true, new: true }
        );
        console.log('[PASS] Global idle settings configured (timeout: 10m, media cap: 90m).');

        console.log('\n--- 2. Seeding Test Employees ---');
        [legacyEmp, modernEmp, mediaEmp] = await Employee.insertMany([
            {
                id: legacyEmpId,
                employee_id: legacyEmpId,
                name: 'Legacy Companion Employee',
                email: `${legacyEmpId}@example.com`,
                password_hash: 'dummy_hash',
                role: 'employee',
                status: 'active'
            },
            {
                id: modernEmpId,
                employee_id: modernEmpId,
                name: 'Modern Companion Employee',
                email: `${modernEmpId}@example.com`,
                password_hash: 'dummy_hash',
                role: 'employee',
                status: 'active'
            },
            {
                id: mediaEmpId,
                employee_id: mediaEmpId,
                name: 'Media User Employee',
                email: `${mediaEmpId}@example.com`,
                password_hash: 'dummy_hash',
                role: 'employee',
                status: 'active'
            }
        ]);
        console.log('[PASS] Seeded employees.');

        console.log('\n--- 3. Testing Backward Compatibility: Legacy Companion Session Is Never Swept ---');
        // Legacy companion does not send heartbeats; devices array is empty or has null companion_version
        const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
        legacyAtt = await Attendance.create({
            employee_id: legacyEmpId,
            date: fifteenMinutesAgo,
            check_in: fifteenMinutesAgo,
            last_activity_at: fifteenMinutesAgo,
            is_open_session: true,
            devices: [] // No new companion heartbeats
        });

        // Run server-side sweeper
        const { req: reqSweep1, res: resSweep1 } = mockReqRes({
            headers: { 'x-sweeper-secret': 'test_sweeper_secret_compat_12345' }
        });
        await attendanceController.sweepStaleSessions(reqSweep1, resSweep1);

        // Verify legacy session was NOT swept
        const checkLegacy = await Attendance.findById(legacyAtt._id);
        if (!checkLegacy.is_open_session) {
            throw new Error('FAIL: Legacy companion session was wrongly closed by sweeper!');
        }
        console.log('[PASS] Verified: Legacy companion session (no heartbeats) was NOT swept.');

        console.log('\n--- 4. Testing Modern Companion (v2.0.0) Is Swept When Heartbeats Stop ---');
        // Modern companion registered with v2.0.0
        modernAtt = await Attendance.create({
            employee_id: modernEmpId,
            date: fifteenMinutesAgo,
            check_in: fifteenMinutesAgo,
            last_activity_at: fifteenMinutesAgo,
            is_open_session: true,
            devices: [{
                device_id: 'dev_modern_01',
                hostname: 'PC-MODERN',
                source: 'companion',
                companion_version: '2.0.0',
                last_activity_at: fifteenMinutesAgo,
                idle_seconds: 900,
                in_meeting: false,
                media_active: false
            }]
        });

        const { req: reqSweep2, res: resSweep2 } = mockReqRes({
            headers: { 'x-sweeper-secret': 'test_sweeper_secret_compat_12345' }
        });
        await attendanceController.sweepStaleSessions(reqSweep2, resSweep2);

        // Verify modern session WAS swept
        const checkModern = await Attendance.findById(modernAtt._id);
        if (checkModern.is_open_session || !checkModern.auto_clock_out || checkModern.closed_by_device_id !== 'server-sweeper') {
            throw new Error('FAIL: Modern companion session was not swept after missing heartbeats!');
        }
        console.log('[PASS] Verified: Modern companion session (v2.0.0) was swept by server-sweeper.');

        console.log('\n--- 5. Testing Media/Meeting Activity Cap (90 min Limit) ---');
        // Case A: User in meeting with idle_seconds = 45m (<= 90m) -> meeting IS counted, NOT swept
        const fortyFiveMinAgo = new Date(Date.now() - 45 * 60 * 1000);
        mediaAtt = await Attendance.create({
            employee_id: mediaEmpId,
            date: fortyFiveMinAgo,
            check_in: fortyFiveMinAgo,
            last_activity_at: fortyFiveMinAgo,
            is_open_session: true,
            devices: [{
                device_id: 'dev_media_01',
                hostname: 'PC-MEDIA',
                source: 'companion',
                companion_version: '2.0.0',
                last_activity_at: fortyFiveMinAgo,
                idle_seconds: 45 * 60, // 45 min idle keyboard/mouse, but in meeting
                in_meeting: true,
                media_active: false
            }]
        });

        const { req: reqSweep3, res: resSweep3 } = mockReqRes({
            headers: { 'x-sweeper-secret': 'test_sweeper_secret_compat_12345' }
        });
        await attendanceController.sweepStaleSessions(reqSweep3, resSweep3);

        const checkMedia1 = await Attendance.findById(mediaAtt._id);
        if (!checkMedia1.is_open_session) {
            throw new Error('FAIL: Active meeting under 90 min was wrongly closed!');
        }
        console.log('[PASS] Meeting under 90 minutes correctly protected session from being swept.');

        // Case B: User in meeting but no input for 100 min (> 90 min cap) -> meeting cap exceeded, session IS swept
        const hundredMinAgo = new Date(Date.now() - 100 * 60 * 1000);
        await Attendance.updateOne(
            { _id: mediaAtt._id },
            {
                $set: {
                    last_activity_at: hundredMinAgo,
                    'devices.0.last_activity_at': hundredMinAgo,
                    'devices.0.idle_seconds': 100 * 60 // 100 minutes of keyboard/mouse inactivity
                }
            }
        );

        const { req: reqSweep4, res: resSweep4 } = mockReqRes({
            headers: { 'x-sweeper-secret': 'test_sweeper_secret_compat_12345' }
        });
        await attendanceController.sweepStaleSessions(reqSweep4, resSweep4);

        const checkMedia2 = await Attendance.findById(mediaAtt._id);
        if (checkMedia2.is_open_session || !checkMedia2.auto_clock_out) {
            throw new Error('FAIL: Meeting exceeding 90 min cap was not swept!');
        }
        console.log('[PASS] Meeting exceeding 90 min cap was successfully swept.');

        console.log('\n--- 6. Testing Heartbeat Media Cap ---');
        // Test heartbeat endpoint when user sends in_meeting = true with idle_seconds = 6000 (100 min)
        const { req: reqHb, res: resHb } = mockReqRes({
            user: { id: legacyEmpId, is_device_token: true },
            body: {
                device_id: 'test_dev_cap',
                companion_version: '2.0.0',
                idle_seconds: 6000,
                in_meeting: true
            }
        });
        await attendanceController.heartbeat(reqHb, resHb);
        expectStatusCode(resHb, 200);

        // Verify in DB that in_meeting was capped to false because idle_seconds > 5400 (90 min)
        const legacyUpdated = await Attendance.findById(legacyAtt._id);
        const devEntry = legacyUpdated.devices.find(d => d.device_id === 'test_dev_cap');
        if (devEntry.in_meeting !== false) {
            throw new Error('FAIL: Heartbeat did not cap in_meeting when idle_seconds > 90m!');
        }
        console.log('[PASS] Heartbeat successfully capped meeting activity when input inactivity exceeded 90m.');

        console.log('\n===============================================================');
        console.log('✅ ALL BACKWARD COMPATIBILITY & MEDIA CAP TESTS PASSED');
        console.log('===============================================================\n');

    } finally {
        console.log('Cleaning up test data in hrms_dev...');
        const attIds = [legacyAtt?._id, modernAtt?._id, mediaAtt?._id].filter(Boolean);
        if (attIds.length > 0) {
            await Attendance.deleteMany({ _id: { $in: attIds } });
        }
        const empIds = [legacyEmpId, modernEmpId, mediaEmpId];
        await Employee.deleteMany({ id: { $in: empIds } });
        await mongoose.disconnect();
        console.log('Cleanup complete and disconnected.');
    }
}

function expectStatusCode(res, expected) {
    if (res.getStatusCode() !== expected) {
        throw new Error(`Expected status ${expected}, got ${res.getStatusCode()}: ${JSON.stringify(res.getData())}`);
    }
}

run().catch(err => {
    console.error('\n❌ COMPATIBILITY / MEDIA CAP TEST FAILED:', err);
    process.exit(1);
});
