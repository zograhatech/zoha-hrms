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
const Notification = require('../models/Notification');
const { sendEmail } = require('../utils/emailService');

function parseIdsArg(args) {
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg.startsWith('--ids=')) {
            return arg.slice(6).split(',').map(s => s.trim()).filter(Boolean);
        }
        if (arg === '--ids' && args[i + 1] && !args[i + 1].startsWith('--')) {
            return args[i + 1].split(',').map(s => s.trim()).filter(Boolean);
        }
    }
    return null;
}

function getEmailDomain(email) {
    if (!email || typeof email !== 'string' || !email.includes('@')) return 'N/A';
    return '@' + email.split('@')[1];
}

async function run(customArgs = null) {
    const args = customArgs || process.argv.slice(2);
    const isApply = args.includes('--apply');
    const isConfirmed = process.env.CONFIRM_NOTICE === 'yes';
    const explicitIds = parseIdsArg(args);

    if (mongoose.connection.readyState === 0) {
        await connectDB();
    }

    // Find all active unverified employees
    const unverifiedEmployees = await Employee.find({
        status: 'active',
        emailVerified: { $ne: true }
    }).select('id name email _id status emailVerified').sort({ id: 1 }).lean();

    console.log('=== UNVERIFIED ACTIVE EMPLOYEES ===');
    console.log(`Total Unverified Active: ${unverifiedEmployees.length}\n`);

    unverifiedEmployees.forEach(emp => {
        const domain = getEmailDomain(emp.email);
        console.log(`- ID: ${emp.id} | Name: ${emp.name} | Domain: ${domain}`);
    });

    if (!isApply || !isConfirmed) {
        console.log('\nMODE: DRY RUN. No emails or in-app notifications were sent.');
        console.log('To send notices, re-run with: CONFIRM_NOTICE=yes node scripts/send_verification_notice.js --ids <id1,id2> --apply');
        return { mode: 'dry_run', count: unverifiedEmployees.length, sentEmails: 0, sentNotifications: 0 };
    }

    // When --apply and CONFIRM_NOTICE=yes
    if (!explicitIds || explicitIds.length === 0) {
        console.error('\nSAFETY STOP: --ids argument with explicit employee IDs is required when using --apply. Notices will never be sent to all users by default.');
        return { mode: 'blocked_missing_ids', sentEmails: 0, sentNotifications: 0 };
    }

    const targetEmployees = unverifiedEmployees.filter(emp => explicitIds.includes(emp.id));

    if (targetEmployees.length === 0) {
        console.log('\nNo matching unverified active employees found for the provided IDs:', explicitIds);
        return { mode: 'no_matches', targetIds: explicitIds, sentEmails: 0, sentNotifications: 0 };
    }

    console.log(`\nAPPLYING NOTICES TO ${targetEmployees.length} EMPLOYEES (IDs: ${targetEmployees.map(e => e.id).join(', ')})...`);

    let sentEmails = 0;
    let sentNotifications = 0;

    for (const emp of targetEmployees) {
        // 1. Send Email
        try {
            await sendEmail({
                to: emp.email,
                subject: 'Action Required: Verification Code on Next Login',
                text: `Hello ${emp.name},\n\nPlease note that email verification is required for your HRMS account (${emp.id}). Upon your next login, you will receive a 6-digit verification code at this email address to verify your account.`
            });
            sentEmails++;
        } catch (e) {
            console.error(`Failed to send notice email to ${emp.id} (${emp.email}):`, e.message);
        }

        // 2. Send In-App Notification
        try {
            await Notification.create({
                recipient: emp._id,
                type: 'general',
                title: 'Email Verification Notice',
                message: 'Email verification is required for your account. You will receive a verification code on your next login.'
            });
            sentNotifications++;
        } catch (e) {
            console.error(`Failed to create in-app notification for ${emp.id}:`, e.message);
        }
    }

    console.log(`\nSUCCESS: Sent ${sentEmails} emails and ${sentNotifications} in-app notifications.`);
    return { mode: 'applied', sentEmails, sentNotifications, targets: targetEmployees.map(e => e.id) };
}

if (require.main === module) {
    run().then(async () => {
        await mongoose.connection.close();
    }).catch(async err => {
        console.error('Error running send_verification_notice:', err);
        await mongoose.connection.close();
        process.exit(1);
    });
}

module.exports = { run, parseIdsArg, getEmailDomain };

