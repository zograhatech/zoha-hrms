require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Attendance = require('../models/Attendance');

async function run() {
    console.log('=== Running explain() on sweeper query (hrms_dev) ===');
    await connectDB();

    // Ensure dev index is built
    await Attendance.syncIndexes();

    // Run explain on the sweeper's exact query
    const explanation = await Attendance.find({ is_open_session: true }).explain('executionStats');

    console.log('\nQuery Planner Stage:', explanation.queryPlanner?.winningPlan?.stage);
    console.log('Input Stage:', explanation.queryPlanner?.winningPlan?.inputStage?.stage);
    console.log('Index Name Used:', explanation.queryPlanner?.winningPlan?.inputStage?.indexName || explanation.queryPlanner?.winningPlan?.indexName);
    console.log('Total Docs Examined:', explanation.executionStats?.totalDocsExamined);
    console.log('Total Keys Examined:', explanation.executionStats?.totalKeysExamined);
    console.log('Execution Time (ms):', explanation.executionStats?.executionTimeMillis);

    const winningStage = explanation.queryPlanner?.winningPlan?.stage;
    const inputStage = explanation.queryPlanner?.winningPlan?.inputStage?.stage;

    if (winningStage === 'COLLSCAN' && !inputStage) {
        console.error('❌ Mismatch: Query is using COLLSCAN!');
        process.exit(1);
    } else {
        console.log('\n✅ Verification Passed: Query uses Index Scan (IXSCAN).');
    }

    await mongoose.connection.close();
}

run().catch(err => {
    console.error('❌ Error during explain():', err);
    process.exit(1);
});
