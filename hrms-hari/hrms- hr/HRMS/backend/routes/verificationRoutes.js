const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
    requestVerification,
    getMyRequests,
    respondToRequest,
    getVerifiedData
} = require('../controllers/verificationController');

// Public route: New HR creates verification request
router.post('/request', requestVerification);

// Ex-employee routes: Auth required
router.get('/mine', auth(), getMyRequests);
router.put('/:id/respond', auth(), respondToRequest);

// Public route: Requestor HR check data if approved
router.get('/check/:id', getVerifiedData);

module.exports = router;
