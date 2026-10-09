const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getGoals, createGoal, updateGoal, deleteGoal, updateKPI } = require('../controllers/performanceController');

router.get('/', auth(), getGoals);
router.post('/', auth(['hr_manager', 'admin', 'manage_employees']), createGoal);
router.put('/:id', auth(['hr_manager', 'admin', 'manage_employees']), updateGoal);
router.delete('/:id', auth(['hr_manager', 'admin', 'manage_employees']), deleteGoal);

// KPI Tracking
router.patch('/kpi', auth(), updateKPI);

module.exports = router;
