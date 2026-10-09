const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { 
    submitResignation, 
    getMyResignation, 
    getAllResignations, 
    updateResignationStatus,
    getDocument,
    deleteDocument,
    resubmitResignation,
    revokeResignation,
    sendExitConfirmation
} = require('../controllers/resignationController');

const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

router.post('/', auth(), submitResignation);
router.get('/my', auth(), getMyResignation);
router.get('/', auth(['hr_manager', 'hr', 'manage_resignations', 'exit']), getAllResignations);
router.put('/:id/status', auth(['hr_manager', 'hr', 'manage_resignations', 'exit', 'exit_approve']), upload.array('documents', 5), updateResignationStatus);
router.get('/:id/documents/:docId', getDocument); // Public for verification
router.delete('/:id/documents/:docId', auth(['hr_manager', 'hr', 'exit_approve']), deleteDocument);
router.post('/:id/send-confirmation', auth(['hr_manager', 'hr', 'exit_approve']), sendExitConfirmation);
router.put('/:id/resubmit', auth(), resubmitResignation);
router.put('/:id/revoke', auth(), revokeResignation);

module.exports = router;
