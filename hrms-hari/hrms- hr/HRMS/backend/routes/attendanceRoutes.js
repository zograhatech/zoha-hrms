const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getEmployeeAttendance, getTeamAttendance, clockIn, clockOut,
    getTodayStatus, updateAttendanceManual, markHoliday, exportAttendance, getAttendanceTrends
} = require('../controllers/attendanceController');

router.post('/clock-in', auth(), clockIn);
router.get('/trends', auth(['hr_manager', 'hr', 'view_analytics']), getAttendanceTrends);
router.get('/today', auth(), getTodayStatus);
router.post('/clock-out', auth(), clockOut);
router.get('/status', auth(), getTodayStatus);
router.get('/team', auth(['manage_attendance', 'attendance_report', 'hr_manager', 'hr']), getTeamAttendance);
router.get('/export', auth(['manage_attendance', 'attendance_report', 'hr_manager', 'hr']), exportAttendance);
router.put('/update-manual', auth(['manage_attendance', 'attendance_report', 'hr_manager', 'hr']), updateAttendanceManual);
router.post('/mark-holiday', auth(['manage_attendance', 'attendance_report', 'hr_manager', 'hr']), markHoliday);

router.get('/:employeeId', auth(), getEmployeeAttendance);

module.exports = router;
