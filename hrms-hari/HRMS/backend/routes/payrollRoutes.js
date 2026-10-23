const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const checkSubscription = require('../middleware/subscription');
const multer = require('multer');
const { getEmployeePayroll, getAllPayroll, getAnalytics, createPayroll, previewPayroll, markAsPaid, bulkMarkAsPaid, exportPayroll, importPayroll, downloadPayrollTemplate, reconcilePayroll, exportPayslipsExcel, exportPayslipPdf } = require('../controllers/payrollController');

const upload = multer({ storage: multer.memoryStorage() });

// Strictly SuperAdmin (role 'admin') only. Permission flags, manager, team_lead, employee cannot bypass.
const requireAdmin = (req, res, next) => {
    const roleLower = (req.user?.role || '').toLowerCase().replace(/\s+/g, '');
    if (roleLower !== 'admin') {
        return res.status(403).json({ success: false, message: 'Access denied: Admin only.' });
    }
    next();
};

router.use(auth());
router.use(requireAdmin);

router.get('/all', getAllPayroll);
router.get('/analytics', getAnalytics);
router.get('/export', exportPayroll);
router.get('/template', downloadPayrollTemplate);
router.get('/reconcile', reconcilePayroll);
router.get('/payslips/export', exportPayslipsExcel);
router.get('/payslip/:id/pdf', exportPayslipPdf);
router.post('/import', upload.single('file'), importPayroll);
router.post('/preview', previewPayroll);
router.post('/create', createPayroll);
router.put('/bulk-pay', bulkMarkAsPaid);
router.put('/:id/pay', markAsPaid);

router.get('/:employeeId', getEmployeePayroll);

module.exports = router;
