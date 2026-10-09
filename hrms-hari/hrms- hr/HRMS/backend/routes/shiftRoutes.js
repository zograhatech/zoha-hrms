const express = require('express');
const router = express.Router();
const { getShifts, createShift, updateShift, deleteShift } = require('../controllers/shiftController');
const auth = require('../middleware/auth');

router.get('/', auth(['manage_shifts', 'manage_employees', 'hr_manager', 'hr', 'shifts']), getShifts);
router.post('/', auth(['manage_shifts', 'hr_manager', 'hr', 'shifts']), createShift);
router.put('/:id', auth(['manage_shifts', 'hr_manager', 'hr', 'shifts']), updateShift);
router.delete('/:id', auth(['manage_shifts', 'hr_manager', 'hr', 'shifts']), deleteShift);


module.exports = router;
