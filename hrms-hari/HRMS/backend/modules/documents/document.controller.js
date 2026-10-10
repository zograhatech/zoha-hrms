const Document = require('./document.model');
const Employee = require('../../models/Employee');

// @desc    Upload new documents
// @route   POST /api/documents/upload
exports.uploadDocuments = async (req, res) => {
    try {
        const { employee_id, type, category } = req.body;
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'No files uploaded.' });
        }

        const uploadedDocs = [];
        for (const file of req.files) {
            const doc = await Document.create({
                employee_id,
                name: file.originalname,
                type: type || 'document',
                category: category || 'General',
                data: file.buffer,
                contentType: file.mimetype,
                size: file.size,
                uploaded_by: req.user._id,
            });
            uploadedDocs.push({ _id: doc._id, name: doc.name, type: doc.type, uploadedAt: doc.createdAt });
        }

        res.status(201).json({ success: true, message: 'Documents uploaded successfully.', documents: uploadedDocs });
    } catch (error) {
        console.error('[uploadDocuments]', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get employee documents
// @route   GET /api/documents/employee/:employee_id
exports.getEmployeeDocuments = async (req, res) => {
    try {
        const { employee_id } = req.params;
        
        // Security: Only owner or if they can manage_documents
        const isOwner = req.user.id === employee_id;
        const isHR = ['hr', 'hr_manager', 'admin'].includes(req.user.role);
        
        // RE-IMPORT auth context logic if needed, but for now we basically just check for role/id
        // We'll trust that the auth() middleware at the route level handles the "global" access check when specified
        
        if (!isOwner && !isHR) {
            // Need to check if they have manage_documents permission
            const Employee = require('../../models/Employee');
            const emp = await Employee.findOne({ id: req.user.id }).select('permissions role');
            const hasManageDoc = emp?.permissions?.includes('manage_documents');
            if (!hasManageDoc) {
                return res.status(403).json({ success: false, message: 'Unauthorized access to this employee documents' });
            }
        }

        const documents = await Document.find({ employee_id }).select('-data').sort({ createdAt: -1 });
        res.json({ success: true, documents });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Download/View document
// @route   GET /api/documents/view/:id
exports.viewDocument = async (req, res) => {
    try {
        const doc = await Document.findById(req.params.id);
        if (!doc) return res.status(404).send('Document not found');

        // Security check: Only the owner or HR/Managers can view
        const isOwner = req.user.id === doc.employee_id;
        const isHR = ['hr', 'hr_manager', 'admin'].includes(req.user.role);
        
        if (!isOwner && !isHR) {
            return res.status(403).send('Unauthorized access to document');
        }

        res.set('Content-Type', doc.contentType);
        res.set('Content-Disposition', `inline; filename="${doc.name}"`);
        res.send(doc.data);
    } catch (error) {
        res.status(500).send('Error serving file');
    }
};

// @desc    Delete document
// @route   DELETE /api/documents/:id
exports.deleteDocument = async (req, res) => {
    try {
        const doc = await Document.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        res.json({ success: true, message: 'Document deleted successfully.' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
