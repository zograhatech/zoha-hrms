const Resignation = require('../models/Resignation');
const Notification = require('../models/Notification');
const Employee = require('../models/Employee');
const { sendEmail } = require('../utils/emailService');

const generateExitEmailTemplate = (employee, resignation, hr_comments) => {
    return `
        <div style="background: #f8fafc; padding: 25px; border-radius: 12px; border: 1px solid #e2e8f0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
            <h3 style="color: #4f46e5; margin-top: 0; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Relieving Confirmation</h3>
            <p>Hi <strong>${employee.name}</strong>,</p>
            <p>This email is to confirm that your resignation has been officially processed. Your last day of service is scheduled for <strong>${new Date(resignation.last_working_day).toLocaleDateString()}</strong>.</p>
            
            <div style="background: #ffffff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
                <p style="margin: 0 0 15px 0; font-weight: 700; color: #1e293b; font-size: 1rem;">Final Access Credentials:</p>
                <p style="margin: 5px 0; font-size: 0.9rem;"><strong>Employee ID (for Login):</strong> <span style="font-family: monospace; background: #f1f5f9; padding: 2px 6px; border-radius: 4px;">${employee.id}</span></p>
                <p style="margin: 5px 0; font-size: 0.9rem;"><strong>Email:</strong> <span style="font-family: monospace;">${employee.email}</span></p>
                <p style="margin: 5px 0; font-size: 0.9rem;"><strong>Password:</strong> <span style="color: #64748b; font-style: italic;">(Use your current HRMS password)</span></p>
            </div>

            ${hr_comments ? `<p><strong>HR Feedback:</strong> ${hr_comments}</p>` : ''}
            
            <p style="color: #64748b; font-size: 0.9rem;">Note: You can use your Employee ID or Email to sign in to the HRMS portal.</p>
            <p>Please complete all handovers and return any company assets by your final working day. You can download your official documents from your Inactive Dashboard profile.</p>
            <p>We wish you much success in your next chapter!</p>
            <p>Regards,<br><strong>The HR Team</strong></p>
        </div>
    `;
};

// @desc    Submit resignation request
exports.submitResignation = async (req, res) => {
    try {
        const { notice_start_date, last_working_day, reason } = req.body;
        const existing = await Resignation.findOne({ employee: req.user._id, status: { $in: ['pending', 'approved'] } });
        if (existing && existing.status === 'approved') return res.status(400).json({ success: false, message: 'Existing approved resignation found.' });
        if (existing && existing.status === 'pending') return res.status(400).json({ success: false, message: 'Already have a pending request.' });

        const resignation = await Resignation.create({ employee: req.user._id, notice_start_date, last_working_day, reason });
        const hrManagers = await Employee.find({ role: 'hr_manager' });
        for (const hr of hrManagers) {
            await Notification.create({ recipient: hr._id, sender: req.user._id, type: 'resignation', title: 'New Resignation Request', message: `${req.user.name} has submitted a resignation request.`, data: { link: '/dashboard/exit-management', status: 'pending' } });
        }
        res.status(201).json({ success: true, resignation });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getMyResignation = async (req, res) => {
    try {
        const resignation = await Resignation.findOne({ employee: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, resignation });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.getAllResignations = async (req, res) => {
    try {
        const resignations = await Resignation.find()
            .populate('employee', 'name id department_id designation email')
            .sort({ createdAt: -1 })
            .lean();
        
        // Exclude big data from list view but keep document metadata
        const processedResignations = resignations.map(r => ({
            ...r,
            documents: (r.documents || []).map(d => ({ _id: d._id, name: d.name, uploadedAt: d.uploadedAt }))
        }));

        res.json({ success: true, resignations: processedResignations });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

// @desc    Update resignation status (with optional multi-document attachment)
exports.updateResignationStatus = async (req, res) => {
    try {
        const { status, hr_comments } = req.body;
        const resignation = await Resignation.findById(req.params.id).populate('employee');
        if (!resignation) return res.status(404).json({ success: false, message: 'Not found.' });

        if (status) resignation.status = status;
        if (hr_comments) resignation.hr_comments = hr_comments;
        
        // Handle Multiple Document Attachments (Append to existing)
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                resignation.documents.push({
                    name: file.originalname,
                    data: file.buffer,
                    contentType: file.mimetype
                });
            });
        }

        resignation.history.push({ status: status || resignation.status, comment: hr_comments || '', updated_by: req.user._id });
        await resignation.save();

        if (status === 'approved') {
            const lastDay = new Date(resignation.last_working_day);
            if (new Date() >= lastDay) await Employee.findByIdAndUpdate(resignation.employee._id, { status: 'inactive' });
        } else if (status === 'revoke') {
            await Employee.findByIdAndUpdate(resignation.employee._id, { status: 'active' });
        }

        if (resignation.employee) {
            await Notification.create({
                recipient: resignation.employee._id, sender: req.user._id, type: 'resignation',
                title: status === 'revoke' ? 'Resignation Revoke Approved' : `Resignation Request ${status}`,
                message: `Your resignation request has been ${status}.`,
                data: { link: '/dashboard/profile', status: status || resignation.status }
            });

            if (status === 'approved' || status === 'rejected') {
                const subject = status === 'approved' ? `Relieving Confirmation - ${resignation.employee.name}` : 'Resignation Rejected';
                const html = status === 'approved' ? generateExitEmailTemplate(resignation.employee, resignation, hr_comments) : `<p>Rejected: ${hr_comments}</p>`;
                
                if (resignation.employee.email) {
                    await sendEmail({ to: resignation.employee.email, subject, html }).catch(err => {
                        console.error('Failed to send exit email:', err);
                    });
                }
            }
        }

        res.json({ success: true, resignation: { ...resignation._doc, documents: resignation.documents.map(d => ({ _id: d._id, name: d.name })) } });
    } catch (error) { 
        console.error('Update Resignation Status Error:', error);
        res.status(500).json({ success: false, message: error.message }); 
    }
};

exports.getDocument = async (req, res) => {
    try {
        const resignation = await Resignation.findById(req.params.id);
        if (!resignation) return res.status(404).send('Not found');
        
        const doc = resignation.documents.id(req.params.docId);
        if (!doc) return res.status(404).send('Document not found');
        
        // Safety: Only serve if approved
        if (resignation.status !== 'approved') return res.status(403).send('Not approved');

        res.set('Content-Type', doc.contentType);
        res.set('Content-Disposition', `inline; filename="${doc.name}"`);
        res.send(doc.data);
    } catch (error) { res.status(500).send('Error serving file'); }
};

exports.deleteDocument = async (req, res) => {
    try {
        const resignation = await Resignation.findById(req.params.id);
        if (!resignation) return res.status(404).json({ success: false, message: 'Not found' });
        
        const doc = resignation.documents.id(req.params.docId);
        if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
        
        // Use Mongoose's subdocument removal
        resignation.documents.pull(req.params.docId);
        await resignation.save();
        
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};

exports.resubmitResignation = async (req, res) => {
    const { notice_start_date, last_working_day, reason } = req.body;
    const resignation = await Resignation.findById(req.params.id);
    resignation.notice_start_date = notice_start_date;
    resignation.last_working_day = last_working_day;
    resignation.reason = reason;
    resignation.status = 'pending';
    await resignation.save();
    res.json({ success: true });
};

exports.revokeResignation = async (req, res) => {
    const { reason } = req.body;
    const resignation = await Resignation.findById(req.params.id);
    resignation.status = 'revoke_requested';
    resignation.revoke_reason = reason;
    await resignation.save();
    res.json({ success: true });
};

exports.sendExitConfirmation = async (req, res) => {
    try {
        const resignation = await Resignation.findById(req.params.id).populate('employee');
        if (!resignation || !resignation.employee) return res.status(404).json({ success: false, message: 'Not found' });
        
        const subject = `Relieving Confirmation - ${resignation.employee.name}`;
        const html = generateExitEmailTemplate(resignation.employee, resignation, resignation.hr_comments);
        await sendEmail({ to: resignation.employee.email, subject, html });
        res.json({ success: true, message: 'Confirmation email resent.' });
    } catch (error) { res.status(500).json({ success: false, message: error.message }); }
};
