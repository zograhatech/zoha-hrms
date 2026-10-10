const mongoose = require('mongoose');

const lmsCertificateSchema = new mongoose.Schema({
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    course: { type: mongoose.Schema.Types.ObjectId, ref: 'LMSCourse', required: true },
    issueDate: { type: Date, default: Date.now },
    certificateId: { type: String, required: true, unique: true }, // Format CERT-COURSE_ID-EMPLOYEE_ID
    certificateUrl: { type: String }, // S3/Cloudinary URL
    pointsEarned: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.models.LMSCertificate || mongoose.model('LMSCertificate', lmsCertificateSchema);
