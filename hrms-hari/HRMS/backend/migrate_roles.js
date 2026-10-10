const mongoose = require('mongoose');
const Setting = require('./models/Setting');
const Employee = require('./models/Employee');
require('dotenv').config();

async function migrate() {
    try {
        console.log('Connecting to:', process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);

        // 1. Update Settings
        const settings = await Setting.findOne();
        if (settings && settings.roles_permissions) {
            console.log('Updating settings roles_permissions...');
            const oldRoles = settings.roles_permissions;
            if (oldRoles.admin && !oldRoles.hr_manager) {
                const newRoles = { ...oldRoles };
                newRoles.hr_manager = oldRoles.admin;
                delete newRoles.admin;
                settings.roles_permissions = newRoles;
                settings.markModified('roles_permissions');
                await settings.save();
                console.log('✅ Settings migrated: admin -> hr_manager');
            } else {
                console.log('ℹ️ Settings already migrated or no admin role found.');
            }
        }

        // 2. Update Employees
        console.log('Updating employee roles...');
        const result = await Employee.updateMany(
            { role: 'admin' },
            { $set: { role: 'hr_manager', designation: 'Hr manger' } }
        );
        console.log(`✅ Employees migrated: ${result.modifiedCount} updated.`);

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}
migrate();
