const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    getOnboardings,
    createOnboarding,
    updateOnboarding,
    deleteOnboarding,
    promoteOnboarding
} = require('../controllers/onboardingController');

router.get('/', auth(['hr_manager', 'admin', 'manage_employees']), getOnboardings);
router.post('/', auth(['hr_manager', 'admin', 'manage_employees']), createOnboarding);
router.put('/:id', auth(['hr_manager', 'admin', 'manage_employees']), updateOnboarding);
router.post('/:id/promote', auth(['hr_manager', 'admin', 'manage_employees']), promoteOnboarding);
router.delete('/:id', auth(['hr_manager', 'admin', 'manage_employees']), deleteOnboarding);

module.exports = router;
