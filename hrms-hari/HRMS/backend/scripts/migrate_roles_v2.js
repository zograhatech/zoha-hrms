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
const Setting = require('../models/Setting');

const isApply = process.argv.includes('--apply');

async function migrate() {
    console.log('====================================================');
    console.log(`Role Migration v2: ${isApply ? 'APPLY MODE (Writing changes)' : 'DRY RUN MODE (No changes written)'}`);
    console.log('====================================================\n');

    await connectDB();

    const employees = await Employee.find({});
    console.log(`Found ${employees.length} total employee(s).\n`);

    let changesCount = 0;
    let unchangedCount = 0;

    for (const emp of employees) {
        const rawRole = emp.role || 'employee';
        let targetRole = null;

        if (['hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(rawRole.toLowerCase())) {
            targetRole = 'manager';
        } else if (rawRole.toLowerCase() === 'hr') {
            targetRole = 'team_lead';
        }

        if (targetRole && targetRole !== rawRole) {
            changesCount++;
            console.log(`[PLAN] Employee ${emp.id} ("${emp.name}"): role '${rawRole}' -> '${targetRole}'`);
            if (isApply) {
                emp.role = targetRole;
                await emp.save();
                console.log(`  -> Applied update for ${emp.id}`);
            }
        } else {
            unchangedCount++;
            console.log(`[SKIP] Employee ${emp.id} ("${emp.name}"): role '${rawRole}' unchanged`);
        }
    }

    // Also check Setting roles_permissions if applicable
    const settings = await Setting.findOne();
    if (settings && settings.roles_permissions) {
        const rp = settings.roles_permissions;
        let settingsModified = false;
        if (rp.hr_manager && !rp.manager) {
            console.log('\n[PLAN] Settings.roles_permissions: copy hr_manager -> manager');
            if (isApply) {
                rp.manager = rp.hr_manager;
                settingsModified = true;
            }
        }
        if (rp.hr && !rp.team_lead) {
            console.log('[PLAN] Settings.roles_permissions: copy hr -> team_lead');
            if (isApply) {
                rp.team_lead = rp.hr;
                settingsModified = true;
            }
        }
        if (isApply && settingsModified) {
            settings.markModified('roles_permissions');
            await settings.save();
            console.log('  -> Applied Setting.roles_permissions updates.');
        }
    }

    console.log('\n----------------------------------------------------');
    console.log(`Summary: ${changesCount} planned change(s), ${unchangedCount} unchanged.`);
    if (!isApply) {
        console.log('Dry run complete. No database records were modified.');
        console.log('To apply these changes, run with: node scripts/migrate_roles_v2.js --apply');
    } else {
        console.log('Migration applied successfully.');
    }
    console.log('----------------------------------------------------');

    await mongoose.disconnect();
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});

