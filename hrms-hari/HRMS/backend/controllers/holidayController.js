const Holiday = require('../models/Holiday');
const Event = require('../models/Event');
const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const { toISTDateString, getISTDayStart, getISTDayEnd } = require('../utils/istDate');
const { normalizeRole } = require('../utils/visibilityHelper');

// POST /api/holidays (SuperAdmin only)
const createHoliday = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role);
        if (callerRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can create holidays.'
            });
        }

        const { date, name } = req.body;
        if (!date || !name || !String(name).trim()) {
            return res.status(400).json({
                success: false,
                message: 'Holiday date and name are required.'
            });
        }

        const dateStr = toISTDateString(date);
        if (!dateStr) {
            return res.status(400).json({
                success: false,
                message: 'Invalid holiday date provided.'
            });
        }

        const existing = await Holiday.findOne({ date: dateStr });
        if (existing) {
            return res.status(400).json({
                success: false,
                message: 'A holiday already exists on this date.'
            });
        }

        const holiday = await Holiday.create({
            date: dateStr,
            name: String(name).trim(),
            createdBy: String(req.user.id || req.user._id || 'admin')
        });

        // Fan-out notifications to every active employee
        const activeEmployees = await Employee.find({ status: 'active' }).select('_id id').lean();
        if (activeEmployees.length > 0) {
            const senderId = (req.user?._id && mongoose.Types.ObjectId.isValid(req.user._id))
                ? req.user._id
                : (mongoose.Types.ObjectId.isValid(req.user?.id) ? req.user.id : null);

            const notifs = activeEmployees.map(emp => ({
                recipient: emp._id,
                sender: senderId,
                type: 'holiday',
                title: 'New Holiday Announced',
                message: `${holiday.name} has been declared a holiday on ${dateStr}.`,
                is_read: false
            }));
            await Notification.insertMany(notifs);

            // Populate Attendance for active employees who joined on or before the holiday date and do not have an attendance record on this date
            const holidayDayStart = getISTDayStart(dateStr);
            const holidayDayEnd = getISTDayEnd(dateStr);

            const eligibleEmployees = await Employee.find({
                status: 'active',
                date_of_joining: { $lte: holidayDayEnd }
            }).select('_id id').lean();

            if (eligibleEmployees.length > 0) {
                const eligibleIds = eligibleEmployees.map(e => e.id || e._id);
                const existingRecords = await Attendance.find({
                    employee_id: { $in: eligibleIds },
                    date: { $gte: holidayDayStart, $lt: holidayDayEnd }
                }).select('employee_id').lean();

                const existingSet = new Set(existingRecords.map(r => String(r.employee_id)));
                const toInsert = [];
                for (const emp of eligibleEmployees) {
                    const empId = String(emp.id || emp._id);
                    if (!existingSet.has(empId)) {
                        toInsert.push({
                            employee_id: empId,
                            date: holidayDayStart,
                            status: 'holiday',
                            work_hours: 0,
                            is_open_session: false
                        });
                    }
                }
                if (toInsert.length > 0) {
                    await Attendance.insertMany(toInsert);
                }
            }
        }

        res.status(201).json({
            success: true,
            message: 'Holiday created successfully',
            holiday
        });
    } catch (err) {
        console.error('[createHoliday]', err);
        res.status(500).json({ success: false, message: 'Server error creating holiday.' });
    }
};

// GET /api/holidays/upcoming (All roles)
const getUpcomingHolidays = async (req, res) => {
    try {
        const todayStr = toISTDateString(new Date());
        const todayStart = getISTDayStart(todayStr);

        const [holidays, eventHolidays] = await Promise.all([
            Holiday.find({ date: { $gte: todayStr } }).sort({ date: 1 }).lean(),
            Event.find({ type: 'holiday', date: { $gte: todayStart } }).sort({ date: 1 }).lean()
        ]);

        const seenDates = new Set();
        const combined = [];

        for (const h of holidays) {
            const d = toISTDateString(h.date);
            if (!seenDates.has(d)) {
                seenDates.add(d);
                combined.push({
                    _id: h._id,
                    name: h.name,
                    date: d
                });
            }
        }

        for (const e of eventHolidays) {
            const d = toISTDateString(e.date);
            if (!seenDates.has(d)) {
                seenDates.add(d);
                combined.push({
                    _id: e._id,
                    name: e.title,
                    date: d
                });
            }
        }

        combined.sort((a, b) => a.date.localeCompare(b.date));
        res.json({ success: true, holidays: combined });
    } catch (err) {
        console.error('[getUpcomingHolidays]', err);
        res.status(500).json({ success: false, message: 'Server error fetching upcoming holidays.' });
    }
};

// GET /api/holidays (All roles)
const getHolidays = async (req, res) => {
    try {
        const [holidays, eventHolidays] = await Promise.all([
            Holiday.find().sort({ date: 1 }).lean(),
            Event.find({ type: 'holiday' }).sort({ date: 1 }).lean()
        ]);

        const seenDates = new Set();
        const combined = [];

        for (const h of holidays) {
            const d = toISTDateString(h.date);
            if (!seenDates.has(d)) {
                seenDates.add(d);
                combined.push({
                    _id: h._id,
                    name: h.name,
                    date: d
                });
            }
        }

        for (const e of eventHolidays) {
            const d = toISTDateString(e.date);
            if (!seenDates.has(d)) {
                seenDates.add(d);
                combined.push({
                    _id: e._id,
                    name: e.title,
                    date: d
                });
            }
        }

        combined.sort((a, b) => a.date.localeCompare(b.date));
        res.json({ success: true, holidays: combined });
    } catch (err) {
        console.error('[getHolidays]', err);
        res.status(500).json({ success: false, message: 'Server error fetching holidays.' });
    }
};

// DELETE /api/holidays/:id (SuperAdmin only)
const deleteHoliday = async (req, res) => {
    try {
        const callerRole = normalizeRole(req.user?.role);
        if (callerRole !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can delete holidays.'
            });
        }

        const deleted = await Holiday.findByIdAndDelete(req.params.id);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'Holiday not found.' });
        }

        res.json({ success: true, message: 'Holiday deleted successfully.' });
    } catch (err) {
        console.error('[deleteHoliday]', err);
        res.status(500).json({ success: false, message: 'Server error deleting holiday.' });
    }
};

module.exports = {
    createHoliday,
    getUpcomingHolidays,
    getHolidays,
    deleteHoliday
};
