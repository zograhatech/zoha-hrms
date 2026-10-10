const express = require('express');
const router = express.Router();
const { login, logout, getMe, refreshToken, forgotPassword, resetPassword } = require('../controllers/authController');
const auth = require('../middleware/auth');

const { trackAudit } = require('../middleware/auditMiddleware');

router.post('/login', trackAudit('LOGIN', 'Auth'), login);
router.post('/logout', auth(), trackAudit('LOGOUT', 'Auth'), logout);
router.post('/refresh', refreshToken);
router.get('/me', auth(), getMe);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;
