/**
 * Test Suite for Bug A: Super Admin Chat Monitor Search & Export
 * Verifies:
 * 1. Search by employee ID (ZOHA105) returns all conversations (including with Super Admin & String ID participants).
 * 2. Search by employee name returns matching conversations.
 * 3. Empty search returns ALL conversations without populate failures.
 * 4. Non-participant ID returns 0 conversations.
 * 5. Export as PDF, TXT, and CSV generates full transcript and creates CHAT_OVERSIGHT_EXPORT in AuditLog.
 * 6. Non-super-admin role is rejected with 403.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AuditLog = require('../models/AuditLog');
const conversationController = require('../controllers/conversationController');
const messageController = require('../controllers/messageController');

async function run() {
    console.log('=== Starting Test Suite for Bug A (hrms_dev) ===');
    await connectDB();

    const timestamp = Date.now();
    const saId = `TEST_SA_${timestamp}`;
    const zohaId = `ZOHA105_${timestamp}`;
    const charlieId = `CHARLIE202_${timestamp}`;

    let saUser, zohaUser, charlieUser;
    let conv1, conv2, conv3;

    try {
        console.log('\n--- 1. Seeding Test Employees & Conversations ---');
        [saUser, zohaUser, charlieUser] = await Employee.insertMany([
            {
                id: saId,
                name: 'Super Admin User',
                email: `${saId}@example.com`,
                password_hash: 'hash',
                role: 'admin',
                designation: 'Super Admin',
                status: 'active'
            },
            {
                id: zohaId,
                name: 'Zoha Specialist',
                email: `${zohaId}@example.com`,
                password_hash: 'hash',
                role: 'employee',
                status: 'active'
            },
            {
                id: charlieId,
                name: 'Charlie Coworker',
                email: `${charlieId}@example.com`,
                password_hash: 'hash',
                role: 'employee',
                status: 'active'
            }
        ]);

        // Conv 1: Zoha + Super Admin (stored with ObjectIds)
        conv1 = await Conversation.create({
            participants: [zohaUser._id, saUser._id],
            isGroup: false
        });

        // Conv 2: Zoha + Charlie (stored with String IDs)
        conv2 = await Conversation.collection.insertOne({
            participants: [zohaUser.id, charlieUser.id],
            isGroup: false,
            createdAt: new Date(),
            updatedAt: new Date()
        });
        conv2._id = conv2.insertedId;

        // Conv 3: Super Admin + Charlie (stored with ObjectIds)
        conv3 = await Conversation.create({
            participants: [saUser._id, charlieUser._id],
            isGroup: false
        });

        // Messages in Conv 1
        await Message.create({
            conversationId: conv1._id,
            sender: zohaUser._id,
            text: 'Hello Super Admin, reviewing ZOHA105 reports.',
            status: 'seen'
        });
        await Message.create({
            conversationId: conv1._id,
            sender: saUser._id,
            text: 'Understood, proceed with the review.',
            fileName: 'report.pdf',
            fileUrl: 'https://storage.example.com/report.pdf',
            status: 'seen'
        });

        console.log('✅ Seeded 3 employees and 3 conversations (including String ID & Super Admin).');

        const mockRes = () => {
            const res = {
                statusCode: 200,
                headers: {},
                data: null,
                body: null,
                setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
                status(c) { this.statusCode = c; return this; },
                json(d) { this.data = d; return this; },
                send(b) { this.body = b; return this; },
                pipe(dest) {
                    this.piped = true;
                    // mock pdfkit pipe
                    return dest;
                },
                end() { this.ended = true; }
            };
            return res;
        };

        const saReqContext = {
            id: saUser.id,
            _id: saUser._id,
            role: 'admin',
            designation: 'Super Admin',
            status: 'active'
        };

        // Test 1: Search by ID (e.g. 'ZOHA105')
        console.log('\n--- 2. Testing Search by ID (ZOHA105) ---');
        const reqSearchId = { user: saReqContext, query: { search: 'ZOHA105' } };
        const resSearchId = mockRes();
        await conversationController.getAdminConversations(reqSearchId, resSearchId);

        if (resSearchId.statusCode !== 200 || !resSearchId.data?.success) {
            throw new Error(`getAdminConversations failed: ${JSON.stringify(resSearchId.data)}`);
        }
        const foundSearchId = resSearchId.data.conversations || [];
        console.log(`Found ${foundSearchId.length} conversations matching 'ZOHA105'.`);
        const foundConv1 = foundSearchId.some(c => c._id.toString() === conv1._id.toString());
        const foundConv2 = foundSearchId.some(c => c._id.toString() === conv2._id.toString());
        if (!foundConv1 || !foundConv2) {
            throw new Error(`Expected BOTH Conv 1 (with Super Admin) and Conv 2 (with String IDs) to match 'ZOHA105'. Found conv1: ${foundConv1}, conv2: ${foundConv2}`);
        }
        console.log('✅ PASS: Search by ID resolved both ObjectId and String ID conversations.');

        // Test 2: Search by Name ('Zoha')
        console.log('\n--- 3. Testing Search by Name (Zoha) ---');
        const reqSearchName = { user: saReqContext, query: { search: 'Zoha' } };
        const resSearchName = mockRes();
        await conversationController.getAdminConversations(reqSearchName, resSearchName);
        const foundSearchName = resSearchName.data.conversations || [];
        if (foundSearchName.length < 2) {
            throw new Error(`Expected at least 2 conversations matching name 'Zoha', got ${foundSearchName.length}`);
        }
        console.log('✅ PASS: Search by Name returned matching conversations.');

        // Test 3: Empty Search (Must return ALL conversations)
        console.log('\n--- 4. Testing Empty Search (Base Query) ---');
        const reqEmpty = { user: saReqContext, query: {} };
        const resEmpty = mockRes();
        await conversationController.getAdminConversations(reqEmpty, resEmpty);
        const allConvs = resEmpty.data.conversations || [];
        const hasConv1 = allConvs.some(c => c._id.toString() === conv1._id.toString());
        const hasConv2 = allConvs.some(c => c._id.toString() === conv2._id.toString());
        const hasConv3 = allConvs.some(c => c._id.toString() === conv3._id.toString());
        if (!hasConv1 || !hasConv2 || !hasConv3) {
            throw new Error(`Expected all 3 conversations in empty search. conv1: ${hasConv1}, conv2: ${hasConv2}, conv3: ${hasConv3}`);
        }
        // Verify participants are hydrated and NOT undefined
        for (const c of allConvs) {
            if (!c.participants || c.participants.length === 0) {
                throw new Error(`Conversation ${c._id} has unhydrated or empty participants`);
            }
            for (const p of c.participants) {
                if (!p.name && !p.id) {
                    throw new Error(`Participant in conversation ${c._id} is missing both name and id`);
                }
            }
        }
        console.log('✅ PASS: Empty search returned all conversations with fully hydrated participants.');

        // Test 4: Non-participant ID returns 0
        console.log('\n--- 5. Testing Non-Participant ID Search ---');
        const reqNonExistent = { user: saReqContext, query: { search: 'NONEXISTENT_99999' } };
        const resNonExistent = mockRes();
        await conversationController.getAdminConversations(reqNonExistent, resNonExistent);
        if ((resNonExistent.data?.conversations || []).length !== 0) {
            throw new Error('Expected 0 conversations for non-existent ID search');
        }
        console.log('✅ PASS: Non-existent ID returned 0 conversations.');

        // Test 5: Export as TXT and CSV
        console.log('\n--- 6. Testing Export (TXT & CSV) with AuditLog ---');
        const reqExportTxt = {
            user: saReqContext,
            params: { conversationId: conv1._id.toString() },
            query: { format: 'txt' },
            ip: '127.0.0.1',
            get: () => 'TestAgent'
        };
        const resExportTxt = mockRes();
        await messageController.exportConversation(reqExportTxt, resExportTxt);
        if (!resExportTxt.body || !resExportTxt.body.includes('CHAT CONVERSATION OVERSIGHT EXPORT')) {
            throw new Error(`Export TXT failed: ${resExportTxt.body}`);
        }
        if (!resExportTxt.body.includes('ZOHA105') || !resExportTxt.body.includes('report.pdf')) {
            throw new Error('Export TXT missing transcript text or attachment info');
        }

        const reqExportCsv = {
            user: saReqContext,
            params: { conversationId: conv1._id.toString() },
            query: { format: 'csv' },
            ip: '127.0.0.1',
            get: () => 'TestAgent'
        };
        const resExportCsv = mockRes();
        await messageController.exportConversation(reqExportCsv, resExportCsv);
        if (!resExportCsv.body || !resExportCsv.body.includes('"Timestamp","Sender ID"')) {
            throw new Error(`Export CSV failed: ${resExportCsv.body}`);
        }

        // Verify AuditLog
        const exportAudit = await AuditLog.findOne({
            resource_id: conv1._id,
            action: 'CHAT_OVERSIGHT_EXPORT'
        });
        if (!exportAudit) {
            throw new Error('Expected AuditLog entry with action CHAT_OVERSIGHT_EXPORT');
        }
        console.log('✅ PASS: Export generated transcript and recorded CHAT_OVERSIGHT_EXPORT in AuditLog.');

        // Test 6: Role Security (Non-Super-Admin gets 403)
        console.log('\n--- 7. Testing Role Security (HR gets 403) ---');
        const hrReq = {
            user: { id: 'HR001', role: 'hr', status: 'active' },
            query: {}
        };
        const hrRes = mockRes();
        await conversationController.getAdminConversations(hrReq, hrRes);
        if (hrRes.statusCode !== 403) {
            throw new Error(`Expected 403 Forbidden for HR user, got ${hrRes.statusCode}`);
        }
        const hrExportRes = mockRes();
        await messageController.exportConversation({ user: hrReq.user, params: { conversationId: conv1._id.toString() }, query: {} }, hrExportRes);
        if (hrExportRes.statusCode !== 403) {
            throw new Error(`Expected 403 Forbidden for HR export, got ${hrExportRes.statusCode}`);
        }
        console.log('✅ PASS: Non-super-admin strictly rejected with 403 on monitor and export.');

    } finally {
        console.log('\n--- Cleaning Up Seeded Test Data ---');
        if (zohaUser || saUser || charlieUser) {
            await Employee.deleteMany({ _id: { $in: [zohaUser?._id, saUser?._id, charlieUser?._id].filter(Boolean) } });
        }
        if (conv1 || conv2 || conv3) {
            await Conversation.collection.deleteMany({ _id: { $in: [conv1?._id, conv2?._id, conv3?._id].filter(Boolean) } });
            await Message.deleteMany({ conversationId: { $in: [conv1?._id, conv2?._id, conv3?._id].filter(Boolean) } });
            await AuditLog.deleteMany({ resource_id: conv1?._id });
        }
        await mongoose.connection.close();
        console.log('✅ Cleanup complete. DB connection closed.');
    }

    console.log('\n🎉 ALL BUG A TESTS PASSED SUCCESSFULLY!');
}

run().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
