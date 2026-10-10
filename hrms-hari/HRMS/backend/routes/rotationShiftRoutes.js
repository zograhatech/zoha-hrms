const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getRotations, createRotation, updateRotationInfo, deleteRotation } = require('../controllers/rotationShiftController');

// All rotation routes require authentication
router.use(auth());

router.get('/', getRotations);
router.post('/', auth(['admin', 'hr_manager', 'manage_shifts']), createRotation);
router.put('/:id', auth(['admin', 'hr_manager', 'manage_shifts']), updateRotationInfo);
router.delete('/:id', auth(['admin', 'hr_manager', 'manage_shifts']), deleteRotation);

module.exports = router;
