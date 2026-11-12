/**
 * Production Index Creation Script - Manual Execution Only
 *
 * SAFETY:
 * - Requires explicit confirmation environment variable: CONFIRM_PRODUCTION=yes
 * - Connects to process.env.MONGODB_URI (production hrms_db)
 * - Safe background index creation that does not lock writes
 *
 * USAGE:
 *   CONFIRM_PRODUCTION=yes node create_production_indexes.js
 *
 * ROLLBACK NOTE:
 *   If any index needs to be rolled back, run the following in mongosh or via MongoDB Atlas UI:
 *   db.attendances.dropIndex("is_open_session_1_last_activity_at_1");
 *   db.conversations.dropIndex("participants_1_updatedAt_-1");
 *   db.messages.dropIndex("conversationId_1_sender_1_status_1");
 *   db.auditlogs.dropIndex("resource_1_resource_id_1_timestamp_-1");
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

if (process.env.CONFIRM_PRODUCTION !== 'yes') {
    console.error('\n❌ SAFETY GUARD: This script modifies production database indexes.');
    console.error('To proceed, run with CONFIRM_PRODUCTION=yes:');
    console.error('  CONFIRM_PRODUCTION=yes node create_production_indexes.js\n');
    process.exit(1);
}

const mongoose = require('mongoose');

async function run() {
    console.log('=== Starting Production Index Creation ===');
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('MONGODB_URI is not set in environment.');

    await mongoose.connect(uri, {
        dbName: 'hrms_db',
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
    });
    console.log('✅ Connected to MongoDB Atlas production database (hrms_db)');

    const db = mongoose.connection.db;

    const indexDefinitions = [
        {
            collection: 'attendances',
            spec: { is_open_session: 1, last_activity_at: 1 },
            options: { name: 'is_open_session_1_last_activity_at_1', background: true }
        },
        {
            collection: 'conversations',
            spec: { participants: 1, updatedAt: -1 },
            options: { name: 'participants_1_updatedAt_-1', background: true }
        },
        {
            collection: 'messages',
            spec: { conversationId: 1, sender: 1, status: 1 },
            options: { name: 'conversationId_1_sender_1_status_1', background: true }
        },
        {
            collection: 'auditlogs',
            spec: { resource: 1, resource_id: 1, timestamp: -1 },
            options: { name: 'resource_1_resource_id_1_timestamp_-1', background: true }
        }
    ];

    for (const item of indexDefinitions) {
        const t0 = Date.now();
        console.log(`Creating index ${item.options.name} on ${item.collection}...`);
        const result = await db.collection(item.collection).createIndex(item.spec, item.options);
        console.log(`  ✅ Index created in ${Date.now() - t0}ms: ${result}`);
    }

    console.log('\n=== All Production Indexes Successfully Created ===');
    console.log('\nROLLBACK INSTRUCTIONS (if ever needed):');
    console.log('  db.attendances.dropIndex("is_open_session_1_last_activity_at_1");');
    console.log('  db.conversations.dropIndex("participants_1_updatedAt_-1");');
    console.log('  db.messages.dropIndex("conversationId_1_sender_1_status_1");');
    console.log('  db.auditlogs.dropIndex("resource_1_resource_id_1_timestamp_-1");');

    await mongoose.connection.close();
}

run().catch(err => {
    console.error('❌ Production index creation failed:', err);
    process.exit(1);
});
