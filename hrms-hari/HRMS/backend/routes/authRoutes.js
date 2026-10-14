const express = require('express');
const router = express.Router();
const { 
    login, 
    logout, 
    getMe, 
    refreshToken, 
    forgotPassword, 
    resetPassword,
    verifyEmail,
    resendVerification,
    verify2fa,
    resend2fa
} = require('../controllers/authController');
const auth = require('../middleware/auth');

const { trackAudit } = require('../middleware/auditMiddleware');

router.post('/login', trackAudit('LOGIN', 'Auth'), login);
router.post('/logout', auth(), trackAudit('LOGOUT', 'Auth'), logout);
router.post('/refresh', refreshToken);
router.get('/me', auth(), getMe);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// Email verification routes
router.post('/verify-email', verifyEmail);
router.post('/resend-verification', resendVerification);

// 2FA routes
router.post('/2fa/verify', verify2fa);
router.post('/2fa/resend', resend2fa);

module.exports = router;
