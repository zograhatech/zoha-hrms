const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const {
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee, getStats, getUpcomingEvents,
    getDashboardOverview, exportEmployees, importEmployees, downloadEmployeeTemplate
} = require('../controllers/employeeController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/stats', auth(['view_analytics', 'hr_manager', 'hr']), getStats);
router.get('/analytics-stats', auth(), getStats);
router.get('/dashboard-overview', auth(), getDashboardOverview);
router.get('/upcoming-events', auth(), getUpcomingEvents);
router.get('/export', auth(['manage_employees', 'hr_manager', 'hr']), exportEmployees);
router.get('/template', auth(['manage_employees', 'hr_manager', 'hr']), downloadEmployeeTemplate);
router.post('/import', auth(['manage_employees', 'hr_manager', 'hr']), upload.single('file'), importEmployees);

router.get('/', auth(), getEmployees);
router.get('/all', auth(), getEmployees);
router.get('/:id', auth(), getEmployee);
router.post('/', auth(['manage_employees']), createEmployee);
router.put('/:id', auth(), upload.single('profile_image'), updateEmployee);
router.delete('/:id', auth(['manage_employees']), deleteEmployee);

module.exports = router;
