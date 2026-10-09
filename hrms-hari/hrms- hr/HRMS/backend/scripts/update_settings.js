const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Setting = require('../models/Setting');

async function updateSettings() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        const setting = await Setting.findOne();
        if (setting) {
            setting.company_logo = '/company_logo.png';
            if (setting.email_settings) {
                setting.email_settings.mail_from_name = 'Hari Hrms';
            }
            setting.markModified('email_settings');
            await setting.save();
            console.log('Successfully updated database company_logo and mail_from_name.');
        } else {
            console.log('No settings record found to update.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
}

updateSettings();
