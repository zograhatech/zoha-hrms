const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const holidayController = require('../controllers/holidayController');

// SuperAdmin only to create holidays
router.post('/', auth(['admin']), holidayController.createHoliday);

// All authenticated roles can fetch upcoming holidays
router.get('/upcoming', auth(), holidayController.getUpcomingHolidays);

// All authenticated roles can fetch all holidays
router.get('/', auth(), holidayController.getHolidays);

// SuperAdmin only to delete holidays
router.delete('/:id', auth(['admin']), holidayController.deleteHoliday);

module.exports = router;

