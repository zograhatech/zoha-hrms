const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    type: { type: String, enum: ['video', 'reading', 'quiz'], default: 'reading' },
    content: { type: String }, // Markdown content for reading
    videoUrl: { type: String }, // S3/Cloudinary URL
    docUrl: { type: String }, // PDF/Resource URL
    quizId: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSQuiz' },
    quizLink: { type: String }, // External Quiz Link
    questions: [{
        text: { type: String, required: true },
        options: [{ type: String }],
        correctOption: { type: Number, required: true },
        points: { type: Number, default: 1 }
    }],
    estimatedMinutes: { type: Number, default: 0 },
    resources: [{
        name: { type: String },
        url: { type: String }
    }]
});

const moduleSchema = new mongoose.Schema({
    title: { type: String, required: true, trim: true },
    lessons: [lessonSchema]
});

const lmsCourseSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true, trim: true, uppercase: true }, // Short ID like LMS-101
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCategory' },
    thumbnail: { type: String },
    level: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
    instructor: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    published: { type: Boolean, default: false },
    modules: [moduleSchema],
    totalLessons: { type: Number, default: 0 },
    totalEnrollments: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.LMSCourse || mongoose.model('LMSCourse', lmsCourseSchema);
