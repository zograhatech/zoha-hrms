const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getDepartments,
    createDepartment,
    updateDepartment,
    deleteDepartment,
} = require('../controllers/departmentController');

router.get('/', auth(['hr_manager', 'hr', 'employee']), getDepartments);
router.post('/', auth(['manage_departments']), createDepartment);
router.put('/:id', auth(['manage_departments']), updateDepartment);
router.delete('/:id', auth(['manage_departments']), deleteDepartment);


module.exports = router;
