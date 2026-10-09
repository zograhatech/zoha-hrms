const mongoose = require('mongoose');

const FunSubmissionSchema = new mongoose.Schema({
    employeeId: {
        type: String,
        ref: 'Employee',
        required: true
    },
    employeeName: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['joke', 'idea', 'suggestion'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FunSubmission', FunSubmissionSchema);
