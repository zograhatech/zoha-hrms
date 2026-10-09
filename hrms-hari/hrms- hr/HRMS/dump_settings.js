const mongoose = require('mongoose');
const Setting = require('./backend/models/Setting');
require('dotenv').config({ path: './backend/.env' });

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        const s = await Setting.findOne().lean();
        console.log('RAW SETTINGS:', JSON.stringify(s, null, 2));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
check();
