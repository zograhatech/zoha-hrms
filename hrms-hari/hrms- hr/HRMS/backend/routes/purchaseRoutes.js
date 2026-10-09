const express = require('express');
const router = express.Router();
const purchaseController = require('../controllers/purchaseController');
const auth = require('../middleware/auth');

router.get('/vendors', auth(['manage_tally', 'tally_purchases']), purchaseController.getVendors);
router.post('/vendors', auth(['manage_tally', 'tally_purchases']), purchaseController.createVendor);
router.get('/invoices', auth(['manage_tally', 'tally_purchases']), purchaseController.getPurchaseInvoices);
router.post('/invoices', auth(['manage_tally', 'tally_purchases']), purchaseController.createPurchaseInvoice);
router.get('/summary', auth(['manage_tally', 'tally_purchases']), purchaseController.getPurchaseSummary);
router.put('/invoices/:id/pay', auth(['manage_tally']), purchaseController.markAsPaid);

module.exports = router;
