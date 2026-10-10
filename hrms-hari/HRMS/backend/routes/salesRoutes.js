const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');
const auth = require('../middleware/auth');

router.get('/customers', auth(['manage_tally', 'tally_sales']), salesController.getCustomers);
router.post('/customers', auth(['manage_tally', 'tally_sales']), salesController.createCustomer);
router.get('/invoices', auth(['manage_tally', 'tally_sales']), salesController.getInvoices);
router.post('/invoices', auth(['manage_tally', 'tally_sales']), salesController.createInvoice);
router.get('/summary', auth(['manage_tally', 'tally_sales']), salesController.getSalesSummary);
router.put('/invoices/:id/pay', auth(['manage_tally']), salesController.markAsPaid);

module.exports = router;
