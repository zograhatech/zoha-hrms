/**
 * Regression Test Suite: Normal (Non-Admin) Chat with Mixed Participants
 * 
 * Verifies:
 * 1. Conversation list retrieval for non-admin employees (only participant conversations).
 * 2. Creating 1-on-1 conversations (stored consistently as BSON ObjectIds, no duplicates).
 * 3. Sending messages (participant access control, lastMessage update, idempotency).
 * 4. Unread counts (accurate per recipient, 0 for sender).
 * 5. Mark delivered (status transitions to 'delivered', deliveredTo updated).
 * 6. Mark seen (status transitions to 'seen', unreadCount resets to 0).
 * 7. Group chats (stored consistently as ObjectIds, groupAdmin, independent unread counts).
 * 8. Dev-only normalization script (production guard, dry-run report, execution to ObjectIds).
 * 
 * Strict Guard: Uses MongoMemoryServer exclusively. NO hrms_db writes.
 */

process.env.NODE_ENV = 'test';
process.env.VERCEL = '1';
process.env.JWT_SECRET = 'test_jwt_secret_chat_regression_12345';
process.env.JWT_REFRESH_SECRET = 'test_jwt_refresh_secret_chat_regression_12345';
process.env.DB_NAME = 'hrms_test_inmemory';
process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/in_memory_guard';

const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const conversationController = require('../controllers/conversationController');
const messageController = require('../controllers/messageController');
const { normalizeParticipants, assertNotProduction, isBsonObjectId } = require('../scripts/normalize_conversation_participants');

let mongoServer;
let empA, empB, empC;

// Helper to mock Express req & res
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
        setHeader: jest.fn(),
        status: jest.fn(code => {
            statusCode = code;
            return res;
        }),
        json: jest.fn(data => {
            responseData = data;
            return res;
        }),
        getStatusCode: () => statusCode,
        getData: () => responseData
    };

    return { req, res };
}

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    process.env.MONGO_URI = uri;

    // Strict guard: verify test runner is strictly connected to local in-memory instance
    if (!uri.includes('127.0.0.1') && !uri.includes('localhost')) {
        throw new Error('FATAL: Test suite attempted to connect to a non-in-memory database!');
    }

    await mongoose.connect(uri, { dbName: 'hrms_chat_test' });

    // Seed 3 non-admin employees
    [empA, empB, empC] = await Employee.insertMany([
        {
            id: 'ALICE001',
            employee_id: 'ALICE001',
            name: 'Alice Employee',
            email: 'alice@example.com',
            role: 'employee',
            status: 'active'
        },
        {
            id: 'BOB002',
            employee_id: 'BOB002',
            name: 'Bob Employee',
            email: 'bob@example.com',
            role: 'employee',
            status: 'active'
        },
        {
            id: 'CHARLIE003',
            employee_id: 'CHARLIE003',
            name: 'Charlie Employee',
            email: 'charlie@example.com',
            role: 'employee',
            status: 'active'
        }
    ]);
});

afterAll(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
        await mongoServer.stop();
    }
});

describe('Normal (Non-Admin) Chat Regression Tests with Mixed Participants', () => {

    let convABId;

    test('1. Creating a 1-on-1 conversation stores participants consistently as BSON ObjectIds', async () => {
        const { req, res } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { recipientId: empB.id } // Pass recipient by string employee ID
        });

        await conversationController.createConversation(req, res);
        expect(res.getStatusCode()).toBe(201);
        const data = res.getData();
        expect(data.success).toBe(true);
        expect(data.conversation).toBeDefined();
        convABId = data.conversation._id;

        // Verify in raw MongoDB collection that participants are stored strictly as BSON ObjectIds
        const rawConv = await Conversation.collection.findOne({ _id: convABId });
        expect(rawConv.isGroup).toBe(false);
        expect(rawConv.participants).toHaveLength(2);
        for (const p of rawConv.participants) {
            expect(isBsonObjectId(p)).toBe(true);
            expect(typeof p).toBe('object');
        }
        expect(rawConv.participants.map(p => p.toString())).toEqual(
            expect.arrayContaining([empA._id.toString(), empB._id.toString()])
        );

        // Idempotency: Calling createConversation again with recipient._id returns existing conversation
        const { req: req2, res: res2 } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { recipientId: empB._id.toString() }
        });
        await conversationController.createConversation(req2, res2);
        expect(res2.getStatusCode()).toBe(200);
        expect(res2.getData().conversation._id.toString()).toBe(convABId.toString());

        // Verify no duplicate conversation was created in DB
        const count = await Conversation.countDocuments({ isGroup: false });
        expect(count).toBe(1);
    });

    test('2. Conversation list returns only caller conversations with populated participants', async () => {
        // Alice calls getConversations -> should see convAB
        const { req: reqA, res: resA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' }
        });
        await conversationController.getConversations(reqA, resA);
        expect(resA.getStatusCode()).toBe(200);
        const convsA = resA.getData().conversations;
        expect(convsA).toHaveLength(1);
        expect(convsA[0]._id.toString()).toBe(convABId.toString());
        expect(convsA[0].participants[0]).toHaveProperty('name');
        expect(convsA[0].participants[0]).toHaveProperty('email');

        // Charlie (not a participant) calls getConversations -> should see 0 conversations
        const { req: reqC, res: resC } = mockReqRes({
            user: { _id: empC._id, id: empC.id, role: 'employee' }
        });
        await conversationController.getConversations(reqC, resC);
        expect(resC.getStatusCode()).toBe(200);
        expect(resC.getData().conversations).toHaveLength(0);
    });

    test('3. Sending messages enforces participant check and updates conversation lastMessage', async () => {
        // Non-participant Charlie attempts to send message -> 403 Forbidden
        const { req: reqFail, res: resFail } = mockReqRes({
            user: { _id: empC._id, id: empC.id, role: 'employee' },
            body: { conversationId: convABId.toString(), text: 'Intruder message' }
        });
        await messageController.sendMessage(reqFail, resFail);
        expect(resFail.getStatusCode()).toBe(403);

        // Alice sends message 1
        const { req: req1, res: res1 } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: convABId.toString(), text: 'Hello Bob! Message 1' }
        });
        await messageController.sendMessage(req1, res1);
        expect(res1.getStatusCode()).toBe(200);
        const msg1 = res1.getData().message;
        expect(msg1.text).toBe('Hello Bob! Message 1');
        expect(msg1.status).toBe('sent');
        expect(msg1.sender.name).toBe('Alice Employee');

        // Verify conversation lastMessage is updated
        const updatedConv = await Conversation.findById(convABId);
        expect(updatedConv.lastMessage.toString()).toBe(msg1._id.toString());

        // Alice sends message 2
        const { req: req2, res: res2 } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: convABId.toString(), text: 'Message 2 from Alice' }
        });
        await messageController.sendMessage(req2, res2);
        expect(res2.getStatusCode()).toBe(200);
    });

    test('4. Unread counts are calculated accurately (2 unread for recipient, 0 for sender)', async () => {
        // Bob's perspective (recipient)
        const { req: reqB, res: resB } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' }
        });
        await conversationController.getConversations(reqB, resB);
        expect(resB.getStatusCode()).toBe(200);
        const convsB = resB.getData().conversations;
        expect(convsB).toHaveLength(1);
        expect(convsB[0].unreadCount).toBe(2);

        // Alice's perspective (sender) -> unreadCount should be 0
        const { req: reqA, res: resA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' }
        });
        await conversationController.getConversations(reqA, resA);
        expect(resA.getStatusCode()).toBe(200);
        expect(resA.getData().conversations[0].unreadCount).toBe(0);
    });

    test('5. Marking messages delivered updates status to delivered and preserves unread count', async () => {
        const { req, res } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: convABId.toString() }
        });
        await messageController.markDelivered(req, res);
        expect(res.getStatusCode()).toBe(200);
        expect(res.getData().modifiedCount).toBe(2);

        // Verify status in DB is now 'delivered'
        const messages = await Message.find({ conversationId: convABId });
        expect(messages).toHaveLength(2);
        for (const m of messages) {
            expect(m.status).toBe('delivered');
            expect(m.deliveredTo.map(d => d.toString())).toContain(empB._id.toString());
        }

        // Delivered messages are still unread until seen
        const { req: reqB, res: resB } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' }
        });
        await conversationController.getConversations(reqB, resB);
        expect(resB.getData().conversations[0].unreadCount).toBe(2);
    });

    test('6. Marking messages seen updates status to seen and resets unread count to 0', async () => {
        const { req, res } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: convABId.toString() }
        });
        await messageController.markSeen(req, res);
        expect(res.getStatusCode()).toBe(200);

        // Verify status in DB is now 'seen'
        const messages = await Message.find({ conversationId: convABId });
        for (const m of messages) {
            expect(m.status).toBe('seen');
            expect(m.seenBy.some(s => s.employee.toString() === empB._id.toString())).toBe(true);
        }

        // Bob's unread count should now be 0
        const { req: reqB, res: resB } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' }
        });
        await conversationController.getConversations(reqB, resB);
        expect(resB.getData().conversations[0].unreadCount).toBe(0);
    });

    test('7. Group chats: creating, sending messages, and per-user unread/seen states', async () => {
        // Alice creates group chat with Bob and Charlie (passing a mix of string id and ObjectId)
        const { req: reqGroup, res: resGroup } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: {
                groupName: 'Engineering Sprint Team',
                participants: [empB.id, empC._id.toString()]
            }
        });
        await conversationController.createGroup(reqGroup, resGroup);
        expect(resGroup.getStatusCode()).toBe(200);
        const groupConv = resGroup.getData().conversation;
        expect(groupConv.isGroup).toBe(true);
        expect(groupConv.groupName).toBe('Engineering Sprint Team');
        expect(groupConv.groupAdmin.toString()).toBe(empA._id.toString());

        // Check raw DB record: all 3 participants must be BSON ObjectIds
        const rawGroup = await Conversation.collection.findOne({ _id: groupConv._id });
        expect(rawGroup.participants).toHaveLength(3);
        for (const p of rawGroup.participants) {
            expect(isBsonObjectId(p)).toBe(true);
        }

        // Bob sends a message in the group chat
        const { req: reqMsg, res: resMsg } = mockReqRes({
            user: { _id: empB._id, id: empB.id, role: 'employee' },
            body: { conversationId: groupConv._id.toString(), text: 'Hey team, sprint starts now!' }
        });
        await messageController.sendMessage(reqMsg, resMsg);
        expect(resMsg.getStatusCode()).toBe(200);

        // Check unread counts: Alice and Charlie have 1 unread; Bob has 0
        const { req: reqA, res: resA } = mockReqRes({ user: { _id: empA._id, id: empA.id, role: 'employee' } });
        await conversationController.getConversations(reqA, resA);
        const groupForA = resA.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        expect(groupForA.unreadCount).toBe(1);

        const { req: reqC, res: resC } = mockReqRes({ user: { _id: empC._id, id: empC.id, role: 'employee' } });
        await conversationController.getConversations(reqC, resC);
        const groupForC = resC.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        expect(groupForC.unreadCount).toBe(1);

        const { req: reqB, res: resB } = mockReqRes({ user: { _id: empB._id, id: empB.id, role: 'employee' } });
        await conversationController.getConversations(reqB, resB);
        const groupForB = resB.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        expect(groupForB.unreadCount).toBe(0);

        // Alice marks seen in group
        const { req: reqSeenA, res: resSeenA } = mockReqRes({
            user: { _id: empA._id, id: empA.id, role: 'employee' },
            body: { conversationId: groupConv._id.toString() }
        });
        await messageController.markSeen(reqSeenA, resSeenA);
        expect(resSeenA.getStatusCode()).toBe(200);

        // Now Alice's unread is 0, while Charlie's unread is STILL 1
        const { req: reqAAfter, res: resAAfter } = mockReqRes({ user: { _id: empA._id, id: empA.id, role: 'employee' } });
        await conversationController.getConversations(reqAAfter, resAAfter);
        const groupForAAfter = resAAfter.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        expect(groupForAAfter.unreadCount).toBe(0);

        const { req: reqCAfter, res: resCAfter } = mockReqRes({ user: { _id: empC._id, id: empC.id, role: 'employee' } });
        await conversationController.getConversations(reqCAfter, resCAfter);
        const groupForCAfter = resCAfter.getData().conversations.find(c => c._id.toString() === groupConv._id.toString());
        expect(groupForCAfter.unreadCount).toBe(1);
    });

    test('8. Dev-only normalization script guards production, performs dry-run by default, and normalizes strings to ObjectIds', async () => {
        // A. Production Guard Check
        expect(() => {
            assertNotProduction('hrms_db', 'mongodb+srv://user:pass@cluster.mongodb.net/hrms_db');
        }).toThrow(/Refusing to run dev normalization script on production database/);

        // B. Seed conversations containing string participants (legacy hex string & employee codes)
        const legacyConv1 = await Conversation.collection.insertOne({
            participants: [empA._id.toString(), empB._id.toString()], // Hex strings
            isGroup: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        const legacyConv2 = await Conversation.collection.insertOne({
            participants: ['ALICE001', 'CHARLIE003'], // Employee code strings
            isGroup: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // C. Dry-Run by default
        const dryRunStats = await normalizeParticipants({ dryRun: true, connection: mongoose.connection });
        expect(dryRunStats.conversationsWithStrings).toBeGreaterThanOrEqual(2);
        expect(dryRunStats.updatedConversationsCount).toBe(0); // Dry run must NOT write

        // Verify records in DB were NOT modified during dry-run
        const checkAfterDryRun = await Conversation.collection.findOne({ _id: legacyConv1.insertedId });
        expect(typeof checkAfterDryRun.participants[0]).toBe('string');

        // D. Execution mode (--execute / dryRun: false)
        const execStats = await normalizeParticipants({ dryRun: false, connection: mongoose.connection });
        expect(execStats.updatedConversationsCount).toBeGreaterThanOrEqual(2);

        // E. Verify DB records now contain strictly BSON ObjectIds
        const checkAfterExec1 = await Conversation.collection.findOne({ _id: legacyConv1.insertedId });
        expect(checkAfterExec1.participants).toHaveLength(2);
        for (const p of checkAfterExec1.participants) {
            expect(isBsonObjectId(p)).toBe(true);
        }

        const checkAfterExec2 = await Conversation.collection.findOne({ _id: legacyConv2.insertedId });
        expect(checkAfterExec2.participants).toHaveLength(2);
        for (const p of checkAfterExec2.participants) {
            expect(isBsonObjectId(p)).toBe(true);
        }
        expect(checkAfterExec2.participants.map(p => p.toString())).toEqual(
            expect.arrayContaining([empA._id.toString(), empC._id.toString()])
        );
    });
});
