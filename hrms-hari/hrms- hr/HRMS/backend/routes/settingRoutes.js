const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { getSettings, updateSettings, sendTestEmail, getBranding } = require('../controllers/settingController');
const auth = require('../middleware/auth');
const { trackAudit } = require('../middleware/auditMiddleware');

// Multer Storage for Logo
const upload = multer({ storage: multer.memoryStorage() });

router.get('/branding', getBranding);
router.get('/', auth(), getSettings);
router.put('/', auth(['manage_settings']), upload.fields([{ name: 'logo', maxCount: 1 }, { name: 'qr_code', maxCount: 1 }]), trackAudit('UPDATE', 'Settings'), updateSettings);
router.post('/test-email', auth(['manage_settings']), sendTestEmail);


module.exports = router;
