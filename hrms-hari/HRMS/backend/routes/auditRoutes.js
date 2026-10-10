const express = require('express');
const router = express.Router();
const { getRecentLogs } = require('../controllers/auditController');
const auth = require('../middleware/auth');

router.get('/recent', auth(['hr_manager', 'hr', 'view_audit_logs']), getRecentLogs);

module.exports = router;
