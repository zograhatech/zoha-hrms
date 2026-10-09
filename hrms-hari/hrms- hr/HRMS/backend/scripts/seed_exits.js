const mongoose = require('mongoose');
const Employee = require('../models/Employee');
const Resignation = require('../models/Resignation');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const seedExits = async () => {
    try {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI is not defined in .env file');
        
        await mongoose.connect(uri);
        console.log('Connected to MongoDB for seeding exits...');

        // Clear existing resignations for a clean start
        await Resignation.deleteMany({});
        console.log('Cleared existing resignations.');

        // Create a specific Test Employee for logging in
        let testEmp = await Employee.findOne({ id: 'EXITUSER' });
        if (testEmp) {
            await Employee.deleteOne({ id: 'EXITUSER' });
        }
        
        testEmp = await Employee.create({
            id: 'EXITUSER',
            name: 'John Exit Test',
            email: 'exit@test.com',
            password_hash: 'password123', // Will be hashed by pre-save
            role: 'employee',
            designation: 'Software Engineer',
            status: 'active'
        });
        console.log('Created test employee EXITUSER with password "password123".');

        const employees = await Employee.find({ role: 'employee', id: { $ne: 'EXITUSER' } }).limit(2);
        const allEmps = [testEmp, ...employees];
        
        const resignations = [
            {
                employee: allEmps[0]._id,
                notice_start_date: new Date(),
                last_working_day: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days notice
                reason: 'I am leaving for a better opportunity in the fintech industry that aligns more with my career goals.',
                status: 'pending'
            },
            {
                employee: allEmps[1]._id,
                notice_start_date: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // Started 15 days ago
                last_working_day: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days left
                reason: 'Relocating to another city for family reasons.',
                status: 'approved',
                hr_comments: 'Approved after discussion. We wish you the best!'
            },
            {
                employee: allEmps[2]._id,
                notice_start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
                last_working_day: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
                reason: 'Higher studies pursuing an MBA.',
                status: 'revoke_requested',
                revoke_reason: 'I have decided to postpone my studies for a year due to personal reasons and would like to continue working.'
            }
        ];

        await Resignation.insertMany(resignations);
        console.log('Successfully seeded 3 exit requests.');
        
        process.exit(0);
    } catch (err) {
        console.error('Seeding error:', err);
        process.exit(1);
    }
};

seedExits();
