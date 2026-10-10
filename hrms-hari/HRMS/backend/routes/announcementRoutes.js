const express = require('express');
const router = express.Router();
const { createAnnouncement, getActiveAnnouncements, deleteAnnouncement } = require('../controllers/announcementController');
const auth = require('../middleware/auth');

router.get('/', auth(), getActiveAnnouncements);
router.post('/', auth(['hr_manager', 'hr', 'manage_announcements']), createAnnouncement);
router.delete('/:id', auth(['hr_manager', 'hr', 'manage_announcements']), deleteAnnouncement);

module.exports = router;
