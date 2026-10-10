const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Event = require('../models/Event');
const XLSX = require('xlsx');

// GET /api/attendance/:employeeId
const getEmployeeAttendance = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;

        const filter = { employee_id: employeeId };
        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            filter.date = {
                $gte: new Date(y, m - 1, 1),
                $lt: new Date(y, m, 1),
            };
        }

        const attendance = await Attendance.find(filter).sort({ date: 1 }).lean();

        // Since we now allow multiple clock-ins per day, we need to group by date for summary stats
        const groupedByDate = {};
        attendance.forEach(rec => {
            const d = new Date(rec.date).toISOString().split('T')[0];
            if (!groupedByDate[d]) {
                groupedByDate[d] = rec.status;
            } else {
                // If multiple records exist for the same day, prioritize "present" statuses over "absent"
                const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
                if (priority[rec.status] > priority[groupedByDate[d]]) {
                    groupedByDate[d] = rec.status;
                }
            }
        });

        const statuses = Object.values(groupedByDate);
        const present = statuses.filter(s => s === 'present').length;
        const absent = statuses.filter(s => s === 'absent').length;
        const late = statuses.filter(s => s === 'late').length;
        const halfDay = statuses.filter(s => s === 'half-day').length;
        const holiday = statuses.filter(s => s === 'holiday').length;
        const total = statuses.length;
        const totalWorkingDays = present + absent + late + halfDay;

        res.json({
            success: true,
            attendance,
            summary: { present, absent, late, halfDay, holiday, total, totalWorkingDays },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/attendance/team?date=YYYY-MM-DD
const getTeamAttendance = async (req, res) => {
    try {
        const dateStr = req.query.date || new Date().toISOString().split('T')[0];
        const date = new Date(dateStr);
        const nextDay = new Date(date);
        nextDay.setDate(nextDay.getDate() + 1);

        const records = await Attendance.find({ date: { $gte: date, $lt: nextDay } }).lean();

        // Get all active employees
        const employees = await Employee.find({ status: 'active' }).lean();
        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        const attMap = Object.fromEntries(records.map(r => [r.employee_id, r]));

        const attendance = employees.map(emp => {
            const rec = attMap[emp.id];
            return {
                employee_id: emp.id,
                name: emp.name,
                department: emp.department_id ? deptMap[emp.department_id.toString()] : null,
                designation: emp.designation,
                status: rec?.status || 'absent',
                check_in: rec?.check_in || null,
                check_out: rec?.check_out || null,
                work_hours: rec?.work_hours || null,
            };
        });

        const summary = {
            total: attendance.length,
            present: attendance.filter(a => a.status === 'present').length,
            absent: attendance.filter(a => a.status === 'absent').length,
            late: attendance.filter(a => a.status === 'late').length,
        };

        res.json({ success: true, date: dateStr, attendance, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// Helper to parse "HH:mm" to today's date
const parseTime = (timeStr) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d;
};

// POST /api/attendance/clock-in
const clockIn = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const employee = await Employee.findOne({ id: req.user.id }).populate('shift_id');
        const ShiftModel = require('../models/Shift'); // Use ShiftModel to avoid confusion with existing variables
        let shift = employee?.shift_id;
        
        if (!shift) {
            shift = await ShiftModel.findOne({ is_default: true });
        }

        if (!shift) {
            return res.status(400).json({ 
                success: false, 
                message: 'No shift assigned and no default shift exists. Please contact HR.' 
            });
        }

        // 1. Check if already clocked in for an active session
        const activeSession = await Attendance.findOne({
            employee_id: req.user.id,
            check_out: { $exists: false },
            date: { $gte: today }
        });

        if (activeSession) {
            return res.status(400).json({ success: false, message: 'You are already clocked in.' });
        }

        // 2. Check Daily Limit for Clock-ins
        const dailyRecordsCount = await Attendance.countDocuments({
            employee_id: req.user.id,
            date: { $gte: today }
        });

        const limit = shift.allowed_clock_ins || 1;
        if (dailyRecordsCount >= limit) {
            return res.status(400).json({ 
                success: false, 
                message: `You have reached the maximum allowed clock-ins (${limit}) for today.` 
            });
        }

        // --- Holiday and Leave Checks ---
        // 1. Check for Holiday
        const holidayEvent = await Event.findOne({
            type: 'holiday',
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        if (holidayEvent) {
            return res.status(400).json({ 
                success: false, 
                message: `Today is a holiday (${holidayEvent.title}). Clock-in is not required.` 
            });
        }

        // 2. Check for Approved Leave
        const approvedLeave = await Leave.findOne({
            employee_id: req.user.id,
            status: 'approved',
            start_date: { $lte: new Date() },
            end_date: { $gte: today }
        });

        if (approvedLeave) {
            return res.status(400).json({ 
                success: false, 
                message: 'You are on an approved leave today. Clock-in is restricted.' 
            });
        }
        // --- END OF CHECKS ---

        let status = 'present';
        const now = new Date();
        
        let shiftStart = parseTime(shift.start_time);
        let shiftEnd = parseTime(shift.end_time);
        
        // Handle night shifts
        if (shiftEnd < shiftStart) {
            // If it's a night shift, the end time is tomorrow
            // e.g., start 21:00, end 06:00
            // If currently it's past midnight (e.g. 01:00), the shift started *yesterday*
            if (now.getHours() < shiftStart.getHours()) {
                shiftStart.setDate(shiftStart.getDate() - 1);
            } else {
                shiftEnd.setDate(shiftEnd.getDate() + 1);
            }
        }

        // Allow clock-ins up to 2 hours before the shift starts
        const earliestClockIn = new Date(shiftStart);
        earliestClockIn.setHours(earliestClockIn.getHours() - 2);

        // Removed strict window restriction to allow clock-in regardless of server/local timezone mismatch.
        // Employees should be allowed to clock in if they are reporting for work.
        /*
        if (now < earliestClockIn || now > shiftEnd) {
            return res.status(400).json({ 
                success: false, 
                message: `You cannot clock in right now. Your shift is from ${shift.start_time} to ${shift.end_time}.` 
            });
        }
        */

        // Calculate exact start limit based on grace period (in minutes)
        const latestOnTime = new Date(shiftStart);
        latestOnTime.setMinutes(latestOnTime.getMinutes() + (shift.grace_period || 15));

        if (now > latestOnTime) {
            status = 'late';
        }

        const attendance = await Attendance.create({
            employee_id: req.user.id,
            date: new Date(),
            check_in: new Date(),
            status: status
        });

        res.status(201).json({ success: true, message: 'Clocked in successfully.', attendance });
    } catch (err) {
        console.error('[clockIn]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/attendance/clock-out
const clockOut = async (req, res) => {
    try {
        const last24Hours = new Date(new Date().getTime() - 24 * 60 * 60 * 1000);

        // Find the most recent attendance record that doesn't have a checkout
        const attendance = await Attendance.findOne({
            employee_id: req.user.id,
            check_out: { $exists: false },
            date: { $gte: last24Hours }
        }).sort({ date: -1 });

        if (!attendance) {
            return res.status(400).json({ success: false, message: 'You have not clocked in, or you already clocked out.' });
        }

        const now = new Date();
        const diffMs = now - attendance.check_in;
        const diffHrs = diffMs / (1000 * 60 * 60);

        attendance.check_out = now;
        attendance.work_hours = Number(diffHrs.toFixed(2));
        await attendance.save();

        res.json({ success: true, message: 'Clocked out successfully.', attendance });
    } catch (err) {
        console.error('[clockOut]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};


// GET /api/attendance/today
const getTodayStatus = async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Prioritize finding an active session (not checked out) or the latest session for today
        const attendance = await Attendance.findOne({
            employee_id: req.user.id,
            date: { $gte: today }
        }).sort({ createdAt: -1 }); // Get the latest session first

        const employee = await Employee.findOne({ id: req.user.id }).populate('shift_id');
        const ShiftModel = require('../models/Shift');
        let shift = employee?.shift_id || await ShiftModel.findOne({ is_default: true });

        const dailyCount = await Attendance.countDocuments({
            employee_id: req.user.id,
            date: { $gte: today }
        });

        const limit = shift?.allowed_clock_ins || 1;

        // Check for Holiday
        const holidayEvent = await Event.findOne({
            type: 'holiday',
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        // Check for Leave
        const approvedLeave = await Leave.findOne({
            employee_id: req.user.id,
            status: 'approved',
            start_date: { $lte: new Date() },
            end_date: { $gte: today }
        });

        res.json({ 
            success: true, 
            attendance,
            isHoliday: !!holidayEvent,
            holidayName: holidayEvent?.title,
            isOnLeave: !!approvedLeave,
            dailyCount,
            limit
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// POST /api/attendance/mark-holiday
const markHoliday = async (req, res) => {
    try {
        const { startDate, endDate } = req.body;
        if (!startDate) return res.status(400).json({ success: false, message: 'Start date is required.' });

        const start = new Date(startDate);
        const end = endDate ? new Date(endDate) : new Date(startDate);

        const employees = await Employee.find({ status: 'active' }).lean();
        const dates = [];
        let curr = new Date(start);

        while (curr <= end) {
            dates.push(new Date(curr));
            curr.setDate(curr.getDate() + 1);
        }

        const updates = [];
        for (const d of dates) {
            const nextDay = new Date(d);
            nextDay.setDate(nextDay.getDate() + 1);

            employees.forEach(emp => {
                updates.push(
                    Attendance.findOneAndUpdate(
                        { employee_id: emp.id, date: { $gte: d, $lt: nextDay } },
                        {
                            $set: { status: 'holiday', employee_id: emp.id, date: d },
                            $unset: { check_in: '', check_out: '', work_hours: '' }
                        },
                        { upsert: true, new: true }
                    )
                );
            });
        }

        await Promise.all(updates);

        res.json({ success: true, message: `Successfully marked holiday from ${startDate} to ${endDate || startDate} for all employees.` });
    } catch (err) {
        console.error('[markHoliday]', err);
        res.status(500).json({ success: false, message: 'Failed to mark holiday.' });
    }
};

// PUT /api/attendance/update-manual
const updateAttendanceManual = async (req, res) => {
    try {
        const { employee_id, date, status, check_in, check_out, work_hours } = req.body;

        const d = new Date(date);
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);

        let attendance = await Attendance.findOne({
            employee_id,
            date: { $gte: d, $lt: nextDay }
        });

        if (!attendance) {
            // If doesn't exist, create it (e.g. marking an 'absent' skip as 'present')
            attendance = new Attendance({ employee_id, date: d });
        }

        attendance.status = status;
        attendance.check_in = check_in || undefined;
        attendance.check_out = check_out || undefined;
        attendance.work_hours = work_hours || undefined;

        await attendance.save();

        res.json({ success: true, message: 'Attendance record updated manually.', attendance });
    } catch (err) {
        console.error('[updateAttendanceManual]', err);
        res.status(500).json({ success: false, message: 'Failed to update attendance.' });
    }
};

// GET /api/attendance/export?date=YYYY-MM-DD  OR  ?month=M&year=YYYY
const exportAttendance = async (req, res) => {
    try {
        const { date, month, year } = req.query;
        let filter = {};
        let fileName = 'attendance_export.xlsx';
        let sheetTitle = 'Attendance';

        if (month && year) {
            // Monthly export
            filter.date = {
                $gte: new Date(+year, +month - 1, 1),
                $lt: new Date(+year, +month, 1),
            };
            const monthName = new Date(+year, +month - 1, 1).toLocaleString('en-US', { month: 'long' });
            fileName = `attendance_${monthName}_${year}.xlsx`;
            sheetTitle = `${monthName} ${year}`;
        } else if (date) {
            // Daily export
            const d = new Date(date);
            const nextDay = new Date(d); nextDay.setDate(nextDay.getDate() + 1);
            filter.date = { $gte: d, $lt: nextDay };
            fileName = `attendance_${date}.xlsx`;
            sheetTitle = date;
        } else {
            return res.status(400).json({ success: false, message: 'Provide date= or month=&year= query params.' });
        }

        // Fetch records and enrich with employee data
        const records = await Attendance.find(filter).lean();
        const employees = await Employee.find({ status: 'active' }).lean();
        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));
        const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

        const rows = records.map(r => {
            const emp = empMap[r.employee_id] || {};
            return {
                employee_id: r.employee_id,
                name: emp.name || r.employee_id,
                department: emp.department_id ? deptMap[emp.department_id.toString()] || '' : '',
                designation: emp.designation || '',
                date: new Date(r.date).toLocaleDateString('en-IN'),
                status: r.status,
                check_in: r.check_in || '',
                check_out: r.check_out || '',
                work_hours: r.work_hours ?? '',
            };
        });

        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'No attendance records found for the selected period.' });
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, sheetTitle);
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.send(buf);
    } catch (err) {
        console.error('[exportAttendance]', err);
        res.status(500).json({ success: false, message: 'Export failed.' });
    }
};

// GET /api/attendance/trends
const getAttendanceTrends = async (req, res) => {
    try {
        const trends = [];
        const totalEmployees = await Employee.countDocuments();

        // Get trends for last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            d.setHours(0, 0, 0, 0);

            const nextD = new Date(d);
            nextD.setDate(d.getDate() + 1);

            const count = await Attendance.countDocuments({
                date: { $gte: d, $lt: nextD },
                status: 'present'
            });

            trends.push({
                date: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                present: count,
                percentage: totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0
            });
        }

        res.status(200).json({ success: true, trends });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

module.exports = {
    getEmployeeAttendance,
    getTeamAttendance,
    clockIn,
    clockOut,
    getTodayStatus,
    updateAttendanceManual,
    markHoliday,
    getAttendanceTrends,
    exportAttendance
};
