const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit for videos
});
const {
    getCategories, createCategory,
    getAllCoursesAdmin, createCourse, updateCourse, deleteCourse,
    getPublishedCourses, getCourseDetails, enrollInCourse, updateProgress, getMyLearning,
    uploadVideo
} = require('../controllers/lmsController');

// --- Admin ---
router.get('/admin/courses', auth(['hr_manager', 'admin', 'manage_lms', 'lms']), getAllCoursesAdmin);
router.post('/admin/courses', auth(['hr_manager', 'admin', 'manage_lms', 'lms']), createCourse);
router.put('/admin/courses/:id', auth(['hr_manager', 'admin', 'manage_lms', 'lms']), updateCourse);
router.delete('/admin/courses/:id', auth(['hr_manager', 'admin', 'manage_lms', 'lms']), deleteCourse);
router.post('/admin/upload-video', auth(['hr_manager', 'admin', 'manage_lms', 'lms']), upload.single('video'), uploadVideo);

router.get('/categories', auth(), getCategories);
router.post('/categories', auth(['hr_manager', 'admin', 'manage_lms']), createCategory);

// --- Employee ---
router.get('/courses', auth(), getPublishedCourses);
router.get('/my-learning', auth(), getMyLearning);
router.get('/course/:id', auth(), getCourseDetails);
router.post('/enroll/:courseId', auth(), enrollInCourse);
router.put('/progress/:courseId', auth(), updateProgress);

module.exports = router;
