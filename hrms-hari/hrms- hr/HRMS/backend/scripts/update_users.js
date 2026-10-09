const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const Department = require('../models/Department');
const Setting = require('../models/Setting');

async function updateUsers() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Update Setting company name to Hari Hrms
        const setting = await Setting.findOne();
        if (setting) {
            setting.company_name = 'Hari Hrms';
            await setting.save();
            console.log('Updated Settings company name to Hari Hrms.');
        } else {
            await Setting.create({
                company_name: 'Hari Hrms',
                leave_policies: { casual_leave: 12, sick_leave: 12, earned_leave: 15, maternity_leave: 0, paternity_leave: 0 },
                roles_permissions: {
                    hr_manager: ['manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_departments', 'manage_shifts', 'manage_settings', 'view_analytics', 'manage_tickets'],
                    hr: ['manage_employees', 'manage_attendance', 'manage_leaves', 'manage_tickets', 'view_analytics', 'manage_departments', 'manage_shifts'],
                    employee: []
                }
            });
            console.log('Created default system settings with Hari Hrms.');
        }

        // Check if there is an HR department
        let hrDept = await Department.findOne({ name: 'Human Resources' });
        if (!hrDept) {
            hrDept = await Department.create({
                name: 'Human Resources',
                description: 'Manages employee relations, recruitment, and HR policies'
            });
            console.log('Created HR Department');
        }

        // Update/create Admin user (ADM001)
        const adminHash = await bcrypt.hash('Hariharan@123', 10);
        let admin = await Employee.findOne({ id: 'ADM001' });
        if (admin) {
            admin.email = 'hariharanship4@gmail.com';
            admin.password_hash = adminHash;
            admin.role = 'admin';
            admin.status = 'active';
            await admin.save();
            console.log('Updated Admin User email/password.');
        } else {
            // Check if there is already a user with this email
            let existingAdminEmail = await Employee.findOne({ email: 'hariharanship4@gmail.com' });
            if (existingAdminEmail) {
                existingAdminEmail.id = 'ADM001';
                existingAdminEmail.password_hash = adminHash;
                existingAdminEmail.role = 'admin';
                existingAdminEmail.status = 'active';
                await existingAdminEmail.save();
                console.log('Updated existing user with email hariharanship4@gmail.com to ADM001.');
            } else {
                await Employee.create({
                    id: 'ADM001',
                    name: 'System Admin',
                    email: 'hariharanship4@gmail.com',
                    password_hash: adminHash,
                    role: 'admin',
                    department_id: hrDept._id,
                    phone: '8888888888',
                    designation: 'System Administrator',
                    date_of_joining: new Date('2024-01-01'),
                    date_of_birth: new Date('1985-01-01'),
                    gender: 'male',
                    address: 'Main Office',
                    status: 'active'
                });
                console.log('Created Admin User ADM001.');
            }
        }

        // Update/create HR Manager (EMP001)
        const hrHash = await bcrypt.hash('Hariharan@1234', 10);
        let hr = await Employee.findOne({ id: 'EMP001' });
        if (hr) {
            hr.email = 'hariharanponnalagu@gmail.com';
            hr.password_hash = hrHash;
            hr.role = 'hr_manager';
            hr.status = 'active';
            await hr.save();
            console.log('Updated HR Manager email/password.');
        } else {
            let existingHrEmail = await Employee.findOne({ email: 'hariharanponnalagu@gmail.com' });
            if (existingHrEmail) {
                existingHrEmail.id = 'EMP001';
                existingHrEmail.password_hash = hrHash;
                existingHrEmail.role = 'hr_manager';
                existingHrEmail.status = 'active';
                await existingHrEmail.save();
                console.log('Updated existing user with email hariharanponnalagu@gmail.com to EMP001.');
            } else {
                await Employee.create({
                    id: 'EMP001',
                    name: 'HR Manager',
                    email: 'hariharanponnalagu@gmail.com',
                    password_hash: hrHash,
                    role: 'hr_manager',
                    department_id: hrDept._id,
                    phone: '9876543210',
                    designation: 'HR Manager',
                    date_of_joining: new Date('2024-01-01'),
                    date_of_birth: new Date('1990-01-01'),
                    gender: 'male',
                    address: 'Hari Hrms Office',
                    status: 'active'
                });
                console.log('Created HR Manager EMP001.');
            }
        }

        console.log('Database users updated successfully!');
        process.exit(0);
    } catch (err) {
        console.error('Update failed:', err);
        process.exit(1);
    }
}

updateUsers();
