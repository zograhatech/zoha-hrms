const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Event = require('../models/Event');
const Holiday = require('../models/Holiday');
const Notification = require('../models/Notification');
const XLSX = require('xlsx');
const { toISTDateString, getISTDayStart, getISTDayEnd, getISOWeekInfo, formatISTTime, formatWorkedHours } = require('../utils/istDate');
const { getVisibleEmployeeScope, isEmployeeVisible, normalizeRole } = require('../utils/visibilityHelper');

// GET /api/attendance/:employeeId
const getEmployeeAttendance = async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { month, year } = req.query;

        // Visibility check: employee can only see self unless admin, manager, team_lead within scope
        const allowed = await isEmployeeVisible(req.user, employeeId);
        if (!allowed) {
            return res.status(403).json({ success: false, message: "Access denied for this employee's records." });
        }

        const filter = { employee_id: employeeId };
        if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            const mStr = String(m).padStart(2, '0');
            const startDayStr = `${y}-${mStr}-01`;
            // Last day of month
            const daysInMonth = new Date(y, m, 0).getDate();
            const endDayStr = `${y}-${mStr}-${String(daysInMonth).padStart(2, '0')}`;
            filter.date = {
                $gte: getISTDayStart(startDayStr),
                $lt: getISTDayEnd(endDayStr),
            };
        }

        const attendance = await Attendance.find(filter).sort({ date: 1, check_in: 1 }).lean();

        // Group by date to compute worked hours per day using IST date
        const byDate = {};
        attendance.forEach(rec => {
            const d = toISTDateString(rec.date);

            if (!byDate[d]) {
                byDate[d] = {
                    date: rec.date,
                    records: [],
                    status: rec.status,
                    check_in: rec.check_in,
                    check_out: rec.check_out,
                    work_hours: 0,
                    is_open_session: false
                };
            }
            byDate[d].records.push(rec);

            // Update status priority
            const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
            if (priority[rec.status] > priority[byDate[d].status]) {
                byDate[d].status = rec.status;
            }
            // Track earliest check_in and latest check_out for the day
            if (rec.check_in && (!byDate[d].check_in || new Date(rec.check_in) < new Date(byDate[d].check_in))) {
                byDate[d].check_in = rec.check_in;
            }
            if (rec.check_out && (!byDate[d].check_out || new Date(rec.check_out) > new Date(byDate[d].check_out))) {
                byDate[d].check_out = rec.check_out;
            }
        });

        // Compute worked hours per day from completed sessions
        const dailyData = Object.values(byDate).map(day => {
            let totalHours = 0;
            let hasOpenSession = false;

            let hasNeedsReview = false;

            day.records.forEach(rec => {
                const isHolidayRow = rec.status === 'holiday';
                const hasCheckIn = !!rec.check_in;
                const hasCheckOut = !!rec.check_out;
                const isInverted = hasCheckIn && hasCheckOut && (new Date(rec.check_out) < new Date(rec.check_in));

                if (rec.needs_review || isInverted) {
                    hasNeedsReview = true;
                }

                if (!isHolidayRow && hasCheckIn && !hasCheckOut) {
                    hasOpenSession = true;
                }

                if (hasCheckIn && hasCheckOut && !isInverted && !rec.needs_review) {
                    const diffMs = new Date(rec.check_out) - new Date(rec.check_in);
                    totalHours += diffMs / (1000 * 60 * 60);
                }
            });

            return {
                date: day.date,
                status: day.status,
                check_in: day.check_in,
                check_out: day.check_out,
                work_hours: Number(totalHours.toFixed(2)),
                is_open_session: hasOpenSession,
                needs_review: hasNeedsReview,
                _id: day.records[0]?._id
            };
        });

        // Summary stats
        const statuses = dailyData.map(d => d.status);
        const present = statuses.filter(s => s === 'present').length;
        const absent = statuses.filter(s => s === 'absent').length;
        const late = statuses.filter(s => s === 'late').length;
        const halfDay = statuses.filter(s => s === 'half-day').length;
        const holiday = statuses.filter(s => s === 'holiday').length;
        const total = statuses.length;
        const totalWorkingDays = present + absent + late + halfDay;

        res.json({
            success: true,
            attendance: dailyData,
            summary: { present, absent, late, halfDay, holiday, total, totalWorkingDays },
        });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};

// GET /api/attendance/team?date=YYYY-MM-DD
const getTeamAttendance = async (req, res) => {
    try {
        const dateStr = req.query.date || toISTDateString(new Date());
        const start = getISTDayStart(dateStr);
        const nextDay = getISTDayEnd(dateStr);

        // Visibility scope
        const scope = await getVisibleEmployeeScope(req.user);
        const empQuery = { status: 'active' };
        if (!scope.isAll) {
            empQuery.id = { $in: scope.visibleIds };
        }

        // Get active employees in scope
        const employees = await Employee.find(empQuery).lean();
        const allowedEmpIds = employees.map(e => e.id);

        const records = await Attendance.find({
            date: { $gte: start, $lt: nextDay },
            employee_id: { $in: allowedEmpIds }
        }).sort({ check_in: 1 }).lean();

        const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
        const depts = await Department.find({ _id: { $in: deptIds } }).lean();
        const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

        // Group records per employee for the day to compute worked hours and open session
        const attByEmp = {};
        records.forEach(rec => {
            if (!attByEmp[rec.employee_id]) {
                attByEmp[rec.employee_id] = {
                    records: [],
                    status: rec.status,
                    check_in: rec.check_in,
                    check_out: rec.check_out,
                };
            }
            attByEmp[rec.employee_id].records.push(rec);

            const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
            if (priority[rec.status] > priority[attByEmp[rec.employee_id].status]) {
                attByEmp[rec.employee_id].status = rec.status;
            }
            if (rec.check_in && (!attByEmp[rec.employee_id].check_in || new Date(rec.check_in) < new Date(attByEmp[rec.employee_id].check_in))) {
                attByEmp[rec.employee_id].check_in = rec.check_in;
            }
            if (rec.check_out && (!attByEmp[rec.employee_id].check_out || new Date(rec.check_out) > new Date(attByEmp[rec.employee_id].check_out))) {
                attByEmp[rec.employee_id].check_out = rec.check_out;
            }
        });

        const attendance = employees.map(emp => {
            const data = attByEmp[emp.id];
            let work_hours = null;
            if (data && data.records.length > 0) {
                let totalHours = 0;
                data.records.forEach(rec => {
                    if (rec.check_in && rec.check_out && !rec.is_open_session) {
                        const diffMs = new Date(rec.check_out) - new Date(rec.check_in);
                        totalHours += diffMs / (1000 * 60 * 60);
                    }
                });
                work_hours = Number(totalHours.toFixed(2));
            }

            return {
                employee_id: emp.id,
                name: emp.name,
                department: emp.department_id ? deptMap[emp.department_id.toString()] : null,
                designation: emp.designation,
                status: data?.status || 'absent',
                check_in: data?.check_in || null,
                check_out: data?.check_out || null,
                work_hours: work_hours,
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

// Helper to find the most recent open session for an employee (all time)
const findOpenSession = async (employeeId) => {
    return await Attendance.findOne({
        employee_id: employeeId,
        check_in: { $exists: true, $ne: null },
        status: { $ne: 'holiday' },
        $or: [{ check_out: { $exists: false } }, { check_out: null }]
    }).sort({ check_in: -1 });
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

        // 1. Check if already clocked in for an active session using findOpenSession
        const activeSession = await findOpenSession(req.user.id);

        if (activeSession) {
            const sessionDate = activeSession.check_in || activeSession.date || new Date();
            const istDateStr = toISTDateString(sessionDate);
            const [y, m, d] = istDateStr.split('-');
            const formattedDate = `${d}/${m}/${y}`;
            const todayIST = toISTDateString(new Date());

            const message = istDateStr !== todayIST
                ? `You have an open session from ${formattedDate}. Clock out first.`
                : 'Cannot clock in while a session is open. Please clock out first.';

            return res.status(400).json({
                success: false,
                message
            });
        }

        // 2. Reject if now is earlier than the latest attendance check_in for this employee
        const now = new Date();
        const latestAttendance = await Attendance.findOne({
            employee_id: req.user.id,
            check_in: { $exists: true, $ne: null }
        }).sort({ check_in: -1 }).lean();

        if (latestAttendance && latestAttendance.check_in && now < new Date(latestAttendance.check_in)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session time. Contact HR.'
            });
        }

        // --- Holiday and Leave Checks ---
        // 1. Check for Holiday
        const todayStr = toISTDateString(new Date());
        const holidayRecord = await Holiday.findOne({ date: todayStr });
        if (holidayRecord) {
            return res.status(400).json({
                success: false,
                message: `Today is a holiday (${holidayRecord.name}). Clock-in is not required.`
            });
        }

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
            status: status,
            is_open_session: true,
            work_hours: 0
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
        // Find the most recent open attendance session using findOpenSession
        const attendance = await findOpenSession(req.user.id);

        if (!attendance || attendance.status === 'holiday' || !attendance.check_in) {
            return res.status(400).json({
                success: false,
                message: (!attendance ? 'No open clock-in session found to clock out from.' : 'No open session to clock out.')
            });
        }

        const now = new Date();
        const checkInTime = new Date(attendance.check_in || attendance.date);
        const isInvertedOrFuture = checkInTime > now;

        let diffHrs = 0;
        if (!isInvertedOrFuture) {
            const diffMs = Math.max(0, now - checkInTime);
            diffHrs = diffMs / (1000 * 60 * 60);
        }

        attendance.check_out = now;
        attendance.work_hours = isInvertedOrFuture ? 0 : Number(diffHrs.toFixed(2));
        attendance.is_open_session = false;

        // If check_in is in the future or check_out < check_in, or session spans multiple IST days
        const checkInIST = toISTDateString(checkInTime);
        const checkOutIST = toISTDateString(now);
        if (isInvertedOrFuture || (checkInIST && checkOutIST && checkInIST !== checkOutIST)) {
            attendance.needs_review = true;
        } else {
            attendance.needs_review = false;
        }

        await attendance.save();

        if (attendance.needs_review) {
            try {
                const emp = await Employee.findOne({ id: attendance.employee_id }).select('_id id name manager_id team_lead_id').lean();
                if (emp) {
                    const notifs = [{
                        recipient: emp._id,
                        type: 'general',
                        title: 'Attendance Session Flagged for Review',
                        message: `Your attendance session on ${checkInIST || 'today'} has been flagged for review.`,
                        data: { status: 'needs_review' }
                    }];

                    const recipientMap = new Map();
                    const mongoose = require('mongoose');
                    if (emp.manager_id) {
                        const mgr = await Employee.findOne({
                            $or: [
                                { id: emp.manager_id },
                                ...(mongoose.Types.ObjectId.isValid(emp.manager_id) ? [{ _id: emp.manager_id }] : [])
                            ]
                        }).select('_id status').lean();
                        if (mgr && mgr.status !== 'inactive' && mgr.status !== 'terminated') {
                            recipientMap.set(mgr._id.toString(), mgr._id);
                        }
                    }
                    if (emp.team_lead_id) {
                        const tl = await Employee.findOne({
                            $or: [
                                { id: emp.team_lead_id },
                                ...(mongoose.Types.ObjectId.isValid(emp.team_lead_id) ? [{ _id: emp.team_lead_id }] : [])
                            ]
                        }).select('_id status').lean();
                        if (tl && tl.status !== 'inactive' && tl.status !== 'terminated') {
                            recipientMap.set(tl._id.toString(), tl._id);
                        }
                    }
                    for (const supId of recipientMap.values()) {
                        notifs.push({
                            recipient: supId,
                            sender: emp._id,
                            type: 'general',
                            title: 'Employee Attendance Session Flagged',
                            message: `Attendance session for ${emp.name || emp.id} on ${checkInIST || 'today'} requires review.`,
                            data: { status: 'needs_review' }
                        });
                    }

                    await Notification.insertMany(notifs);
                }
            } catch (notifErr) {
                console.error('[clockOut] Notification creation failed:', notifErr.message);
            }
        }

        res.json({ success: true, message: 'Clocked out successfully.', attendance });
    } catch (err) {
        console.error('[clockOut]', err);
        res.status(500).json({ success: false, message: 'Server error.' });
    }
};


// GET /api/attendance/today
const getTodayStatus = async (req, res) => {
    try {
        const todayISTStr = toISTDateString(new Date());
        const todayStart = getISTDayStart(todayISTStr);
        const todayEnd = getISTDayEnd(todayISTStr);

        // Find active open session using findOpenSession
        const openSessionRecord = await findOpenSession(req.user.id);
        const open_session = openSessionRecord ? {
            check_in: openSessionRecord.check_in,
            date: openSessionRecord.date
        } : null;

        // attendance record for today's display
        let attendance = openSessionRecord;
        if (!attendance) {
            attendance = await Attendance.findOne({
                employee_id: req.user.id,
                date: { $gte: todayStart, $lt: todayEnd }
            }).sort({ createdAt: -1 });
        }

        const employee = await Employee.findOne({ id: req.user.id }).populate('shift_id');
        const ShiftModel = require('../models/Shift');
        let shift = employee?.shift_id || await ShiftModel.findOne({ is_default: true });

        const dailyCount = await Attendance.countDocuments({
            employee_id: req.user.id,
            date: { $gte: todayStart, $lt: todayEnd }
        });

        const limit = shift?.allowed_clock_ins || 1;

        // Check for Holiday
        const todayStr = toISTDateString(new Date());
        const holidayRecord = await Holiday.findOne({ date: todayStr });
        const holidayEvent = await Event.findOne({
            type: 'holiday',
            date: {
                $gte: todayStart,
                $lt: todayEnd
            }
        });

        const isHoliday = !!(holidayRecord || holidayEvent);
        const holidayName = holidayRecord?.name || holidayEvent?.title;

        // Check for Leave
        const approvedLeave = await Leave.findOne({
            employee_id: req.user.id,
            status: 'approved',
            start_date: { $lte: new Date() },
            end_date: { $gte: todayStart }
        });

        res.json({ 
            success: true, 
            attendance,
            open_session,
            isHoliday,
            holidayName,
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
        const callerRole = normalizeRole(req.user?.role);
        if (callerRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can mark holidays.'
            });
        }
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

// Shared helper to aggregate attendance records by day for a list of employee IDs and date range
const getDailyAttendanceData = async (allowedEmpIds, startDateStr, endDateStr) => {
    const start = getISTDayStart(startDateStr);
    const end = getISTDayEnd(endDateStr);

    const records = await Attendance.find({
        date: { $gte: start, $lt: end },
        employee_id: { $in: allowedEmpIds }
    }).sort({ check_in: 1 }).lean();

    const employees = await Employee.find({ id: { $in: allowedEmpIds } }).select('id name department_id designation').lean();
    const empMap = Object.fromEntries(employees.map(e => [e.id, e]));

    const deptIds = [...new Set(employees.map(e => e.department_id?.toString()).filter(Boolean))];
    const depts = await Department.find({ _id: { $in: deptIds } }).select('name').lean();
    const deptMap = Object.fromEntries(depts.map(d => [d._id.toString(), d.name]));

    // Group records by `employee_id` and IST date `YYYY-MM-DD`
    const grouped = {};
    records.forEach(rec => {
        const dStr = toISTDateString(rec.date);
        const key = `${rec.employee_id}__${dStr}`;
        if (!grouped[key]) {
            grouped[key] = {
                employee_id: rec.employee_id,
                date: dStr,
                records: [],
                status: rec.status,
                check_in: rec.check_in,
                check_out: rec.check_out,
            };
        }
        grouped[key].records.push(rec);

        const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
        if (priority[rec.status] > priority[grouped[key].status]) {
            grouped[key].status = rec.status;
        }
        if (rec.check_in && (!grouped[key].check_in || new Date(rec.check_in) < new Date(grouped[key].check_in))) {
            grouped[key].check_in = rec.check_in;
        }
        if (rec.check_out && (!grouped[key].check_out || new Date(rec.check_out) > new Date(grouped[key].check_out))) {
            grouped[key].check_out = rec.check_out;
        }
    });

    const dailyRows = Object.values(grouped).map(item => {
        let totalHours = 0;
        let totalMinutes = 0;
        let hasOpenSession = false;
        let isHoliday = item.status === 'holiday';
        let hasNeedsReview = false;

        item.records.forEach(rec => {
            const isHolidayRow = rec.status === 'holiday';
            if (isHolidayRow) isHoliday = true;
            if (rec.needs_review) hasNeedsReview = true;
            const hasCheckIn = !!rec.check_in;
            const hasCheckOut = !!rec.check_out;
            const isInverted = hasCheckIn && hasCheckOut && (new Date(rec.check_out) < new Date(rec.check_in));

            if (!isHolidayRow && hasCheckIn && !hasCheckOut) {
                hasOpenSession = true;
            }

            if (hasCheckIn && hasCheckOut && !isInverted && !rec.needs_review) {
                const diffMs = new Date(rec.check_out) - new Date(rec.check_in);
                totalHours += diffMs / (1000 * 60 * 60);
                totalMinutes += diffMs / (1000 * 60);
            }
        });

        const emp = empMap[item.employee_id] || {};
        const deptName = emp.department_id ? (deptMap[emp.department_id.toString()] || '—') : '—';
        const roundedMinutes = Math.round(totalMinutes);
        const workedHoursFormatted = (isHoliday || hasNeedsReview)
            ? '—'
            : formatWorkedHours(roundedMinutes, { isHoliday, needsReview: hasNeedsReview, fromMinutes: true });

        return {
            employee_id: item.employee_id,
            name: emp.name || item.employee_id,
            department: deptName,
            date: item.date,
            first_check_in: item.check_in || null,
            last_check_out: item.check_out || null,
            worked_hours: Number(totalHours.toFixed(2)),
            total_minutes: roundedMinutes,
            worked_hours_formatted: workedHoursFormatted,
            open_session: hasOpenSession,
            status: item.status,
            needs_review: hasNeedsReview
        };
    });

    // Sort by date ascending, then employee_id
    dailyRows.sort((a, b) => (a.date === b.date ? a.employee_id.localeCompare(b.employee_id) : a.date.localeCompare(b.date)));

    return { dailyRows, empMap };
};

// GET /api/attendance/logs?employee_id=&from=&to=&view=daily|weekly|monthly
const getAttendanceLogs = async (req, res) => {
    try {
        const { employee_id, from, to, view = 'daily' } = req.query;

        // Visibility check
        const scope = await getVisibleEmployeeScope(req.user);
        let targetEmpIds = [];

        if (employee_id) {
            const allowed = await isEmployeeVisible(req.user, employee_id);
            if (!allowed) {
                return res.status(403).json({ success: false, message: "Access denied for this employee's records." });
            }
            targetEmpIds = [employee_id];
        } else {
            if (scope.isAll) {
                const allEmps = await Employee.find({ status: 'active' }).select('id').lean();
                targetEmpIds = allEmps.map(e => e.id);
            } else {
                targetEmpIds = scope.visibleIds;
            }
        }

        // Determine date range (IST dates YYYY-MM-DD)
        const todayIST = toISTDateString(new Date());
        let fromDateStr = from || todayIST;
        let toDateStr = to || fromDateStr;

        if (fromDateStr > toDateStr) {
            const tmp = fromDateStr;
            fromDateStr = toDateStr;
            toDateStr = tmp;
        }

        // Validate range <= 366 days
        const startDay = new Date(fromDateStr);
        const endDay = new Date(toDateStr);
        const diffDays = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 366) {
            return res.status(400).json({ success: false, message: 'Date range cannot exceed 366 days.' });
        }

        const { dailyRows } = await getDailyAttendanceData(targetEmpIds, fromDateStr, toDateStr);

        let finalRows = [];
        if (view === 'daily') {
            finalRows = dailyRows;
        } else if (view === 'weekly') {
            // Group by employee_id + ISO week
            const weeklyGroups = {};
            dailyRows.forEach(row => {
                const weekInfo = getISOWeekInfo(row.date);
                const key = `${row.employee_id}__${weekInfo.key}`;
                if (!weeklyGroups[key]) {
                    weeklyGroups[key] = {
                        employee_id: row.employee_id,
                        name: row.name,
                        week: weekInfo.key,
                        date: weekInfo.label,
                        first_check_in: row.first_check_in,
                        last_check_out: row.last_check_out,
                        worked_hours: 0,
                        open_session: false
                    };
                }
                const g = weeklyGroups[key];
                g.worked_hours += row.worked_hours;
                if (row.open_session) g.open_session = true;
                if (row.first_check_in && (!g.first_check_in || new Date(row.first_check_in) < new Date(g.first_check_in))) {
                    g.first_check_in = row.first_check_in;
                }
                if (row.last_check_out && (!g.last_check_out || new Date(row.last_check_out) > new Date(g.last_check_out))) {
                    g.last_check_out = row.last_check_out;
                }
            });
            finalRows = Object.values(weeklyGroups).map(w => ({
                ...w,
                worked_hours: Number(w.worked_hours.toFixed(2))
            }));
            finalRows.sort((a, b) => (a.week === b.week ? a.employee_id.localeCompare(b.employee_id) : a.week.localeCompare(b.week)));
        } else if (view === 'monthly') {
            // Group by employee_id + YYYY-MM
            const monthlyGroups = {};
            dailyRows.forEach(row => {
                const mKey = row.date.substring(0, 7); // 'YYYY-MM'
                const key = `${row.employee_id}__${mKey}`;
                if (!monthlyGroups[key]) {
                    monthlyGroups[key] = {
                        employee_id: row.employee_id,
                        name: row.name,
                        month: mKey,
                        date: mKey,
                        first_check_in: row.first_check_in,
                        last_check_out: row.last_check_out,
                        worked_hours: 0,
                        open_session: false
                    };
                }
                const g = monthlyGroups[key];
                g.worked_hours += row.worked_hours;
                if (row.open_session) g.open_session = true;
                if (row.first_check_in && (!g.first_check_in || new Date(row.first_check_in) < new Date(g.first_check_in))) {
                    g.first_check_in = row.first_check_in;
                }
                if (row.last_check_out && (!g.last_check_out || new Date(row.last_check_out) > new Date(g.last_check_out))) {
                    g.last_check_out = row.last_check_out;
                }
            });
            finalRows = Object.values(monthlyGroups).map(m => ({
                ...m,
                worked_hours: Number(m.worked_hours.toFixed(2))
            }));
            finalRows.sort((a, b) => (a.month === b.month ? a.employee_id.localeCompare(b.employee_id) : a.month.localeCompare(b.month)));
        }

        const totalWorkedHours = Number(finalRows.reduce((sum, r) => sum + (r.worked_hours || 0), 0).toFixed(2));

        res.json({
            success: true,
            view,
            from: fromDateStr,
            to: toDateStr,
            totalRows: finalRows.length,
            totalWorkedHours,
            logs: finalRows
        });
    } catch (err) {
        console.error('[getAttendanceLogs]', err);
        res.status(500).json({ success: false, message: 'Server error while fetching attendance logs.' });
    }
};

// GET /api/attendance/export?date=YYYY-MM-DD  OR  ?month=M&year=YYYY  OR  ?from=&to=&employee_id=
const exportAttendance = async (req, res) => {
    try {
        const { date, month, year, from, to, employee_id } = req.query;

        // Visibility scope
        const scope = await getVisibleEmployeeScope(req.user);
        let targetEmpIds = [];

        if (employee_id) {
            const allowed = await isEmployeeVisible(req.user, employee_id);
            if (!allowed) {
                return res.status(403).json({ success: false, message: "Access denied for this employee's records." });
            }
            targetEmpIds = [employee_id];
        } else {
            if (scope.isAll) {
                const allEmps = await Employee.find({ status: 'active' }).select('id').lean();
                targetEmpIds = allEmps.map(e => e.id);
            } else {
                targetEmpIds = scope.visibleIds;
            }
        }

        let startDateStr = '';
        let endDateStr = '';
        let fileName = 'attendance_export.xlsx';
        let sheetTitle = 'Attendance';

        if (from || to) {
            startDateStr = from || toISTDateString(new Date());
            endDateStr = to || startDateStr;
            if (startDateStr > endDateStr) {
                const tmp = startDateStr;
                startDateStr = endDateStr;
                endDateStr = tmp;
            }
            fileName = `attendance_${startDateStr}_to_${endDateStr}.xlsx`;
            sheetTitle = `${startDateStr} to ${endDateStr}`;
        } else if (month && year) {
            const m = parseInt(month);
            const y = parseInt(year);
            const mStr = String(m).padStart(2, '0');
            const daysInMonth = new Date(y, m, 0).getDate();
            startDateStr = `${y}-${mStr}-01`;
            endDateStr = `${y}-${mStr}-${String(daysInMonth).padStart(2, '0')}`;
            const monthName = new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long' });
            fileName = `attendance_${monthName}_${year}.xlsx`;
            sheetTitle = `${monthName} ${year}`;
        } else if (date) {
            startDateStr = date;
            endDateStr = date;
            fileName = `attendance_${date}.xlsx`;
            sheetTitle = date;
        } else {
            return res.status(400).json({ success: false, message: 'Provide date=, month=&year=, or from=&to= query params.' });
        }

        // Validate range <= 366 days
        const startDay = new Date(startDateStr);
        const endDay = new Date(endDateStr);
        const diffDays = Math.round((endDay - startDay) / (1000 * 60 * 60 * 24)) + 1;
        if (diffDays > 366) {
            return res.status(400).json({ success: false, message: 'Date range cannot exceed 366 days.' });
        }

        const { dailyRows } = await getDailyAttendanceData(targetEmpIds, startDateStr, endDateStr);

        if (dailyRows.length === 0) {
            return res.status(404).json({ success: false, message: 'No attendance records found for the selected period.' });
        }

        const rows = dailyRows.map(r => ({
            'Employee ID': r.employee_id,
            'Employee Name': r.name,
            'Department': r.department || '—',
            'Date': r.date,
            'First Check In': formatISTTime(r.first_check_in),
            'Last Check Out': formatISTTime(r.last_check_out),
            'Worked Hours': (r.status === 'holiday' || r.needs_review)
                ? '—'
                : (r.worked_hours_formatted || formatWorkedHours(r.total_minutes ?? Math.round((r.worked_hours || 0) * 60), { isHoliday: r.status === 'holiday', needsReview: r.needs_review, fromMinutes: true })),
            'Open Session': r.open_session ? 'Yes' : 'No'
        }));

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

            const dayRecords = await Attendance.find({
                date: { $gte: d, $lt: nextD },
                status: 'present'
            }).select('employee_id').lean();
            const count = new Set(dayRecords.map(r => r.employee_id)).size;

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
    exportAttendance,
    getAttendanceLogs
};

