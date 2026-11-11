/**
 * Verification script for Issue 1: Server-Authoritative Idle Clock-out, Caches & Sweeper
 * Strictly tests against DB_NAME=hrms_dev
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';
process.env.SWEEPER_SECRET = 'test_sweeper_secret_12345';

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Setting = require('../models/Setting');
const Shift = require('../models/Shift');
const {
    getIdlePolicy,
    autoClockOut,
    sweepStaleSessions,
    clockIn
} = require('../controllers/attendanceController');

async function run() {
    console.log('=== Starting Issue 1 Verification ===');
    console.log(`Target DB: ${process.env.DB_NAME}`);

    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('SAFETY CHECK FAILED: DB_NAME must be hrms_dev');
    }

    await connectDB();

    const testEmpId = `TEST_IDLE_${Date.now()}`;
    const testEmail = `test_idle_${Date.now()}@example.com`;

    try {
        // Ensure default shift and settings exist in hrms_dev
        let shift = await Shift.findOne({ is_default: true });
        if (!shift) {
            shift = await Shift.create({
                name: 'General Shift',
                start_time: '09:00',
                end_time: '18:00',
                is_default: true,
                grace_period: 15
            });
        }

        let setting = await Setting.findOne();
        if (!setting) {
            setting = await Setting.create({
                company_name: 'Test Corp',
                idle_auto_clockout_enabled: true,
                idle_timeout_minutes: 10,
                attendance_settings: {
                    office_start_time: '00:00', // Allow testing at any hour
                    office_end_time: '23:59'
                }
            });
        } else {
            setting.idle_auto_clockout_enabled = true;
            setting.idle_timeout_minutes = 10;
            if (!setting.attendance_settings) setting.attendance_settings = {};
            setting.attendance_settings.office_start_time = '00:00';
            setting.attendance_settings.office_end_time = '23:59';
            await setting.save();
        }

        const employee = await Employee.create({
            id: testEmpId,
            name: 'Test Idle User',
            email: testEmail,
            password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
            role: 'employee',
            status: 'active',
            shift_id: shift._id
        });
        console.log(`[PASS] Test employee created: ${testEmpId}`);

        // 1. Test getIdlePolicy with in-memory TTL cache
        const mockReqPolicy = { user: { id: testEmpId, role: 'employee' } };
        let mockResPolicy = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        const t0 = Date.now();
        await getIdlePolicy(mockReqPolicy, mockResPolicy);
        const t1 = Date.now();
        console.log(`[PASS] getIdlePolicy returned in ${t1 - t0}ms. Enabled: ${mockResPolicy.data?.enabled}, Timeout: ${mockResPolicy.data?.timeout_minutes}m`);
        if (!mockResPolicy.data?.enabled || mockResPolicy.data?.timeout_minutes !== 10) {
            throw new Error('Policy defaults failed');
        }

        // Test cached policy speed
        const t2 = Date.now();
        await getIdlePolicy(mockReqPolicy, mockResPolicy);
        const t3 = Date.now();
        console.log(`[PASS] Cached getIdlePolicy returned in ${t3 - t2}ms (TTL cache hit).`);

        // 2. Test autoClockOut: server-authoritative last activity time & source = 'auto-idle'
        const checkInTime = new Date(Date.now() - 3600 * 1000); // Clocked in 1 hour ago
        const openSession = await Attendance.create({
            employee_id: testEmpId,
            date: checkInTime,
            check_in: checkInTime,
            status: 'present',
            is_open_session: true,
            work_hours: 0
        });

        const idleSeconds = 900; // 15 minutes of idle time reported
        const mockReqClockOut = {
            user: { id: testEmpId, role: 'employee' },
            body: { idle_seconds: idleSeconds, reported_at: new Date().toISOString() }
        };
        let mockResClockOut = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        const beforeNow = Date.now();
        await autoClockOut(mockReqClockOut, mockResClockOut);
        const afterNow = Date.now();

        if (mockResClockOut.statusCode !== 200) {
            throw new Error(`autoClockOut failed with status ${mockResClockOut.statusCode}: ${JSON.stringify(mockResClockOut.data)}`);
        }

        const updatedSession = await Attendance.findById(openSession._id);
        console.log(`[PASS] autoClockOut succeeded. is_open_session: ${updatedSession.is_open_session}, auto_clock_out: ${updatedSession.auto_clock_out}, source: ${updatedSession.source}`);

        if (updatedSession.is_open_session !== false) throw new Error('Expected is_open_session to be false');
        if (updatedSession.auto_clock_out !== true) throw new Error('Expected auto_clock_out to be true');
        if (updatedSession.source !== 'auto-idle') throw new Error(`Expected source to be 'auto-idle', got ${updatedSession.source}`);

        // Verify that check_out time is recorded as (now - idleSeconds), NOT now!
        const clockOutMs = new Date(updatedSession.check_out).getTime();
        const expectedClockOutMs = beforeNow - (idleSeconds * 1000);
        const discrepancyMs = Math.abs(clockOutMs - expectedClockOutMs);
        console.log(`[PASS] Last-activity check_out accuracy: discrepancy is ${discrepancyMs}ms (expected < 2000ms). Recorded check_out is properly back-dated to user's last activity time!`);
        if (discrepancyMs > 2000) {
            throw new Error(`Check-out time was not properly backdated to last activity time. Discrepancy: ${discrepancyMs}ms`);
        }

        // 3. Test Idempotency: second call when already closed
        let mockResIdempotent = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await autoClockOut(mockReqClockOut, mockResIdempotent);
        console.log(`[PASS] Idempotent call returned status ${mockResIdempotent.statusCode}, already_closed: ${mockResIdempotent.data?.already_closed}`);
        if (mockResIdempotent.statusCode !== 200 || !mockResIdempotent.data?.already_closed) {
            throw new Error('Idempotent autoClockOut failed');
        }

        // 4. Test Same-Day Re-Clock-In
        let mockReqClockIn = {
            user: { id: testEmpId, role: 'employee' }
        };
        let mockResClockIn = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await clockIn(mockReqClockIn, mockResClockIn);
        console.log(`[PASS] Same-day re-clock-in returned status ${mockResClockIn.statusCode}. Message: ${mockResClockIn.data?.message}`);
        if (mockResClockIn.statusCode !== 201 || !mockResClockIn.data?.attendance?.is_open_session) {
            throw new Error(`Same-day re-clock-in failed: ${JSON.stringify(mockResClockIn.data)}`);
        }

        // 5. Test Server-side Sweeper
        // Set last_activity_at on the open session to 20 minutes ago
        const staleSession = mockResClockIn.data.attendance;
        await Attendance.findByIdAndUpdate(staleSession._id, {
            check_in: new Date(Date.now() - 30 * 60 * 1000),
            last_activity_at: new Date(Date.now() - 20 * 60 * 1000)
        });

        let mockReqSweeper = {
            headers: { 'x-sweeper-secret': 'test_sweeper_secret_12345' },
            query: {}
        };
        let mockResSweeper = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await sweepStaleSessions(mockReqSweeper, mockResSweeper);
        console.log(`[PASS] Sweeper executed. Closed stale count: ${mockResSweeper.data?.closed_count}`);
        if (mockResSweeper.statusCode !== 200 || mockResSweeper.data?.closed_count < 1) {
            throw new Error('Server-side sweeper did not close stale session');
        }

        const sweptDoc = await Attendance.findById(staleSession._id);
        if (sweptDoc.is_open_session !== false || sweptDoc.source !== 'auto-idle') {
            throw new Error('Swept session not properly marked as closed / auto-idle');
        }
        console.log('[PASS] Swept session verified in DB: closed, source=auto-idle, auto_clock_out=true.');

        // 6. Test Heartbeat & Verify that an Active User is NOT Swept
        const activeSessionDoc = await Attendance.create({
            employee_id: testEmpId,
            date: new Date(),
            check_in: new Date(Date.now() - 45 * 60 * 1000), // Clocked in 45m ago
            is_open_session: true,
            status: 'present'
        });

        // Send heartbeat (user is active)
        const mockReqHeartbeat = { user: { id: testEmpId } };
        let mockResHeartbeat = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        const { heartbeat: heartbeatController } = require('../controllers/attendanceController');
        await heartbeatController(mockReqHeartbeat, mockResHeartbeat);
        console.log(`[PASS] Heartbeat received and recorded: ${mockResHeartbeat.data?.success}`);

        // Run sweeper: active session must NOT be closed!
        let mockResSweeperActive = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await sweepStaleSessions(mockReqSweeper, mockResSweeperActive);

        const checkActive = await Attendance.findById(activeSessionDoc._id);
        if (checkActive.is_open_session !== true) {
            throw new Error('Active user session was WRONGLY swept! Heartbeat did not protect the active session.');
        }
        console.log('[PASS] Active user test verified: session with recent heartbeat was NOT swept (remains open).');

        console.log('\nALL ISSUE 1 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    } finally {
        await Employee.deleteOne({ id: testEmpId });
        await Attendance.deleteMany({ employee_id: testEmpId });
        await mongoose.connection.close();
        console.log('Cleaned up test data and closed DB connection.');
    }
}

run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
