const mongoose = require('mongoose');

const accessSettingsSchema = new mongoose.Schema({
    enforce_ip_access: {
        type: Boolean,
        default: false
    },
    ranges: [{
        cidr: {
            type: String,
            required: true,
            trim: true
        },
        label: {
            type: String,
            default: '',
            trim: true
        },
        enabled: {
            type: Boolean,
            default: true
        }
    }]
}, {
    timestamps: true
});

module.exports = mongoose.model('AccessSettings', accessSettingsSchema);

