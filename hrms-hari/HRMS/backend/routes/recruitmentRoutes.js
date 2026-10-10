const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { getJobs, createJob, updateJob, deleteJob, addCandidate, updateCandidateStatus, getJobPublic, applyPublic, downloadResume } = require('../controllers/recruitmentController');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Public Open Routes (No JWT needed)
router.get('/public/:id', getJobPublic);
router.post('/public/:id/apply', upload.single('resume'), applyPublic);

// Protected Auth Routes
router.get('/', auth(), getJobs);
router.post('/', auth(['hr_manager', 'admin', 'manage_employees']), createJob);
router.put('/:id', auth(['hr_manager', 'admin', 'manage_employees']), updateJob);
router.delete('/:id', auth(['hr_manager', 'admin', 'manage_employees']), deleteJob);
router.post('/:jobId/candidates', auth(['hr_manager', 'admin', 'manage_employees']), upload.single('resume'), addCandidate);
router.put('/:jobId/candidates/:candidateId', auth(['hr_manager', 'admin', 'manage_employees']), updateCandidateStatus);
router.get('/download/:jobId/:candidateId', auth(['hr_manager', 'admin', 'manage_employees']), downloadResume);

module.exports = router;
