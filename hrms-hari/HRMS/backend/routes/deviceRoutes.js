const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const {
    issueDeviceToken,
    revokeDeviceToken,
    listDeviceTokens,
    sendSetupCode,
    enrollDevice
} = require('../controllers/deviceTokenController');

// Rate limiter for enrollment: 10 attempts per IP per 15 minutes
const enrollLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: {
        success: false,
        message: 'Too many enrollment attempts. Please try again after 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// All device token management endpoints are admin-only
router.post('/tokens', auth(['admin']), issueDeviceToken);
router.delete('/tokens/:id', auth(['admin']), revokeDeviceToken);
router.get('/tokens', auth(['admin']), listDeviceTokens);
router.post('/enrollment-codes', auth(['admin']), sendSetupCode);

// Public enrollment endpoint (rate limited)
router.post('/enroll', enrollLimiter, enrollDevice);

module.exports = router;

