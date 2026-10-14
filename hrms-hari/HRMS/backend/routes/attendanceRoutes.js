const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getEmployeeAttendance, getTeamAttendance, clockIn, clockOut,
    getTodayStatus, updateAttendanceManual, markHoliday, exportAttendance, getAttendanceTrends,
    getAttendanceLogs
} = require('../controllers/attendanceController');

router.post('/clock-in', auth(), clockIn);
router.get('/trends', auth(['manager', 'team_lead', 'view_analytics']), getAttendanceTrends);
router.get('/today', auth(), getTodayStatus);
router.post('/clock-out', auth(), clockOut);
router.get('/status', auth(), getTodayStatus);
router.get('/team', auth(['manage_attendance', 'attendance_report', 'manager', 'team_lead']), getTeamAttendance);
router.get('/logs', auth(), getAttendanceLogs);
router.get('/export', auth(['manage_attendance', 'attendance_report', 'manager', 'team_lead']), exportAttendance);
router.put('/update-manual', auth(['manage_attendance', 'attendance_report', 'manager', 'team_lead']), updateAttendanceManual);
router.post('/mark-holiday', auth(['admin']), markHoliday);

router.get('/:employeeId', auth(), getEmployeeAttendance);

module.exports = router;

