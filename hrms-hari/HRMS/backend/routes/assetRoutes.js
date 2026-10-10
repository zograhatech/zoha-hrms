const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getAssets, createAsset, updateAsset, deleteAsset } = require('../controllers/assetController');

router.get('/', auth(), getAssets);
router.post('/', auth(['hr_manager', 'admin', 'manage_settings']), createAsset);
router.put('/:id', auth(['hr_manager', 'admin', 'manage_settings']), updateAsset);
router.delete('/:id', auth(['hr_manager', 'admin', 'manage_settings']), deleteAsset);

module.exports = router;
