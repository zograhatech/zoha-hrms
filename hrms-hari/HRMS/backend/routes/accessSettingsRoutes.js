const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAccessSettings, updateAccessSettings } = require('../controllers/accessSettingsController');

// SuperAdmin only endpoints
router.get('/', auth(['admin']), getAccessSettings);
router.put('/', auth(['admin']), updateAccessSettings);

module.exports = router;

