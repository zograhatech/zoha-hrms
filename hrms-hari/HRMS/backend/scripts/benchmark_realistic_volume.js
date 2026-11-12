/**
 * Realistic Volume Benchmark Script on hrms_dev
 * Seeds 5,000 messages and 2,000 attendance rows to test real query performance under load.
 * Measures execution stats, verifies IXSCAN, and cleans up all seeded records.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

if (process.env.DB_NAME !== 'hrms_dev') {
    throw new Error('SAFETY CHECK FAILED: Benchmark can only run against hrms_dev');
}

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Attendance = require('../models/Attendance');

async function run() {
    console.log('=== Starting Realistic Volume Benchmark (hrms_dev) ===');
    await connectDB();

    const timestamp = Date.now();
    const benchmarkPrefix = `BENCH_${timestamp}`;

    console.log('\n--- 1. Seeding Test Data (5,000 messages, 2,000 attendance records) ---');
    const tSeedStart = Date.now();

    // 1. Create 4 benchmark employees
    const employees = await Employee.insertMany([
        { id: `${benchmarkPrefix}_E1`, name: 'Benchmark Emp 1', email: `${benchmarkPrefix}_1@test.com`, password_hash: 'hash', role: 'employee' },
        { id: `${benchmarkPrefix}_E2`, name: 'Benchmark Emp 2', email: `${benchmarkPrefix}_2@test.com`, password_hash: 'hash', role: 'employee' },
        { id: `${benchmarkPrefix}_E3`, name: 'Benchmark Emp 3', email: `${benchmarkPrefix}_3@test.com`, password_hash: 'hash', role: 'employee' },
        { id: `${benchmarkPrefix}_E4`, name: 'Benchmark Emp 4', email: `${benchmarkPrefix}_4@test.com`, password_hash: 'hash', role: 'employee' }
    ]);

    // 2. Create 2 benchmark conversations
    const [conv1, conv2] = await Conversation.insertMany([
        { participants: [employees[0]._id, employees[1]._id], isGroup: false },
        { participants: [employees[2]._id, employees[3]._id], isGroup: false }
    ]);

    // 3. Batch seed 5,000 messages
    const messageDocs = [];
    for (let i = 0; i < 5000; i++) {
        const isConv1 = i % 2 === 0;
        const targetConv = isConv1 ? conv1 : conv2;
        const sender = isConv1 ? (i % 4 === 0 ? employees[0]._id : employees[1]._id) : employees[2]._id;
        const status = i < 4000 ? 'seen' : (i < 4800 ? 'delivered' : 'sent');

        messageDocs.push({
            conversationId: targetConv._id,
            sender,
            text: `Benchmark test message ${i} - ${benchmarkPrefix}`,
            fileUrl: i % 25 === 0 ? `https://storage.example.com/file_${i}.pdf` : null,
            fileName: i % 25 === 0 ? `file_${i}.pdf` : null,
            status,
            createdAt: new Date(Date.now() - (5000 - i) * 1000)
        });
    }
    await Message.insertMany(messageDocs, { ordered: false });
    console.log(`✅ Seeded 5,000 messages.`);

    // 4. Batch seed 2,000 attendance rows
    const attendanceDocs = [];
    for (let i = 0; i < 2000; i++) {
        const emp = employees[i % 4];
        const isOpen = i % 10 === 0; // 10% open sessions
        const recordDate = new Date(Date.now() - Math.floor(i / 4) * 86400000);

        attendanceDocs.push({
            employee_id: emp.id,
            date: recordDate,
            status: isOpen ? 'present' : (i % 5 === 0 ? 'late' : 'present'),
            check_in: recordDate,
            check_out: isOpen ? null : new Date(recordDate.getTime() + 8 * 3600000),
            is_open_session: isOpen,
            last_activity_at: new Date(recordDate.getTime() + (isOpen ? 3600000 : 8 * 3600000)),
            source: 'web'
        });
    }
    await Attendance.insertMany(attendanceDocs, { ordered: false });
    console.log(`✅ Seeded 2,000 attendance rows in ${Date.now() - tSeedStart}ms.`);

    console.log('\n--- 2. Benchmarking Queries with Execution Stats ---');

    // Test A: Sweeper Query (Attendance is_open_session)
    const t0 = performance.now();
    const sweeperExplain = await Attendance.find({ is_open_session: true }).explain('executionStats');
    const tSweeper = performance.now() - t0;

    console.log('\n[A. Sweeper Open Sessions Query]');
    console.log(`- Query Time: ${tSweeper.toFixed(2)}ms`);
    console.log(`- Execution Stage: ${sweeperExplain.queryPlanner.winningPlan.inputStage?.stage || sweeperExplain.queryPlanner.winningPlan.stage}`);
    console.log(`- Index Used: ${sweeperExplain.queryPlanner.winningPlan.inputStage?.indexName || 'COLLSCAN'}`);
    console.log(`- Docs Returned: ${sweeperExplain.executionStats.nReturned}`);
    console.log(`- Docs Examined: ${sweeperExplain.executionStats.totalDocsExamined}`);

    // Test B: Unread Count Aggregation across 5,000 messages
    const t1 = performance.now();
    const unreadCounts = await Message.aggregate([
        {
            $match: {
                conversationId: { $in: [conv1._id, conv2._id] },
                sender: { $ne: employees[0]._id },
                status: { $in: ['sent', 'delivered'] }
            }
        },
        {
            $group: {
                _id: '$conversationId',
                count: { $sum: 1 }
            }
        }
    ]);
    const tUnread = performance.now() - t1;

    console.log('\n[B. Unread Message Count Aggregation (5k messages)]');
    console.log(`- Aggregation Time: ${tUnread.toFixed(2)}ms`);
    console.log(`- Result:`, JSON.stringify(unreadCounts));

    // Test C: Message History Fetch with Sort & Limit
    const t2 = performance.now();
    const historyExplain = await Message.find({ conversationId: conv1._id })
        .sort({ createdAt: 1 })
        .limit(100)
        .explain('executionStats');
    const tHistory = performance.now() - t2;

    console.log('\n[C. Message Transcript Fetch (100 messages)]');
    console.log(`- Query Time: ${tHistory.toFixed(2)}ms`);
    function findIndexName(stage) {
        if (!stage) return null;
        if (stage.indexName) return stage.indexName;
        return findIndexName(stage.inputStage) || (stage.inputStages ? stage.inputStages.map(findIndexName).find(Boolean) : null);
    }
    const usedIndex = findIndexName(historyExplain.queryPlanner.winningPlan) || 'COLLSCAN';
    console.log(`- Index Used: ${usedIndex}`);
    console.log(`- Winning Plan Stage: ${historyExplain.queryPlanner.winningPlan.stage}`);

    console.log('\n--- 3. Cleaning Up Seeded Benchmark Records ---');
    await Message.deleteMany({ text: { $regex: benchmarkPrefix } });
    await Attendance.deleteMany({ employee_id: { $regex: benchmarkPrefix } });
    await Conversation.deleteMany({ _id: { $in: [conv1._id, conv2._id] } });
    await Employee.deleteMany({ id: { $regex: benchmarkPrefix } });
    console.log('✅ Cleaned up 5,000 messages, 2,000 attendance rows, conversations, and employees.');

    await mongoose.connection.close();
    console.log('Closed DB connection.');
}

run().catch(err => {
    console.error('❌ Benchmark failed:', err);
    process.exit(1);
});
