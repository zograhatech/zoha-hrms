const express = require('express');
const router = express.Router();
const reportsController = require('../controllers/reportsController');
const auth = require('../middleware/auth');

router.get('/financial-overview', auth(['view_analytics']), reportsController.getFinancialOverview);

module.exports = router;
