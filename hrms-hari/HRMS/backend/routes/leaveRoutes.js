const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getEmployeeLeaves, getPendingLeaves, applyLeave, approveLeave, rejectLeave } = require('../controllers/leaveController');

router.get('/pending', auth(['manage_leaves', 'manager', 'team_lead', 'admin']), getPendingLeaves);

router.post('/apply', auth(), applyLeave);
router.put('/:id/approve', auth(['manage_leaves', 'manager', 'team_lead', 'admin']), approveLeave);
router.put('/:id/reject', auth(['manage_leaves', 'manager', 'team_lead', 'admin']), rejectLeave);

router.get('/:employeeId', auth(), getEmployeeLeaves);

module.exports = router;
