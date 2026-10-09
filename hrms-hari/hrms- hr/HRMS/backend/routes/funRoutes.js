const express = require('express');
const router = express.Router();
const FunSubmission = require('../models/FunSubmission');
const auth = require('../middleware/auth'); // Assuming this exists for auth

// @route   POST api/fun/submit
// @desc    Submit a joke, idea, or suggestion
// @access  Private
router.post('/submit', auth(), async (req, res) => {
    try {
        const { type, content } = req.body;
        
        if (!['joke', 'idea', 'suggestion'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid submission type.' });
        }

        if (!content || content.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Content cannot be empty.' });
        }

        const newSubmission = new FunSubmission({
            employeeId: req.user.id,
            employeeName: req.user.name || 'Anonymous', // Fallback
            type,
            content
        });

        await newSubmission.save();
        res.json({ success: true, message: 'Thank you for your submission!' });
    } catch (err) {
        console.error('Fun submission error:', err);
        res.status(500).json({ success: false, message: err.message || 'Server Error' });
    }
});

// @route   GET api/fun/summary
// @desc    Get all submissions from the most recent Thursday
// @access  HR/Admin Only
router.get('/summary', auth(['hr_manager', 'hr', 'manage_fun', 'fun']), async (req, res) => {
    try {

        // Get the most recent Thursday
        const today = new Date();
        // (today.getDay() + 3) % 7 calculates days since last Thursday
        const diff = (today.getDay() + 3) % 7; 
        const lastThursday = new Date(today);
        lastThursday.setDate(today.getDate() - diff);
        lastThursday.setHours(0, 0, 0, 0);

        const summaries = await FunSubmission.find({
            createdAt: { $gte: lastThursday }
        }).sort({ createdAt: -1 });

        res.json({ success: true, summaries: summaries || [] });
    } catch (err) {
        console.error('Fun summary error:', err);
        res.status(500).json({ success: false, message: err.message || 'Server Error' });
    }
});

module.exports = router;
