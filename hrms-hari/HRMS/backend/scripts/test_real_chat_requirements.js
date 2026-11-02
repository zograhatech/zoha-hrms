const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const http = require('http');
const mongoose = require('mongoose');
const app = require('../server');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ae9ae69317fdf3bf8139f08f8c67cbeedf62552dab177b589b8f1515fee6680fb790979e28089abfbd444f91d42ed74f';

function createToken(emp) {
    return jwt.sign(
        {
            _id: emp._id.toString(),
            id: emp.id,
            email: emp.email,
            role: emp.role,
            name: emp.name
        },
        JWT_SECRET,
        { expiresIn: '1h' }
    );
}

async function runTests() {
    console.log('====================================================');
    console.log('REAL TESTING: Chat Status Sync & Server Requirements');
    console.log('====================================================\n');

    await connectDB();

    // Start local HTTP server on random free port
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;
    console.log(`Backend HTTP test server listening on ${baseUrl}\n`);

    const results = {
        test1_lifecycle: { passed: false, details: '' },
        test2_unread_counts: { passed: false, details: '' },
        test3_auth_rejection: { passed: false, details: '' },
        test4_mongoose_cache: { passed: false, details: '' }
    };

    let alice, bob, eve, conversation;
    let aliceToken, bobToken, eveToken;

    try {
        // --- SETUP TEST USERS ---
        console.log('1. Setting up test users in MongoDB (Alice, Bob, Eve)...');
        await Employee.deleteMany({ email: { $in: ['test_alice_real@zograha.com', 'test_bob_real@zograha.com', 'test_eve_real@zograha.com'] } });
        
        alice = await Employee.create({
            id: 'EMPTEST01',
            name: 'Test Alice',
            email: 'test_alice_real@zograha.com',
            role: 'employee',
            status: 'active',
            password_hash: 'dummyhash'
        });

        bob = await Employee.create({
            id: 'EMPTEST02',
            name: 'Test Bob',
            email: 'test_bob_real@zograha.com',
            role: 'employee',
            status: 'active',
            password_hash: 'dummyhash'
        });

        eve = await Employee.create({
            id: 'EMPTEST03',
            name: 'Test Eve',
            email: 'test_eve_real@zograha.com',
            role: 'employee',
            status: 'active',
            password_hash: 'dummyhash'
        });

        aliceToken = createToken(alice);
        bobToken = createToken(bob);
        eveToken = createToken(eve);

        // Create conversation between Alice and Bob
        conversation = await Conversation.create({
            participants: [alice._id, bob._id]
        });

        // -------------------------------------------------------------
        // REQUIREMENT 4: Confirm Mongoose connection is cached across invocations
        // -------------------------------------------------------------
        console.log('--- Checking Requirement 4: Mongoose connection caching ---');
        const conn1 = await connectDB();
        const state1 = mongoose.connection.readyState;
        const conn2 = await connectDB();
        const state2 = mongoose.connection.readyState;
        const isSameConnection = conn1 === conn2 && state1 === 1 && state2 === 1;

        if (isSameConnection) {
            results.test4_mongoose_cache.passed = true;
            results.test4_mongoose_cache.details = `Cached connection reused. readyState: ${state1}, instances identical: ${conn1 === conn2}`;
            console.log('✅ Requirement 4 PASSED:', results.test4_mongoose_cache.details);
        } else {
            results.test4_mongoose_cache.passed = false;
            results.test4_mongoose_cache.details = `Connection not cached properly. state1: ${state1}, state2: ${state2}`;
            console.log('❌ Requirement 4 FAILED:', results.test4_mongoose_cache.details);
        }

        // -------------------------------------------------------------
        // REQUIREMENT 1: Status moves sent -> delivered -> seen
        // with delivered step working when recipient is NOT in that chat (global poll only)
        // -------------------------------------------------------------
        console.log('\n--- Checking Requirement 1: Message status lifecycle (sent -> delivered -> seen) ---');
        
        // Alice sends a message to Bob
        const sendHttpRes = await fetch(`${baseUrl}/api/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${aliceToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationId: conversation._id.toString(),
                content: 'Hello Bob! This is message 1',
                clientMessageId: 'client-msg-' + Date.now()
            })
        });

        const sendBody = await sendHttpRes.json();
        console.log('Alice send HTTP status:', sendHttpRes.status, 'body status:', sendBody?.message?.status);
        const sentMsgId = sendBody?.message?._id;
        const initialStatus = sendBody?.message?.status;

        // Bob performs global unread count poll (recipient NOT in chat)
        console.log('Bob calls GET /api/messages/unread-count (global poll, Bob NOT in chat)...');
        const bobPollHttpRes = await fetch(`${baseUrl}/api/messages/unread-count`, {
            headers: { 'Authorization': `Bearer ${bobToken}` }
        });
        const bobPollBody = await bobPollHttpRes.json();
        console.log('Bob unread-count HTTP status:', bobPollHttpRes.status, 'response body:', bobPollBody);

        // Check message status in DB after global poll
        const msgAfterPoll = await Message.findById(sentMsgId);
        console.log('Message status in DB after Bob global poll:', msgAfterPoll?.status);

        // Now Bob opens chat and marks seen
        console.log('Bob opens chat and calls POST /api/messages/seen...');
        const seenHttpRes = await fetch(`${baseUrl}/api/messages/seen`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${bobToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationId: conversation._id.toString()
            })
        });
        const seenBody = await seenHttpRes.json();
        console.log('Bob seen HTTP status:', seenHttpRes.status, 'response body:', seenBody);

        const msgAfterSeen = await Message.findById(sentMsgId);
        console.log('Message status in DB after Bob marks seen:', msgAfterSeen?.status);

        const lifecycleSuccess = (initialStatus === 'sent') &&
                                (msgAfterPoll?.status === 'delivered') &&
                                (msgAfterSeen?.status === 'seen');

        results.test1_lifecycle.passed = lifecycleSuccess;
        results.test1_lifecycle.details = `Initial: ${initialStatus}, After global poll: ${msgAfterPoll?.status}, After seen: ${msgAfterSeen?.status}`;

        if (lifecycleSuccess) {
            console.log('✅ Requirement 1 PASSED:', results.test1_lifecycle.details);
        } else {
            console.log('❌ Requirement 1 FAILED:', results.test1_lifecycle.details);
        }

        // -------------------------------------------------------------
        // REQUIREMENT 2: Unread counts exclude user's own messages & handle legacy messages without status
        // -------------------------------------------------------------
        console.log('\n--- Checking Requirement 2: Unread counts (exclude own messages & legacy messages) ---');
        
        // 1. Check Alice's unread count (she sent the message, should be 0)
        const aliceUnreadHttpRes = await fetch(`${baseUrl}/api/messages/unread-count`, {
            headers: { 'Authorization': `Bearer ${aliceToken}` }
        });
        const aliceUnreadBody = await aliceUnreadHttpRes.json();
        console.log('Alice unread count (should exclude own sent messages):', aliceUnreadBody?.count);

        // 2. Insert a real legacy message directly into MongoDB collection with NO status field
        await Message.collection.insertOne({
            conversationId: conversation._id,
            sender: bob._id,
            text: 'Legacy message from 2024 with no status field',
            createdAt: new Date(Date.now() - 100000000)
        });

        // Query Alice's unread count now
        const aliceUnreadWithLegacyRes = await fetch(`${baseUrl}/api/messages/unread-count`, {
            headers: { 'Authorization': `Bearer ${aliceToken}` }
        });
        const aliceUnreadWithLegacy = await aliceUnreadWithLegacyRes.json();
        console.log('Alice unread count after legacy message inserted (should NOT count legacy message):', aliceUnreadWithLegacy?.count);

        // Also check conversation list unread count
        const convListHttpRes = await fetch(`${baseUrl}/api/conversations`, {
            headers: { 'Authorization': `Bearer ${aliceToken}` }
        });
        const convListBody = await convListHttpRes.json();
        const convItem = convListBody?.conversations?.find(c => c._id.toString() === conversation._id.toString());
        console.log('Alice conversation list unreadCount:', convItem?.unreadCount);

        const excludesOwn = (aliceUnreadBody?.count === 0);
        const ignoresLegacyGlobal = (aliceUnreadWithLegacy?.count === 0);
        const ignoresLegacyList = (convItem?.unreadCount === 0);

        const unreadSuccess = excludesOwn && ignoresLegacyGlobal && ignoresLegacyList;
        results.test2_unread_counts.passed = unreadSuccess;
        results.test2_unread_counts.details = `Excludes own messages: ${excludesOwn} (count=${aliceUnreadBody?.count}), Ignores legacy in global: ${ignoresLegacyGlobal} (count=${aliceUnreadWithLegacy?.count}), Ignores legacy in conv list: ${ignoresLegacyList} (count=${convItem?.unreadCount})`;

        if (unreadSuccess) {
            console.log('✅ Requirement 2 PASSED:', results.test2_unread_counts.details);
        } else {
            console.log('❌ Requirement 2 FAILED:', results.test2_unread_counts.details);
        }

        // -------------------------------------------------------------
        // REQUIREMENT 3: Server rejects marking delivered/seen for conversations user isn't part of
        // -------------------------------------------------------------
        console.log('\n--- Checking Requirement 3: Reject marking delivered/seen for non-participants ---');
        
        // Eve is NOT a participant in conversation (Alice & Bob).
        // Eve tries to mark seen on Alice & Bob's conversation
        const eveSeenHttpRes = await fetch(`${baseUrl}/api/messages/seen`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${eveToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationId: conversation._id.toString()
            })
        });
        const eveSeenBody = await eveSeenHttpRes.json();
        console.log('Eve (non-participant) POST /api/messages/seen status:', eveSeenHttpRes.status, 'body:', eveSeenBody);

        // Eve tries to mark delivered with conversationId
        const eveDeliveredHttpRes = await fetch(`${baseUrl}/api/messages/delivered`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${eveToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                conversationId: conversation._id.toString()
            })
        });
        const eveDeliveredBody = await eveDeliveredHttpRes.json();
        console.log('Eve (non-participant) POST /api/messages/delivered status:', eveDeliveredHttpRes.status, 'body:', eveDeliveredBody);

        const seenRejected = (eveSeenHttpRes.status === 403 || eveSeenHttpRes.status === 404);
        const deliveredRejected = (eveDeliveredHttpRes.status === 403 || eveDeliveredHttpRes.status === 404);

        const rejectionSuccess = seenRejected && deliveredRejected;
        results.test3_auth_rejection.passed = rejectionSuccess;
        results.test3_auth_rejection.details = `Seen rejection (expected 403/404): got ${eveSeenHttpRes.status}, Delivered rejection (expected 403/404): got ${eveDeliveredHttpRes.status}`;

        if (rejectionSuccess) {
            console.log('✅ Requirement 3 PASSED:', results.test3_auth_rejection.details);
        } else {
            console.log('❌ Requirement 3 FAILED:', results.test3_auth_rejection.details);
        }

    } catch (err) {
        console.error('Test execution error:', err);
    } finally {
        console.log('\n--- Cleaning up test records ---');
        if (alice) await Employee.deleteOne({ _id: alice._id });
        if (bob) await Employee.deleteOne({ _id: bob._id });
        if (eve) await Employee.deleteOne({ _id: eve._id });
        if (conversation) {
            await Message.deleteMany({ conversationId: conversation._id });
            await Conversation.deleteOne({ _id: conversation._id });
        }
        await new Promise((resolve) => server.close(resolve));
        console.log('Cleanup completed and test server closed.\n');
    }

    console.log('====================================================');
    console.log('FINAL REAL TEST RESULTS SUMMARY:');
    console.log(JSON.stringify(results, null, 2));
    console.log('====================================================');
    process.exit(0);
}

runTests();
