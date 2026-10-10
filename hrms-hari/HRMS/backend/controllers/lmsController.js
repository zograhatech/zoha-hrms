const LMSCourse = require('../models/LMSCourse');
const LMSCategory = require('../models/LMSCategory');
const LMSEnrollment = require('../models/LMSEnrollment');
const LMSQuiz = require('../models/LMSQuiz');
const LMSSubmission = require('../models/LMSSubmission');
const LMSCertificate = require('../models/LMSCertificate');
const Employee = require('../models/Employee');
const { uploadFromBuffer } = require('../utils/cloudinary');

// --- Category Logic ---
exports.getCategories = async (req, res) => {
    try {
        const categories = await LMSCategory.find().sort({ name: 1 });
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const category = await LMSCategory.create(req.body);
        res.status(201).json({ success: true, data: category });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// --- Course Logic (Admin) ---
exports.getAllCoursesAdmin = async (req, res) => {
    try {
        const courses = await LMSCourse.find()
            .populate('category')
            .populate('instructor', 'name profile_image')
            .sort({ createdAt: -1 });
        res.json({ success: true, data: courses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createCourse = async (req, res) => {
    try {
        const courseCount = await LMSCourse.countDocuments();
        const courseId = `LMS-${101 + courseCount}`;
        const courseData = { ...req.body, id: courseId };
        
        const course = await LMSCourse.create(courseData);
        res.status(201).json({ success: true, data: course });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.updateCourse = async (req, res) => {
    try {
        const course = await LMSCourse.findByIdAndUpdate(req.params.id, req.body, { new: true });
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
        res.json({ success: true, data: course });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.deleteCourse = async (req, res) => {
    try {
        const course = await LMSCourse.findByIdAndDelete(req.params.id);
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
        // Clean up enrollments
        await LMSEnrollment.deleteMany({ course: req.params.id });
        res.json({ success: true, message: 'Course deleted successfully' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// --- Employee Logic ---
exports.getPublishedCourses = async (req, res) => {
    try {
        const courses = await LMSCourse.find({ published: true })
            .populate('category')
            .populate('instructor', 'name');
        res.json({ success: true, data: courses });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.getCourseDetails = async (req, res) => {
    try {
        const course = await LMSCourse.findById(req.params.id)
            .populate('category')
            .populate('instructor', 'name profile_image designation');
        
        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        // Check if employee is enrolled
        const enrollment = await LMSEnrollment.findOne({ 
            employee: req.user._id, 
            course: req.params.id 
        });

        res.json({ success: true, data: course, enrollment });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.enrollInCourse = async (req, res) => {
    try {
        let enrollment = await LMSEnrollment.findOne({ 
            employee: req.user._id, 
            course: req.params.courseId 
        });

        if (enrollment) return res.status(400).json({ success: false, message: 'Already enrolled' });

        enrollment = await LMSEnrollment.create({
            employee: req.user._id,
            course: req.params.courseId
        });

        // Increment course enrollments
        await LMSCourse.findByIdAndUpdate(req.params.courseId, { $inc: { totalEnrollments: 1 } });

        res.status(201).json({ success: true, data: enrollment });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.updateProgress = async (req, res) => {
    try {
        const { moduleIndex, lessonIndex } = req.body;
        const enrollment = await LMSEnrollment.findOne({ 
            employee: req.user._id, 
            course: req.params.courseId 
        });

        if (!enrollment) return res.status(404).json({ success: false, message: 'Enrollment not found' });

        // Update completed lessons
        const alreadyCompleted = enrollment.completedLessons.some(l => 
            l.moduleIndex === moduleIndex && l.lessonIndex === lessonIndex
        );

        if (!alreadyCompleted) {
            enrollment.completedLessons.push({ moduleIndex, lessonIndex });
            
            // Recalculate progress %
            const course = await LMSCourse.findById(req.params.courseId);
            const totalLessons = course.modules.reduce((acc, m) => acc + m.lessons.length, 0);
            enrollment.progress = Math.round((enrollment.completedLessons.length / totalLessons) * 100);
            
            if (enrollment.progress >= 100) {
                enrollment.status = 'Completed';
                enrollment.completedAt = new Date();
            } else {
                enrollment.status = 'In Progress';
            }
        }

        enrollment.lastAccessedAt = new Date();
        enrollment.lastLessonPos = { moduleIndex, lessonIndex };
        await enrollment.save();

        res.json({ success: true, data: enrollment });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.getMyLearning = async (req, res) => {
    try {
        const enrollments = await LMSEnrollment.find({ employee: req.user._id })
            .populate({
                path: 'course',
                populate: { path: 'category' }
            })
            .sort({ lastAccessedAt: -1 });
        res.json({ success: true, data: enrollments });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.uploadVideo = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No video file provided.' });
        }

        const result = await uploadFromBuffer(
            req.file.buffer,
            'lms_videos',
            'video',
            req.file.originalname
        );

        res.json({
            success: true,
            data: {
                url: result.secure_url,
                public_id: result.public_id,
                duration: result.duration
            }
        });
    } catch (err) {
        console.error('LMS Video upload error:', err);
        res.status(500).json({ success: false, message: 'Failed to upload video.' });
    }
};
