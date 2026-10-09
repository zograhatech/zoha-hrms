const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const auth = require('../middleware/auth');

// @desc    Get all notes for an employee
// @route   GET /api/notes
// @access  Private
router.get('/', auth(), async (req, res) => {
    try {
        console.log(`[Notes] Fetching notes for user: ${req.user.id}`);
        const notes = await Note.find({ employee_id: req.user.id }).sort({ date: 1 });
        res.json({ success: true, notes });
    } catch (error) {
        console.error('[Notes Error]', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// @desc    Create or Update a note
// @route   POST /api/notes
// @access  Private
router.post('/', auth(), async (req, res) => {
    try {
        const { date, content } = req.body;
        if (!date || !content) {
            return res.status(400).json({ success: false, message: 'Date and content are required' });
        }

        const cleanDate = new Date(date);
        cleanDate.setHours(0, 0, 0, 0);

        const note = await Note.findOneAndUpdate(
            { employee_id: req.user.id, date: cleanDate },
            { content },
            { upsert: true, new: true }
        );

        res.json({ success: true, note });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
});

// @desc    Delete a note
// @route   DELETE /api/notes/:id
// @access  Private
router.delete('/:id', auth(), async (req, res) => {
    try {
        const note = await Note.findOneAndDelete({ _id: req.params.id, employee_id: req.user.id });
        if (!note) return res.status(404).json({ success: false, message: 'Note not found' });
        res.json({ success: true, message: 'Note removed' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
