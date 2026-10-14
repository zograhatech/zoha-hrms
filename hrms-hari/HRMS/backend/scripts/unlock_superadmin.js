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
    const args = process.argv.slice(2);
    const adminId = args.find(arg => !arg.startsWith('--'));

    if (!adminId) {
        console.error('Usage: node scripts/unlock_superadmin.js <admin_id_or_email> [--apply]');
        process.exit(1);
    }

    await connectDB();

    const query = {
        $or: [
            { id: adminId },
            { email: adminId.toLowerCase() }
        ]
    };
    if (mongoose.Types.ObjectId.isValid(adminId)) {
        query.$or.push({ _id: adminId });
    }

    const admin = await Employee.findOne(query);

    if (!admin) {
        console.error(`Error: User "${adminId}" not found.`);
        await mongoose.connection.close();
        process.exit(1);
    }

    if ((admin.role || '').toLowerCase() !== 'admin') {
        console.error(`Error: User "${adminId}" is not a SuperAdmin (role: ${admin.role}).`);
        await mongoose.connection.close();
        process.exit(1);
    }

    const isApply = args.includes('--apply');
    const isConfirmed = process.env.CONFIRM_RECOVERY === 'yes';

    console.log('=== SUPERADMIN ACCOUNT STATUS ===');
    console.log(`ID:           ${admin.id}`);
    console.log(`_id:          ${admin._id}`);
    console.log(`Name:         ${admin.name}`);
    console.log(`Email:        ${admin.email}`);
    console.log(`Role:         ${admin.role}`);
    console.log(`2FA Attempts: ${admin.twofaAttempts || 0}`);
    console.log(`Locked Until: ${admin.twofaLockedUntil || 'Not Locked'}\n`);

    if (isApply && isConfirmed) {
        admin.twofaLockedUntil = null;
        admin.twofaAttempts = 0;
        await admin.save();
        console.log(`APPLIED: Successfully unlocked SuperAdmin ${admin.id}. 2FA lock and attempts cleared.`);
    } else {
        console.log('MODE: READ-ONLY (Dry Run). No changes were made.');
        console.log('To unlock, re-run with: CONFIRM_RECOVERY=yes node scripts/unlock_superadmin.js <id> --apply');
    }

    await mongoose.connection.close();
}

run().catch(err => {
    console.error('Error running unlock_superadmin:', err);
    process.exit(1);
});

