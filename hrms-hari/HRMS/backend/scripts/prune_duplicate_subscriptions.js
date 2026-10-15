require('dotenv').config();
const path = require('path');
if (!process.env.VERCEL) {
    require('dotenv').config({ path: path.join(__dirname, '../.env.local-dns') });
}
if (process.env.DNS_SERVERS && !process.env.VERCEL) {
    require('dns').setServers(process.env.DNS_SERVERS.split(',').map(s => s.trim()));
}

const fs = require('fs');
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');

async function pruneDuplicateSubscriptions() {
    const isApply = process.argv.includes('--apply') && process.env.CONFIRM_PRUNE === 'yes';

    console.log(`=== PUSH SUBSCRIPTIONS DEDUPLICATION SCRIPT [${isApply ? 'APPLY MODE' : 'DRY RUN'}] ===\n`);

    await connectDB();

    try {
        const employees = await Employee.find({
            'push_subscriptions.0': { $exists: true }
        }).select('_id id name push_subscriptions');

        const affected = [];

        for (const emp of employees) {
            const subs = emp.push_subscriptions || [];
            if (subs.length <= 1) continue;

            const endpointMap = new Map();
            let hasDuplicates = false;

            // Find all entries for each endpoint
            for (const sub of subs) {
                if (!sub || !sub.endpoint) continue;
                if (!endpointMap.has(sub.endpoint)) {
                    endpointMap.set(sub.endpoint, []);
                }
                endpointMap.get(sub.endpoint).push(sub);
            }

            const deduplicated = [];
            const duplicateDetails = [];

            for (const [endpoint, entries] of endpointMap.entries()) {
                if (entries.length > 1) {
                    hasDuplicates = true;
                    // Sort descending by createdAt or keep the last one added as newest
                    entries.sort((a, b) => {
                        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                        return timeB - timeA;
                    });
                    const newest = entries[0];
                    deduplicated.push(newest);
                    duplicateDetails.push({
                        endpoint,
                        totalEntries: entries.length,
                        keptCreatedAt: newest.createdAt
                    });
                } else {
                    deduplicated.push(entries[0]);
                }
            }

            if (hasDuplicates) {
                affected.push({
                    emp,
                    originalCount: subs.length,
                    prunedCount: deduplicated.length,
                    deduplicated,
                    duplicateDetails
                });
            }
        }

        console.log(`Employees scanned with subscriptions: ${employees.length}`);
        console.log(`Employees with duplicate subscriptions: ${affected.length}\n`);

        if (affected.length === 0) {
            console.log('No duplicate subscriptions found. Exiting.');
            return;
        }

        for (const item of affected) {
            console.log(`Employee: ${item.emp.id} (${item.emp.name}) - Original: ${item.originalCount}, Deduplicated: ${item.prunedCount}`);
            for (const dup of item.duplicateDetails) {
                let host = dup.endpoint;
                try {
                    host = new URL(dup.endpoint).host;
                } catch (_) {}
                console.log(`  - Host: ${host} (Total entries: ${dup.totalEntries}, kept newest: ${dup.keptCreatedAt || 'no date'})`);
            }
        }

        if (!isApply) {
            console.log('\n[DRY RUN] No changes were written. To apply changes, run with: --apply and CONFIRM_PRUNE=yes');
            return;
        }

        // Export affected documents to backups/ before write
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(__dirname, '../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }
        const backupFile = path.join(backupDir, `duplicate_subscriptions_backup_${timestamp}.json`);

        const backupData = affected.map(a => ({
            _id: a.emp._id,
            id: a.emp.id,
            name: a.emp.name,
            push_subscriptions: a.emp.push_subscriptions
        }));

        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
        console.log(`\nBackup written to: ${backupFile}`);

        // Perform updates (do not touch legacy push_subscription field)
        for (const item of affected) {
            await Employee.updateOne(
                { _id: item.emp._id },
                { $set: { push_subscriptions: item.deduplicated } }
            );
            console.log(`Updated employee ${item.emp.id} -> pruned to ${item.deduplicated.length} subscriptions.`);
        }

        console.log('\nPrune completed successfully.');
    } finally {
        await mongoose.connection.close();
    }
}

if (require.main === module) {
    pruneDuplicateSubscriptions().catch(err => {
        console.error('Prune script failed:', err);
        process.exit(1);
    });
}

module.exports = pruneDuplicateSubscriptions;

