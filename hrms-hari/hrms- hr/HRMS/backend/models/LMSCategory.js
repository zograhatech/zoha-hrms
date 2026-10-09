const mongoose = require('mongoose');

const lmsCategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    icon: { type: String, default: 'FiBookOpen' } // Icon name from react-icons/fi
}, { timestamps: true });

module.exports = mongoose.models.LMSCategory || mongoose.model('LMSCategory', lmsCategorySchema);
