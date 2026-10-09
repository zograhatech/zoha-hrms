const Shift = require('../models/Shift');

const getShifts = async (req, res) => {
    try {
        const shifts = await Shift.find();
        res.json({ success: true, shifts });
    } catch (err) {
        console.error('[getShifts]', err);
        res.status(500).json({ success: false, message: 'Server error fetching shifts.' });
    }
};

const createShift = async (req, res) => {
    try {
        const { name, start_time, end_time, grace_period, half_day_min_hours, full_day_min_hours, days, is_default, allowed_clock_ins } = req.body;

        const existing = await Shift.findOne({ name });
        if (existing) return res.status(400).json({ success: false, message: 'Shift with this name already exists.' });

        if (is_default) {
            await Shift.updateMany({}, { is_default: false });
        }

        const shift = await Shift.create({
            name, start_time, end_time, grace_period, half_day_min_hours, full_day_min_hours, days, is_default: !!is_default, allowed_clock_ins: allowed_clock_ins || 1
        });

        res.status(201).json({ success: true, message: 'Shift created successfully.', shift });
    } catch (err) {
        console.error('[createShift]', err);
        res.status(500).json({ success: false, message: 'Server error creating shift.' });
    }
};

const updateShift = async (req, res) => {
    try {
        if (req.body.is_default) {
            await Shift.updateMany({ _id: { $ne: req.params.id } }, { is_default: false });
        }
        const shift = await Shift.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        );
        if (!shift) return res.status(404).json({ success: false, message: 'Shift not found.' });
        res.json({ success: true, message: 'Shift updated.', shift });
    } catch (err) {
        console.error('[updateShift]', err);
        res.status(500).json({ success: false, message: 'Server error updating shift.' });
    }
};

const deleteShift = async (req, res) => {
    try {
        const shift = await Shift.findByIdAndDelete(req.params.id);
        if (!shift) return res.status(404).json({ success: false, message: 'Shift not found.' });
        res.json({ success: true, message: 'Shift deleted successfully.' });
    } catch (err) {
        console.error('[deleteShift]', err);
        res.status(500).json({ success: false, message: 'Server error deleting shift.' });
    }
};

module.exports = { getShifts, createShift, updateShift, deleteShift };
