const express = require('express');
const router = express.Router();
const taxController = require('../controllers/taxController');
const auth = require('../middleware/auth');

router.get('/summary', auth(['manage_tally', 'tally_tax']), taxController.getGSTSummary);

module.exports = router;
