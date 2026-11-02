/**
 * Migration Script: migrate_messages_status.js
 * 
 * Purpose:
 * Backfill existing chat messages to status 'seen' and set deliveredAt / seenAt
 * to prevent historical messages from triggering unread counts.
 * 
 * Safety:
 * - Non-destructive (only updates documents missing status or with empty status).
 * - Supports dry-run with `--dry-run` flag.
 * 
 * Usage:
 *   node scripts/migrate_messages_status.js --dry-run
 *   node scripts/migrate_messages_status.js --run
 */

const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const Message = require('../models/Message');

const isDryRun = process.argv.includes('--dry-run') || !process.argv.includes('--run');

async function runMigration() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error('ERROR: MONGODB_URI / MONGO_URI environment variable not found.');
        process.exit(1);
    }

    console.log('----------------------------------------------------');
    console.log(`Starting Chat Message Status Migration (${isDryRun ? 'DRY RUN' : 'LIVE EXECUTION'})`);
    console.log('----------------------------------------------------');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    const filter = {
        $or: [
            { status: { $exists: false } },
            { status: null },
            { status: 'sent' } // Older sent messages before migration are considered seen historically
        ]
    };

    const count = await Message.countDocuments(filter);
    console.log(`Found ${count} messages to migrate.`);

    if (isDryRun) {
        console.log('[DRY RUN] No changes were made to the database.');
        console.log('To apply changes, run: node scripts/migrate_messages_status.js --run');
        await mongoose.disconnect();
        process.exit(0);
    }

    const now = new Date();
    const result = await Message.updateMany(filter, [
        {
            $set: {
                status: 'seen',
                deliveredAt: { $ifNull: ['$deliveredAt', '$createdAt', now] },
                seenAt: { $ifNull: ['$seenAt', '$createdAt', now] }
            }
        }
    ]);

    console.log(`✅ Successfully updated ${result.modifiedCount} messages.`);
    await mongoose.disconnect();
    console.log('Database connection closed.');
}

runMigration().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});

