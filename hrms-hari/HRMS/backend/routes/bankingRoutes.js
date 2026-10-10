const express = require('express');
const router = express.Router();
const bankingController = require('../controllers/bankingController');
const auth = require('../middleware/auth');

router.get('/accounts', auth(['manage_tally', 'tally_banking']), bankingController.getAccounts);
router.post('/accounts', auth(['manage_tally', 'tally_banking']), bankingController.createAccount);
router.get('/transactions', auth(['manage_tally', 'tally_banking']), bankingController.getTransactions);
router.post('/transactions', auth(['manage_tally', 'tally_banking']), bankingController.createTransaction);
router.get('/summary', auth(['manage_tally', 'tally_banking']), bankingController.getBankingSummary);

module.exports = router;
