const mongoose = require('mongoose');

const lmsSubmissionSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCourse', required: true },
    quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSQuiz', required: true },
    answers: [{ 
        questionIndex: Number,
        selectedOption: Number
    }],
    score: { type: Number, required: true }, // %
    isPassed: { type: Boolean, required: true },
    attemptsLeft: { type: Number },
    submittedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.LMSSubmission || mongoose.model('LMSSubmission', lmsSubmissionSchema);
