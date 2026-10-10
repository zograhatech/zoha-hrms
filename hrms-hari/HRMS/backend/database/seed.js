/**
 * Hari HRMS — MongoDB Seed Script
 * Run: node database/seed.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Department = require('../models/Department');
const Employee = require('../models/Employee');
const AttModel = require('../models/Attendance');
const LeaveModel = require('../models/Leave');
const LBModel = require('../models/LeaveBalance');
const Payroll = require('../models/Payroll');
const Ticket = require('../models/Ticket');
const Setting = require('../models/Setting');
const Announcement = require('../models/Announcement');
const AuditLog = require('../models/AuditLog');
const BankAccount = require('../models/BankAccount');
const BankTransaction = require('../models/BankTransaction');
const Conversation = require('../models/Conversation');
const Customer = require('../models/Customer');
const Event = require('../models/Event');
const FunSubmission = require('../models/FunSubmission');
const Item = require('../models/Item');
const Ledger = require('../models/Ledger');
const Message = require('../models/Message');
const Note = require('../models/Note');
const Notification = require('../models/Notification');
const PurchaseInvoice = require('../models/PurchaseInvoice');
const Resignation = require('../models/Resignation');
const SalesInvoice = require('../models/SalesInvoice');
const Shift = require('../models/Shift');
const StockTransaction = require('../models/StockTransaction');
const Transaction = require('../models/Transaction');
const Vendor = require('../models/Vendor');

async function seed() {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
        console.error('❌ MONGO_URI is not defined in .env');
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Wipe ALL existing data
    console.log('🧹 Wiping all collections...');
    await Promise.all([
        Department.deleteMany({}),
        Employee.deleteMany({}),
        AttModel.deleteMany({}),
        LeaveModel.deleteMany({}),
        LBModel.deleteMany({}),
        Payroll.deleteMany({}),
        Ticket.deleteMany({}),
        Setting.deleteMany({}),
        Announcement.deleteMany({}),
        AuditLog.deleteMany({}),
        BankAccount.deleteMany({}),
        BankTransaction.deleteMany({}),
        Conversation.deleteMany({}),
        Customer.deleteMany({}),
        Event.deleteMany({}),
        FunSubmission.deleteMany({}),
        Item.deleteMany({}),
        Ledger.deleteMany({}),
        Message.deleteMany({}),
        Note.deleteMany({}),
        Notification.deleteMany({}),
        PurchaseInvoice.deleteMany({}),
        Resignation.deleteMany({}),
        SalesInvoice.deleteMany({}),
        Shift.deleteMany({}),
        StockTransaction.deleteMany({}),
        Transaction.deleteMany({}),
        Vendor.deleteMany({})
    ]);
    console.log('🗑️  All existing data cleared');

    // Departments
    const [HR] = await Department.insertMany([
        { name: 'Human Resources', description: 'Manages employee relations, recruitment, and HR policies' }
    ]);
    console.log('✅ HR Department created');

    // Default System Settings
    await Setting.create({
        company_name: 'Hari Hrms',
        leave_policies: { casual_leave: 12, sick_leave: 12, earned_leave: 15, maternity_leave: 0, paternity_leave: 0 },
        roles_permissions: {
            hr_manager: ['manage_employees', 'manage_attendance', 'manage_leaves', 'manage_payroll', 'manage_departments', 'manage_shifts', 'manage_settings', 'view_analytics', 'manage_tickets'],
            hr: ['manage_employees', 'manage_attendance', 'manage_leaves', 'manage_tickets', 'view_analytics', 'manage_departments', 'manage_shifts'],
            employee: []
        }
    });
    console.log('✅ Default Settings initialized');

    // Hash passwords
    const adminHash = await bcrypt.hash('Hariharan@123', 10);
    const hrManagerHash = await bcrypt.hash('Hariharan@1234', 10);

    const employees = await Employee.insertMany([
        { 
            id: 'ADM001', 
            name: 'System Admin', 
            email: 'hariharanship4@gmail.com', 
            password_hash: adminHash, 
            role: 'admin', 
            department_id: HR._id, 
            phone: '8888888888', 
            designation: 'System Administrator', 
            date_of_joining: new Date('2024-01-01'), 
            date_of_birth: new Date('1985-01-01'), 
            gender: 'male', 
            address: 'Main Office', 
            status: 'active' 
        },
        { 
            id: 'EMP001', 
            name: 'HR Manager', 
            email: 'hariharanponnalagu@gmail.com', 
            password_hash: hrManagerHash, 
            role: 'hr_manager', 
            department_id: HR._id, 
            phone: '9876543210', 
            designation: 'HR Manager', 
            date_of_joining: new Date('2024-01-01'), 
            date_of_birth: new Date('1990-01-01'), 
            gender: 'male', 
            address: 'Hari Hrms Office', 
            status: 'active' 
        }
    ]);
    console.log('✅ HR Manager created (EMP001)');

    // Leave Balances
    await LBModel.insertMany([
        { employee_id: 'EMP001', casual_leave: 12, sick_leave: 12, earned_leave: 15, maternity_leave: 0, paternity_leave: 15, year: 2026 }
    ]);
    console.log('✅ Leave balance created for HR Manager');

    await mongoose.disconnect();
    console.log('\n════════════════════════════════════════');
    console.log('🎉  MongoDB database seeded successfully!');
    console.log('════════════════════════════════════════');

}

seed().catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
