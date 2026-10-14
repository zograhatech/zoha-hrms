const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Event = require('../models/Event');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const auth = require('../middleware/auth');
const { normalizeRole } = require('../utils/visibilityHelper');
const { toISTDateString } = require('../utils/istDate');

async function sendHolidayEventNotifications(event, user) {
    const activeEmployees = await Employee.find({ status: 'active' }).select('_id').lean();
    if (activeEmployees.length > 0) {
        const senderId = (user?._id && mongoose.Types.ObjectId.isValid(user._id))
            ? user._id
            : (mongoose.Types.ObjectId.isValid(user?.id) ? user.id : null);
        const dateStr = toISTDateString(event.date);

        const notifs = activeEmployees.map(emp => ({
            recipient: emp._id,
            sender: senderId,
            type: 'holiday',
            title: 'New Holiday Announced',
            message: `${event.title} has been declared a holiday on ${dateStr}.`,
            is_read: false
        }));
        await Notification.insertMany(notifs);
    }
}

// @desc    Get all events
// @route   GET /api/events
// @access  Private
router.get('/', auth(), async (req, res) => {
    try {
        console.log(`[GET /api/events] User: ${req.user.email}`);
        const events = await Event.find().populate('createdBy', 'name email');
        res.json({ success: true, events });
    } catch (error) {
        console.error('[GET /api/events] Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Create an event
// @route   POST /api/events
// @access  Private (Admin/HR)
router.post('/', auth(['hr_manager', 'manage_events']), async (req, res) => {
    try {
        console.log(`[POST /api/events] User: ${req.user.email}, Body:`, req.body);
        const { title, description, date, startTime, endTime, type, color } = req.body;
        
        if (type === 'holiday' && normalizeRole(req.user?.role) !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can create holiday events.'
            });
        }

        const event = await Event.create({
            title,
            description,
            date,
            startTime,
            endTime,
            type,
            color,
            createdBy: req.user._id
        });

        if (event.type === 'holiday') {
            await sendHolidayEventNotifications(event, req.user);
        }

        res.status(201).json({ success: true, event });
    } catch (error) {
        console.error('[POST /api/events] Error:', error);
        res.status(400).json({ success: false, message: error.message });
    }
});

// @desc    Update an event
// @route   PUT /api/events/:id
// @access  Private (Admin/HR)
router.put('/:id', auth(['hr_manager', 'manage_events']), async (req, res) => {
    try {
        if (req.body.type === 'holiday' && normalizeRole(req.user?.role) !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can update events to type holiday.'
            });
        }
        const existing = await Event.findById(req.params.id);
        if (!existing) return res.status(404).json({ success: false, message: 'Event not found' });
        if (existing.type === 'holiday' && normalizeRole(req.user?.role) !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden. Only Super Admins can update holiday events.'
            });
        }

        const isTypeChangedToHoliday = existing.type !== 'holiday' && req.body.type === 'holiday';
        const finalType = req.body.type !== undefined ? req.body.type : existing.type;
        const isHolidayDateChanged = finalType === 'holiday' && req.body.date && toISTDateString(req.body.date) !== toISTDateString(existing.date);
        const shouldNotify = isTypeChangedToHoliday || isHolidayDateChanged;

        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });

        if (shouldNotify && event) {
            await sendHolidayEventNotifications(event, req.user);
        }

        res.json({ success: true, event });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// @desc    Delete an event
// @route   DELETE /api/events/:id
// @access  Private (Admin/HR)
router.delete('/:id', auth(['hr_manager', 'manage_events']), async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);
        if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
        res.json({ success: true, message: 'Event removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
