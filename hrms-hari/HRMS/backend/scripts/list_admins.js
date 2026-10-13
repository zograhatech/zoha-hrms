require('dotenv').config();
const path = require('path');
if (!process.env.VERCEL) {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local-dns') });
}
if (process.env.DNS_SERVERS && !process.env.VERCEL) {
    require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
}

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');

async function listAdmins() {
    console.log('====================================================');
    console.log('Super Admin List (Read-Only)');
    console.log('====================================================\n');

    await connectDB();

    const admins = await Employee.find({ role: 'admin' }).select('id name status').lean();

    console.log(`Found ${admins.length} Super Admin(s) in total:\n`);
    admins.forEach(admin => {
        console.log(`- ID: ${admin.id} | Name: ${admin.name} | Status: ${admin.status}`);
    });

    const activeCount = admins.filter(a => a.status === 'active').length;
    console.log('\n----------------------------------------------------');
    console.log(`Count of active Super Admins: ${activeCount}`);
    console.log('----------------------------------------------------');

    await mongoose.disconnect();
}

listAdmins().catch(err => {
    console.error('Failed to list admins:', err);
    process.exit(1);
});

