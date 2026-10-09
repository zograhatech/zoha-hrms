const mongoose = require('mongoose');

const lmsEnrollmentSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCourse', required: true },
    progress: { type: Number, default: 0 }, // 0 to 100
    completedLessons: [{
        moduleIndex: { type: Number },
        lessonIndex: { type: Number }
    }],
    status: { type: String, enum: ['Enrolled', 'In Progress', 'Completed'], default: 'Enrolled' },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    lastAccessedAt: { type: Date, default: Date.now },
    lastLessonPos: { // Bookmark lesson
        moduleIndex: { type: Number },
        lessonIndex: { type: Number }
    }
}, { timestamps: true });

// Ensure an employee can enroll in a course only once
lmsEnrollmentSchema.index({ employee: 1, course: 1 }, { unique: true });

module.exports = mongoose.models.LMSEnrollment || mongoose.model('LMSEnrollment', lmsEnrollmentSchema);
