const Recruitment = require('../models/Recruitment');
const Onboarding = require('../models/Onboarding');
const Notification = require('../models/Notification');
const Employee = require('../models/Employee');
const { uploadFromBuffer } = require('../utils/cloudinary');

exports.getJobs = async (req, res) => {
    try {
        const jobs = await Recruitment.find().sort({ createdAt: -1 });
        res.json({ success: true, jobs });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.createJob = async (req, res) => {
    try {
        const job = await Recruitment.create(req.body);
        res.status(201).json({ success: true, message: 'Job posting created', job });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateJob = async (req, res) => {
    try {
        const job = await Recruitment.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json({ success: true, message: 'Job updated', job });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.deleteJob = async (req, res) => {
    try {
        await Recruitment.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Job posting deleted' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.addCandidate = async (req, res) => {
    try {
        const job = await Recruitment.findById(req.params.jobId);
        if(!job) return res.status(404).json({ success: false, message: 'Wait, Job not found' });
        
        let candidateData = { ...req.body };
        if (req.file) {
            console.log('Manual resume upload:', { 
                name: req.file.originalname, 
                size: req.file.size, 
                mimetype: req.file.mimetype 
            });
            const result = await uploadFromBuffer(req.file.buffer, 'resumes', 'auto', req.file.originalname);
            candidateData.resume_url = result.secure_url;
            console.log('Upload result:', result.secure_url);
        }

        job.candidates.push(candidateData);
        await job.save();
        res.status(201).json({ success: true, message: 'Candidate added', job });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateCandidateStatus = async (req, res) => {
    try {
        const job = await Recruitment.findById(req.params.jobId);
        const candidate = job.candidates.id(req.params.candidateId);
        candidate.status = req.body.status;
        await job.save();

        if (req.body.status === 'Hired') {
            const existing = await Onboarding.findOne({ email: candidate.email });
            if (!existing) {
                await Onboarding.create({
                    name: candidate.name,
                    email: candidate.email,
                    phone: candidate.phone,
                    applied_role: job.job_title,
                    department_id: job.department_id,
                    qualification: candidate.qualification || '',
                    experience_type: candidate.experience_type || 'fresher',
                    experience_years: candidate.experience_years || '',
                    address: candidate.address || '',
                    status: 'Offer Accepted',
                    start_date: new Date(),
                    notes: `Auto-transferred from Recruitment pipeline on ${new Date().toLocaleDateString()}`
                });
            }
        }

        res.json({ success: true, message: 'Candidate status updated', job });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getJobPublic = async (req, res) => {
    try {
        const job = await Recruitment.findById(req.params.id, 'job_title department_id description requirements positions status');
        if(!job || job.status !== 'Open') return res.status(404).json({ success: false, message: 'Job not found or closed' });
        res.json({ success: true, job });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.applyPublic = async (req, res) => {
    try {
        const job = await Recruitment.findById(req.params.id);
        if(!job || job.status !== 'Open') return res.status(404).json({ success: false, message: 'Job is no longer open for applications' });
        
        let candidateData = { ...req.body, status: 'Applied' };
        
        // Ensure resumè field from body (if any) doesn't overwrite real data
        delete candidateData.resume; 

        if (req.file) {
            console.log('Public resume upload:', { 
                name: req.file.originalname, 
                size: req.file.size, 
                mimetype: req.file.mimetype 
            });
            const result = await uploadFromBuffer(req.file.buffer, 'resumes', 'auto', req.file.originalname);
            candidateData.resume_url = result.secure_url;
            console.log('Upload result:', result.secure_url);
        }

        job.candidates.push(candidateData);
        await job.save();

        // Notify Admins and HR Managers about new application
        const hrAndAdmins = await Employee.find({ role: { $in: ['hr_manager'] } });
        for (const recipient of hrAndAdmins) {
            await Notification.create({
                recipient: recipient._id,
                type: 'general',
                title: 'New Job Application',
                message: `${req.body.name} just applied for ${job.job_title}.`,
                data: { link: '/dashboard/recruitment' }
            });
        }

        res.status(201).json({ success: true, message: 'Application submitted successfully!' });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
exports.downloadResume = async (req, res) => {
    try {
        const job = await Recruitment.findById(req.params.jobId);
        const candidate = job.candidates.id(req.params.candidateId);
        if (!candidate || !candidate.resume_url) return res.status(404).send('Resume not found');

        const axios = require('axios');
        const response = await axios({
            method: 'get',
            url: candidate.resume_url,
            responseType: 'stream'
        });

        const extension = candidate.resume_url.split('.').pop();
        res.setHeader('Content-Disposition', `attachment; filename="Resume_${candidate.name.replace(/\s+/g, '_')}.${extension}"`);
        response.data.pipe(res);
    } catch (err) { res.status(500).send(err.message); }
};
