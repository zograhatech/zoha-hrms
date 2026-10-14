const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getRemoteAccessList, grantRemoteAccess, revokeRemoteAccess } = require('../controllers/remoteAccessController');

// SuperAdmin only endpoints
router.get('/', auth(['admin']), getRemoteAccessList);
router.post('/', auth(['admin']), grantRemoteAccess);
router.delete('/:id', auth(['admin']), revokeRemoteAccess);
router.delete('/', auth(['admin']), revokeRemoteAccess);

module.exports = router;

