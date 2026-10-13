const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const {
    getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
    setSuperAdminStatus,
    updateAssignments,
    getStats, getUpcomingEvents,
    getDashboardOverview, exportEmployees, importEmployees, downloadEmployeeTemplate
} = require('../controllers/employeeController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/stats', auth(['view_analytics', 'manager', 'team_lead']), getStats);
router.get('/analytics-stats', auth(), getStats);
router.get('/dashboard-overview', auth(), getDashboardOverview);
router.get('/upcoming-events', auth(), getUpcomingEvents);
router.get('/export', auth(['manage_employees', 'manager', 'team_lead']), exportEmployees);
router.get('/template', auth(['manage_employees', 'manager', 'team_lead']), downloadEmployeeTemplate);
router.post('/import', auth(['manage_employees', 'manager', 'team_lead']), upload.single('file'), importEmployees);

router.get('/', auth(), getEmployees);
router.get('/all', auth(), getEmployees);
router.get('/directory', auth(), require('../controllers/conversationController').getContactDirectory);
router.get('/:id', auth(), getEmployee);
router.post('/', auth(['manage_employees', 'manager', 'team_lead', 'admin']), createEmployee);
router.put('/:id', auth(), upload.single('profile_image'), updateEmployee);
router.patch('/:id/super-admin', auth(), setSuperAdminStatus);
router.patch('/:id/assignments', auth(['manage_employees', 'manager', 'admin']), updateAssignments);
router.delete('/:id', auth(['manage_employees', 'manager', 'team_lead', 'admin']), deleteEmployee);

module.exports = router;
