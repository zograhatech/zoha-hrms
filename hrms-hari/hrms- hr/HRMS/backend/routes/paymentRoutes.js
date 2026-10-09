const express = require('express');
const router = express.Router();
const { 
    submitPayment, 
    getMyPayments, 
    getAllPayments, 
    updatePaymentStatus 
} = require('../controllers/paymentController');
const auth = require('../middleware/auth');

router.use(auth()); // All payment routes protected

router.post('/', submitPayment);
router.get('/my', getMyPayments);
router.get('/all', auth(['manage_settings']), getAllPayments);
router.put('/:id', auth(['manage_settings']), updatePaymentStatus);

module.exports = router;
