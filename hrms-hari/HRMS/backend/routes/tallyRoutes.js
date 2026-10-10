const express = require('express');
const router = express.Router();
const tallyController = require('../controllers/tallyController');
const auth = require('../middleware/auth');

router.get('/ledgers', auth(['manage_tally', 'tally_accounting']), tallyController.getLedgers);
router.post('/ledgers', auth(['manage_tally', 'tally_accounting']), tallyController.createLedger);
router.put('/ledgers/:id', auth(['manage_tally', 'tally_accounting']), tallyController.updateLedger);
router.delete('/ledgers/:id', auth(['manage_tally', 'tally_accounting']), tallyController.deleteLedger);
router.get('/transactions', auth(['manage_tally', 'tally_accounting']), tallyController.getTransactions);
router.post('/transactions', auth(['manage_tally', 'tally_accounting']), tallyController.createTransaction);
router.get('/balance-sheet', auth(['manage_tally', 'tally_accounting']), tallyController.getBalanceSheet);

module.exports = router;
