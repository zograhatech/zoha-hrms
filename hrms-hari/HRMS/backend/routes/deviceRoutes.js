const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    issueDeviceToken,
    revokeDeviceToken,
    listDeviceTokens
} = require('../controllers/deviceTokenController');

// All device token management endpoints are admin-only
router.post('/tokens', auth(['admin']), issueDeviceToken);
router.delete('/tokens/:id', auth(['admin']), revokeDeviceToken);
router.get('/tokens', auth(['admin']), listDeviceTokens);

module.exports = router;

