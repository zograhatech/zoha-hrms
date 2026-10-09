const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const Setting = require('../models/Setting');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // 1. Update all employees with 'admin' role to 'hr_manager'
        const empUpdate = await Employee.updateMany({ role: 'admin' }, { $set: { role: 'hr_manager' } });
        console.log(`Updated ${empUpdate.modifiedCount} employees from admin to hr_manager.`);

        // 2. Update settings to remove 'admin' role permissions
        const settings = await Setting.findOne();
        if (settings && settings.roles_permissions) {
            const roles = settings.roles_permissions;
            if (roles.admin) {
                // Transfer admin permissions to hr_manager if needed
                // (Already handled by updating the model default, but this updates existing DB record)
                roles.hr_manager = Array.from(new Set([...(roles.hr_manager || []), ...(roles.admin || [])]));
                delete roles.admin;
                settings.markModified('roles_permissions');
                await settings.save();
                console.log('Removed admin role from settings and transferred permissions to hr_manager.');
            }
        }

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
