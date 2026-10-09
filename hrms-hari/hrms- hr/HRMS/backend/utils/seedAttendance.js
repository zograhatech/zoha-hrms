const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const Attendance = require('../models/Attendance');
const Employee = require('../models/Employee');

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI;

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const employeeId = 'EMP009';

        // Ensure employee exists
        let emp = await Employee.findOne({ id: employeeId });
        if (!emp) {
            console.log('Employee EMP009 not found. Creating...');
            emp = await Employee.create({
                id: employeeId,
                name: 'Muralidharan',
                email: 'muralivijay352003@gmail.com',
                password_hash: 'emp123', // Will be hashed by pre-save
                designation: 'Software Engineer',
                role: 'employee',
                status: 'active',
                date_of_joining: new Date('2026-01-01'), // Overriding to allow Feb attendance
                salary_details: {
                    basic: 15000,
                    da: 4000,
                    oa: 6000,
                    bank_ac_no: '500101012855323'
                }
            });
            console.log('Employee created.');
        }

        const year = 2026;
        const month = 1; // February (0-indexed)
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        const attendanceRecords = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const isSunday = date.getDay() === 0;

            if (isSunday) {
                attendanceRecords.push({
                    employee_id: employeeId,
                    date: date,
                    status: 'absent',
                    check_in: '',
                    check_out: '',
                    work_hours: 0
                });
            } else {
                // Randomize office hours
                const inMin = Math.floor(Math.random() * 15); // 0-14 mins late
                const outMin = Math.floor(Math.random() * 30); // 0-29 mins late stay

                attendanceRecords.push({
                    employee_id: employeeId,
                    date: date,
                    status: 'present',
                    check_in: `09:${inMin.toString().padStart(2, '0')}:00`,
                    check_out: `18:${outMin.toString().padStart(2, '0')}:00`,
                    work_hours: 9 + (outMin / 60) - (inMin / 60)
                });
            }
        }

        // Clear existing for that month/employee to avoid dupes
        await Attendance.deleteMany({
            employee_id: employeeId,
            date: {
                $gte: new Date(year, month, 1),
                $lte: new Date(year, month, daysInMonth)
            }
        });

        await Attendance.insertMany(attendanceRecords);
        console.log(`Successfully seeded ${attendanceRecords.length} records for ${employeeId} in Feb ${year}`);

    } catch (error) {
        console.error('Seeding error:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
}

seed();
