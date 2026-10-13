const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getDepartmentEmployees,
} = require('../controllers/departmentController');

router.get('/', auth(['manager', 'team_lead', 'employee', 'admin']), getDepartments);
router.post('/', auth(['manage_departments', 'manager', 'team_lead', 'admin']), createDepartment);
router.put('/:id', auth(['manage_departments', 'manager', 'admin']), updateDepartment);
router.delete('/:id', auth(['manage_departments', 'manager', 'admin']), deleteDepartment);
router.get('/:id/employees', auth(['manager', 'admin']), getDepartmentEmployees);


module.exports = router;
