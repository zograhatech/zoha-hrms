const mongoose = require('mongoose');
const Setting = require('./backend/models/Setting');
const LeaveBalance = require('./backend/models/LeaveBalance');
require('dotenv').config({ path: './backend/.env' });

async function check() {
    try {
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('Connected to DB');

        const settings = await Setting.findOne();
        console.log('Global Policies:', JSON.stringify(settings.leave_policies, null, 2));

        const balances = await LeaveBalance.find({ year: new Date().getFullYear() }).limit(5);
        console.log('Sample Balances (current year):', JSON.stringify(balances, null, 2));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
