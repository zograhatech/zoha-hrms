const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const auth = require('../middleware/auth');

router.get('/items', auth(['manage_tally', 'tally_inventory']), inventoryController.getItems);
router.post('/items', auth(['manage_tally', 'tally_inventory']), inventoryController.createItem);
router.get('/transactions', auth(['manage_tally', 'tally_inventory']), inventoryController.getStockTransactions);
router.post('/transactions', auth(['manage_tally', 'tally_inventory']), inventoryController.createStockTransaction);
router.get('/summary', auth(['manage_tally', 'tally_inventory']), inventoryController.getInventorySummary);

module.exports = router;
