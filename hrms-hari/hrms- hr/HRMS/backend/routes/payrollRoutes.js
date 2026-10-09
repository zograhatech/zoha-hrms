const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const checkSubscription = require('../middleware/subscription');
const multer = require('multer');
const { getEmployeePayroll, getAllPayroll, getAnalytics, createPayroll, markAsPaid, bulkMarkAsPaid, exportPayroll, importPayroll, downloadPayrollTemplate } = require('../controllers/payrollController');

const upload = multer({ storage: multer.memoryStorage() });

router.get('/all', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), getAllPayroll);
router.get('/analytics', auth(['view_analytics', 'analytics', 'hr_manager', 'hr']), getAnalytics);
router.get('/export', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), exportPayroll);
router.get('/template', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), downloadPayrollTemplate);
router.post('/import', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), upload.single('file'), importPayroll);
router.post('/create', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), createPayroll);
router.put('/bulk-pay', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), bulkMarkAsPaid);
router.put('/:id/pay', auth(['manage_payroll', 'payroll_admin', 'hr_manager', 'hr']), markAsPaid);

router.get('/:employeeId', auth(), getEmployeePayroll);

module.exports = router;
