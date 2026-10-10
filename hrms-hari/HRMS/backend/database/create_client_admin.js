/**
 * Creates the first admin (ADM001) and company settings for a NEW client database.
 * - Does NOT wipe anything.
 * - Aborts if the database already has employees.
 * Run from backend/:  node database/create_client_admin.js
 */
require('dotenv').config();
const path = require('path');
if (!process.env.VERCEL) {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local-dns') });
}

if (process.env.DNS_SERVERS && !process.env.VERCEL) {
    require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
}

const mongoose = require('mongoose');
const Department = require('../models/Department');
const Employee = require('../models/Employee');
const Setting = require('../models/Setting');

const required = ['MONGO_URI', 'COMPANY_NAME', 'ADMIN_NAME', 'ADMIN_EMAIL', 'ADMIN_PASSWORD'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
    console.error('Missing env vars:', missing.join(', '));
    process.exit(1);
}

(async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, { dbName: 'hrms_db' });
        console.log('Connected to MongoDB');

        const existing = await Employee.countDocuments();
        if (existing > 0) {
            console.error(`Aborted: database already has ${existing} employee(s).`);
            process.exit(1);
        }

        const hr = await Department.findOneAndUpdate(
            { name: 'Human Resources' },
            { name: 'Human Resources', description: 'Manages employee relations, recruitment, and HR policies' },
            { upsert: true, new: true }
        );

        await Setting.findOneAndUpdate({}, { company_name: process.env.COMPANY_NAME }, { upsert: true, new: true });

        // Plain-text password is fine: the Employee pre-save hook bcrypt-hashes it.
        await Employee.create({
            id: 'ADM001',
            name: process.env.ADMIN_NAME,
            email: process.env.ADMIN_EMAIL,
            password_hash: process.env.ADMIN_PASSWORD,
            role: 'admin',
            department_id: hr._id,
            designation: 'System Administrator',
            date_of_joining: new Date(),
            status: 'active',
        });

        console.log('Admin ADM001 created. Client database is ready.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Setup failed:', err.message);
        process.exit(1);
    }
})();

