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

async function run() {
    await connectDB();

    console.log('=== EMAIL VERIFICATION DRY RUN ===\n');

    const unverifiedEmployees = await Employee.find({
        status: 'active',
        $or: [
            { emailVerified: false },
            { emailVerified: { $exists: false } },
            { emailVerified: null }
        ]
    }).select('_id id name email role emailVerified').lean();

    console.log(`Total active unverified employees who would receive verification email: ${unverifiedEmployees.length}\n`);

    unverifiedEmployees.forEach((emp, index) => {
        console.log(`${index + 1}. [${emp.id || emp._id}] ${emp.name} <${emp.email}> (Role: ${emp.role})`);
    });

    console.log('\nDRY RUN ONLY. No emails sent.');

    await mongoose.connection.close();
}

run().catch(err => {
    console.error('Error running send_verification_dry_run:', err);
    process.exit(1);
});

