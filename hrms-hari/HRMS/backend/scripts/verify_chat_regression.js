/**
 * Regression Test Suite: Normal (Non-Admin) Chat with Mixed Participants
 * 
 * Verifies:
 * 1. Conversation list for normal (non-admin) employees.
 * 2. Creating conversation (stored consistently as BSON ObjectId).
 * 3. Sending messages (participant access control, lastMessage, idempotency).
 * 4. Unread counts (accurate for recipient, 0 for sender).
 * 5. Mark delivered (status transitions to delivered, preserves unread).
 * 6. Mark seen (status transitions to seen, resets unread to 0).
 * 7. Group chats (groupAdmin, ObjectIds, independent unread tracking).
 * 8. Dev-only normalization script (production guard, dry-run, execution).
 * 
 * STRICT SAFETY: Connects exclusively to DB_NAME=hrms_dev. NEVER writes to hrms_db.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const conversationController = require('../controllers/conversationController');
const messageController = require('../controllers/messageController');
const { normalizeParticipants, assertNotProduction, isBsonObjectId } = require('./normalize_conversation_participants');

function mockReqRes(reqData = {}) {
    const req = {
        user: reqData.user || null,
        body: reqData.body || {},
        params: reqData.params || {},
        query: reqData.query || {},
        headers: reqData.headers || {},
        get: () => '',
        ...reqData
    };

    let statusCode = 200;
    let responseData = null;
    const res = {
        setHeader: () => {},
        status: (code) => {
            statusCode = code;
            return res;
        },
        json: (data) => {
            responseData = data;
            return res;
        },
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

async function run() {
    console.log('=== Starting Normal Chat Regression Test Suite (hrms_dev) ===');
    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('FATAL: DB_NAME must be hrms_dev. Aborting to protect production.');
    }

    await connectDB();
    console.log(`Connected to database: ${mongoose.connection.name}`);
    if (mongoose.connection.name !== 'hrms_dev') {
        throw new Error(`ABORT: Connected database is "${mongoose.connection.name}", but must be strictly "hrms_dev"!`);
    }

    const timestamp = Date.now();
    const idA = `TEST_REG_A_${timestamp}`;
    const idB = `TEST_REG_B_${timestamp}`;
    const idC = `TEST_REG_C_${timestamp}`;

    let empA, empB, empC;
    const createdConvIds = [];
    const createdMsgIds = [];

    try {
        console.log('\n--- 1. Seeding Test Non-Admin Employees ---');
        [empA, empB, empC] = await Employee.insertMany([
            {
                id: idA,
                employee_id: idA,
                name: 'Alice Regression',
                email: `${idA}@example.com`,
                password_hash: 'dummy_hash_for_test',
                role: 'employee',
                status: 'active'
            },
            {
                id: idB,
                employee_id: idB,
                name: 'Bob Regression',
                email: `${idB}@example.com`,
                password_hash: 'dummy_hash_for_test',
                role: 'employee',
                status: 'active'
            },
            {
                id: idC,
                employee_id: idC,
                name: 'Charlie NonParticipant',
                email: `${idC}@example.com`,
                password_hash: 'dummy_hash_for_test',
                role: 'employee',
                status: 'active'
            }
        ]);
        console.log(`[PASS] Seeded employees: ${idA}, ${idB}, ${idC}`);

        console.log('\n--- 2. Test Creating Conversation (Stored Consistently as BSON ObjectId) ---');
        const { req: reqCreate, res: resCreate } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { recipientId: empB.id } // Pass recipient by employee code string
        });
        await conversationController.createConversation(reqCreate, resCreate);
        if (resCreate.getStatusCode() !== 201) {
            throw new Error(`createConversation failed with status ${resCreate.getStatusCode()}: ${JSON.stringify(resCreate.getData())}`);
        }
        const conv1 = resCreate.getData().conversation;
        createdConvIds.push(conv1._id);

        // Verify in raw collection that participants are stored strictly as BSON ObjectIds
        const rawConv1 = await Conversation.collection.findOne({ _id: conv1._id });
        if (!rawConv1 || rawConv1.participants.length !== 2) {
            throw new Error('Conversation was not created with 2 participants');
        }
        for (const p of rawConv1.participants) {
            if (!isBsonObjectId(p)) {
                throw new Error(`Participant is NOT a BSON ObjectId: ${typeof p} (${p})`);
            }
        }
        console.log('[PASS] Conversation created with participants stored consistently as BSON ObjectIds.');

        // Verify Idempotency: create again returns existing conversation
        const { req: reqDup, res: resDup } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { recipientId: empB._id.toString() }
        });
        await conversationController.createConversation(reqDup, resDup);
        if (resDup.getStatusCode() !== 200 || resDup.getData().conversation._id.toString() !== conv1._id.toString()) {
            throw new Error('Calling createConversation again did not return existing conversation');
        }
        console.log('[PASS] Idempotency verified: existing conversation returned without duplicate creation.');

        console.log('\n--- 3. Test Conversation List (getConversations) ---');
        const { req: reqListA, res: resListA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' }
        });
        await conversationController.getConversations(reqListA, resListA);
        const listA = resListA.getData().conversations.filter(c => c._id.toString() === conv1._id.toString());
        if (listA.length !== 1) {
            throw new Error('Alice cannot find the conversation in her conversation list');
        }
        if (!listA[0].participants[0].name || !listA[0].participants[0].email) {
            throw new Error('Conversation participants were not properly populated/hydrated');
        }

        // Charlie (non-participant) should NOT see this conversation
        const { req: reqListC, res: resListC } = mockReqRes({
            user: { _id: empC._id, id: empC.id, role: 'employee' }
        });
        await conversationController.getConversations(reqListC, resListC);
        const listC = resListC.getData().conversations.filter(c => c._id.toString() === conv1._id.toString());
        if (listC.length !== 0) {
            throw new Error('Non-participant Charlie can see the conversation!');
        }
        console.log('[PASS] Conversation list returns populated conversations only to participants.');

        console.log('\n--- 4. Test Sending Messages & Access Control ---');
        // Non-participant Charlie tries to send message -> 403
        const { req: reqMsgFail, res: resMsgFail } = mockReqRes({
            user: { _id: empC._id, id: empC.id, role: 'employee' },
            body: { conversationId: conv1._id.toString(), text: 'Intruder' }
        });
        await messageController.sendMessage(reqMsgFail, resMsgFail);
        if (resMsgFail.getStatusCode() !== 403) {
            throw new Error(`Expected 403 for non-participant sending message, got ${resMsgFail.getStatusCode()}`);
        }
        console.log('[PASS] Non-participant correctly rejected with 403 on sendMessage.');

        // Alice sends message 1
        const { req: reqMsg1, res: resMsg1 } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: conv1._id.toString(), text: 'Hello Bob! Message 1' }
        });
        await messageController.sendMessage(reqMsg1, resMsg1);
        if (resMsg1.getStatusCode() !== 200) {
            throw new Error(`sendMessage failed: ${JSON.stringify(resMsg1.getData())}`);
        }
        const msg1 = resMsg1.getData().message;
        createdMsgIds.push(msg1._id);

        // Verify conversation lastMessage is updated
        const checkConv = await Conversation.findById(conv1._id);
        if (checkConv.lastMessage.toString() !== msg1._id.toString()) {
            throw new Error('Conversation.lastMessage was not updated');
        }

        // Alice sends message 2
        const { req: reqMsg2, res: resMsg2 } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: conv1._id.toString(), text: 'Message 2 from Alice' }
        });
        await messageController.sendMessage(reqMsg2, resMsg2);
        createdMsgIds.push(resMsg2.getData().message._id);
        console.log('[PASS] Messages sent successfully and conversation lastMessage updated.');

        console.log('\n--- 5. Test Unread Counts ---');
        // Bob's perspective (recipient): should have 2 unread messages
        const { req: reqUB, res: resUB } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' }
        });
        await conversationController.getConversations(reqUB, resUB);
        const convForB = resUB.getData().conversations.find(c => c._id.toString() === conv1._id.toString());
        if (!convForB || convForB.unreadCount !== 2) {
            throw new Error(`Expected Bob's unreadCount to be 2, got ${convForB?.unreadCount}`);
        }

        // Alice's perspective (sender): should have 0 unread messages
        const { req: reqUA, res: resUA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' }
        });
        await conversationController.getConversations(reqUA, resUA);
        const convForA = resUA.getData().conversations.find(c => c._id.toString() === conv1._id.toString());
        if (!convForA || convForA.unreadCount !== 0) {
            throw new Error(`Expected Alice's unreadCount to be 0, got ${convForA?.unreadCount}`);
        }
        console.log('[PASS] Unread counts verified: recipient=2, sender=0.');

        console.log('\n--- 6. Test Mark Delivered ---');
        const { req: reqDeliv, res: resDeliv } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: conv1._id.toString() }
        });
        await messageController.markDelivered(reqDeliv, resDeliv);
        if (resDeliv.getStatusCode() !== 200 || resDeliv.getData().modifiedCount !== 2) {
            throw new Error(`markDelivered failed: modifiedCount=${resDeliv.getData()?.modifiedCount}`);
        }

        // Verify status in DB is now 'delivered'
        const msgsDeliv = await Message.find({ conversationId: conv1._id });
        for (const m of msgsDeliv) {
            if (m.status !== 'delivered' || !m.deliveredTo.some(d => d.toString() === empB._id.toString())) {
                throw new Error(`Message ${m._id} status was not updated to delivered`);
            }
        }

        // Delivered messages are still unread until seen
        await conversationController.getConversations(reqUB, resUB);
        const convForBDeliv = resUB.getData().conversations.find(c => c._id.toString() === conv1._id.toString());
        if (convForBDeliv.unreadCount !== 2) {
            throw new Error(`Expected unreadCount=2 after delivery, got ${convForBDeliv.unreadCount}`);
        }
        console.log('[PASS] Messages successfully marked delivered with unread count retained.');

        console.log('\n--- 7. Test Mark Seen ---');
        const { req: reqSeen, res: resSeen } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: conv1._id.toString() }
        });
        await messageController.markSeen(reqSeen, resSeen);
        if (resSeen.getStatusCode() !== 200) {
            throw new Error(`markSeen failed: ${JSON.stringify(resSeen.getData())}`);
        }

        // Verify status in DB is now 'seen'
        const msgsSeen = await Message.find({ conversationId: conv1._id });
        for (const m of msgsSeen) {
            if (m.status !== 'seen' || !m.seenBy.some(s => s.employee.toString() === empB._id.toString())) {
                throw new Error(`Message ${m._id} status was not updated to seen`);
            }
        }

        // Bob's unreadCount must now be 0
        await conversationController.getConversations(reqUB, resUB);
        const convForBSeen = resUB.getData().conversations.find(c => c._id.toString() === conv1._id.toString());
        if (convForBSeen.unreadCount !== 0) {
            throw new Error(`Expected Bob's unreadCount to be 0 after seen, got ${convForBSeen.unreadCount}`);
        }
        console.log('[PASS] Messages marked seen and unreadCount reset to 0.');

        console.log('\n--- 8. Test Group Chats (Stored as ObjectIds & Independent Unread) ---');
        const { req: reqGroup, res: resGroup } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: {
                groupName: 'Engineering Alpha Team',
                participants: [empB.id, empC._id.toString()]
            }
        });
        await conversationController.createGroup(reqGroup, resGroup);
        if (resGroup.getStatusCode() !== 200) {
            throw new Error(`createGroup failed: ${JSON.stringify(resGroup.getData())}`);
        }
        const groupConv = resGroup.getData().conversation;
        createdConvIds.push(groupConv._id);

        if (!groupConv.isGroup || groupConv.groupAdmin.toString() !== empA._id.toString()) {
            throw new Error('Group properties mismatch');
        }

        // Verify raw participants are strictly BSON ObjectIds
        const rawGroup = await Conversation.collection.findOne({ _id: groupConv._id });
        if (rawGroup.participants.length !== 3) {
            throw new Error(`Expected 3 participants in group, got ${rawGroup.participants.length}`);
        }
        for (const p of rawGroup.participants) {
            if (!isBsonObjectId(p)) {
                throw new Error(`Group participant is NOT BSON ObjectId: ${typeof p} (${p})`);
            }
        }
        console.log('[PASS] Group chat created with participants stored consistently as BSON ObjectIds.');

        // Bob sends a message to the group
        const { req: reqGroupMsg, res: resGroupMsg } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: groupConv._id.toString(), text: 'Group announcement' }
        });
        await messageController.sendMessage(reqGroupMsg, resGroupMsg);
        createdMsgIds.push(resGroupMsg.getData().message._id);

        // Alice and Charlie should each have 1 unread message in the group
        const { req: reqGUA, res: resGUA } = mockReqRes({ user: { _id: empA._id, id: empA.id, role: 'employee' } });
        await conversationController.getConversations(reqGUA, resGUA);
        const gA = resGUA.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        if (gA.unreadCount !== 1) throw new Error(`Expected Alice group unread=1, got ${gA.unreadCount}`);

        const { req: reqGUC, res: resGUC } = mockReqRes({ user: { _id: empC._id, id: empC.id, role: 'employee' } });
        await conversationController.getConversations(reqGUC, resGUC);
        const gC = resGUC.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        if (gC.unreadCount !== 1) throw new Error(`Expected Charlie group unread=1, got ${gC.unreadCount}`);

        // Alice marks seen in group
        const { req: reqGSeenA, res: resGSeenA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: groupConv._id.toString() }
        });
        await messageController.markSeen(reqGSeenA, resGSeenA);

        // Alice unread should become 0; Charlie unread must STILL be 1
        await conversationController.getConversations(reqGUA, resGUA);
        const gAAfter = resGUA.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        if (gAAfter.unreadCount !== 0) throw new Error(`Expected Alice group unread=0 after seen, got ${gAAfter.unreadCount}`);

        await conversationController.getConversations(reqGUC, resGUC);
        const gCAfter = resGUC.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        if (gCAfter.unreadCount !== 1) throw new Error(`Expected Charlie group unread=1, got ${gCAfter.unreadCount}`);
        console.log('[PASS] Group chat unread counts and seen tracking verified independently per participant.');

        console.log('\n--- 9. Test Dev-Only Normalization Script ---');
        // A. Production Guard
        try {
            assertNotProduction('hrms_db', 'mongodb+srv://user:pass@cluster.mongodb.net/hrms_db');
            throw new Error('assertNotProduction failed to block production db');
        } catch (guardErr) {
            if (!guardErr.message.includes('Refusing to run dev normalization script on production database')) {
                throw guardErr;
            }
            console.log('[PASS] Production guard verified: refused to run on production database.');
        }

        // A2. Production Read-only Dry-Run Flag Check
        // Should permit dry-run with warning
        assertNotProduction('hrms_db', 'mongodb+srv://user:pass@cluster.mongodb.net/hrms_db', { allowProdReadonly: true, dryRun: true });
        console.log('[PASS] Production guard permits read-only dry run with --allow-prod-readonly.');

        // Should strictly throw if execute is attempted with allowProdReadonly
        try {
            assertNotProduction('hrms_db', 'mongodb+srv://user:pass@cluster.mongodb.net/hrms_db', { allowProdReadonly: true, dryRun: false });
            throw new Error('assertNotProduction failed to block execution with allowProdReadonly');
        } catch (guardErr) {
            if (!guardErr.message.includes('--allow-prod-readonly strictly permits READ-ONLY analysis')) {
                throw guardErr;
            }
            console.log('[PASS] Production guard strictly blocked DB writes with --allow-prod-readonly.');
        }

        // B. Seed legacy string conversations in dev DB
        const legacy1 = await Conversation.collection.insertOne({
            participants: [empA._id.toString(), empB._id.toString()], // Hex strings
            isGroup: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        createdConvIds.push(legacy1.insertedId);

        const legacy2 = await Conversation.collection.insertOne({
            participants: [empA.id, empC.id], // Employee code strings
            isGroup: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        createdConvIds.push(legacy2.insertedId);

        // C. Dry-run mode: should report statistics but NOT write
        const dryRunStats = await normalizeParticipants({ dryRun: true, connection: mongoose.connection });
        if (dryRunStats.conversationsWithStrings < 2 || dryRunStats.updatedConversationsCount !== 0) {
            throw new Error('Dry run failed: modified database or failed to detect string participants');
        }
        const verifyDry = await Conversation.collection.findOne({ _id: legacy1.insertedId });
        if (typeof verifyDry.participants[0] !== 'string') {
            throw new Error('Dry run mutated the database!');
        }
        console.log('[PASS] Dry run verified: reported string conversations with 0 writes.');

        // D. Execute mode: normalizes to BSON ObjectIds
        const execStats = await normalizeParticipants({ dryRun: false, connection: mongoose.connection });
        if (execStats.updatedConversationsCount < 2) {
            throw new Error('Execute mode failed to normalize conversations');
        }

        const verifyExec1 = await Conversation.collection.findOne({ _id: legacy1.insertedId });
        for (const p of verifyExec1.participants) {
            if (!isBsonObjectId(p)) throw new Error('Legacy 1 participant is not ObjectId after execute');
        }

        const verifyExec2 = await Conversation.collection.findOne({ _id: legacy2.insertedId });
        for (const p of verifyExec2.participants) {
            if (!isBsonObjectId(p)) throw new Error('Legacy 2 participant is not ObjectId after execute');
        }
        console.log('[PASS] Normalization script successfully converted string participants to ObjectIds in dev DB.');

        console.log('\n===============================================================');
        console.log('✅ ALL REGRESSION TESTS PASSED FOR NORMAL CHAT & NORMALIZATION SCRIPT');
        console.log('===============================================================\n');

    } finally {
        console.log('Cleaning up test data in hrms_dev...');
        if (createdMsgIds.length > 0) {
            await Message.deleteMany({ _id: { $in: createdMsgIds } });
        }
        if (createdConvIds.length > 0) {
            await Conversation.deleteMany({ _id: { $in: createdConvIds } });
        }
        if (empA?._id || empB?._id || empC?._id) {
            await Employee.deleteMany({ _id: { $in: [empA?._id, empB?._id, empC?._id].filter(Boolean) } });
        }
        await mongoose.disconnect();
        console.log('Cleanup complete and disconnected.');
    }
}

run().catch(err => {
    console.error('\n❌ REGRESSION TEST FAILED:', err);
    process.exit(1);
});
