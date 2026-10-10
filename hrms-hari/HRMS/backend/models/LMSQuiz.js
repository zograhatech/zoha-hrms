const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    text: { type: String, required: true },
    options: [{ type: String }],
    correctOption: { type: Number, required: true }, // Index 0-3
    points: { type: Number, default: 1 }
});

const lmsQuizSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCourse', required: true },
    moduleId: { type: Number, required: true }, // moduleIndex
    lessonId: { type: Number, required: true }, // lessonIndex
    title: { type: String, default: 'Quiz' },
    questions: [questionSchema],
    passingScore: { type: Number, default: 70 }, // %
    timerSeconds: { type: Number, default: 0 }, // 0 for no timer
    maxAttempts: { type: Number, default: 3 }
}, { timestamps: true });

module.exports = mongoose.models.LMSQuiz || mongoose.model('LMSQuiz', lmsQuizSchema);
