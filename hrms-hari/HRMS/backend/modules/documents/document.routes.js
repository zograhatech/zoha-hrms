const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const multer = require('multer');
const {
    uploadDocuments, getEmployeeDocuments, viewDocument, deleteDocument
} = require('./document.controller');

const upload = multer({ storage: multer.memoryStorage() });

// Upload - can be done by the user themselves (handled in controller) or HR
router.post('/upload', auth(), upload.array('files', 10), uploadDocuments);
// List - HR needs 'manage_documents' to see others, user can see own (handled in controller logic usually)
router.get('/employee/:employee_id', auth(), getEmployeeDocuments);
// View - Handled in controller (Owner or HR)
router.get('/view/:id', auth(), viewDocument);
// Delete - Handled in controller (Owner or HR)
router.delete('/:id', auth(), deleteDocument);

// If the user wants a strict ADMIN route for all documents
router.get('/all', auth(['manage_documents']), async (req, res) => {
    // Optional: get all docs in the system
    const Document = require('./document.model');
    const docs = await Document.find().select('-data').sort({ createdAt: -1 });
    res.json({ success: true, documents: docs });
});

module.exports = router;
