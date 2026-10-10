const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const auth = require('../middleware/auth');

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
        const event = await Event.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!event) return res.status(404).json({ success: false, message: 'Event not found' });
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
