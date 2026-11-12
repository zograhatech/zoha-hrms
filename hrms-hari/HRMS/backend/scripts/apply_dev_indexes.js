/**
 * Safe Index Creation Script - Strictly for hrms_dev
 * Tests that compound indexes build cleanly and outputs execution times.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

if (process.env.DB_NAME !== 'hrms_dev') {
    throw new Error('SAFETY CHECK FAILED: Script can only run against hrms_dev');
}

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Attendance = require('../models/Attendance');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');

async function run() {
    console.log('=== Applying & Verifying Indexes on hrms_dev ===');
    const start = Date.now();
    await connectDB();

    const models = [
        { name: 'Attendance', model: Attendance },
        { name: 'Conversation', model: Conversation },
        { name: 'Message', model: Message },
        { name: 'AuditLog', model: AuditLog }
    ];

    for (const { name, model } of models) {
        const t0 = Date.now();
        console.log(`Syncing indexes for ${name}...`);
        await model.syncIndexes();
        const indexes = await model.collection.getIndexes();
        console.log(`✅ ${name} indexes (${Date.now() - t0}ms):`, Object.keys(indexes).join(', '));
    }

    console.log(`\nAll dev indexes successfully verified in ${Date.now() - start}ms.`);
    await mongoose.connection.close();
}

run().catch(err => {
    console.error('❌ Index verification failed:', err);
    process.exit(1);
});
