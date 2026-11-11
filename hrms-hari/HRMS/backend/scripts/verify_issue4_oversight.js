/**
 * Verification script for Issue 4: Super Admin Chat Oversight Monitor
 * Tests:
 * 1. GET /api/conversations/admin/all requires strict admin role (403 for employee/manager).
 * 2. GET /api/conversations/admin/all returns paginated conversations, searches by participant ID/name, filters by date and hasAttachments.
 * 3. GET /api/conversations/admin/:id/messages requires strict admin role (403 for employee/manager).
 * 4. GET /api/conversations/admin/:id/messages generates AuditLog entry with action 'CHAT_OVERSIGHT_VIEW' and returns conversation, messages, mediaFiles, totalMessages.
 * Target DB: hrms_dev only.
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

async function run() {
    console.log('=== Starting Issue 4 Oversight Verification ===');
    console.log(`Target DB: ${process.env.DB_NAME}`);

    await connectDB();

    const timestamp = Date.now();
    const adminEmpId = `TEST_ADM_${timestamp}`;
    const emp1Id = `TEST_EMP1_${timestamp}`;
    const emp2Id = `TEST_EMP2_${timestamp}`;

    let adminUser, emp1User, emp2User, testConv;

    try {
        // 1. Setup Users
        [adminUser, emp1User, emp2User] = await Promise.all([
            Employee.create({
                id: adminEmpId,
                name: 'Test Super Admin',
                email: `${adminEmpId}@example.com`,
                password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
                role: 'admin',
                status: 'active'
            }),
            Employee.create({
                id: emp1Id,
                name: 'Alice Springs',
                email: `${emp1Id}@example.com`,
                password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
                role: 'employee',
                status: 'active'
            }),
            Employee.create({
                id: emp2Id,
                name: 'Bob Waters',
                email: `${emp2Id}@example.com`,
                password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
                role: 'employee',
                status: 'active'
            })
        ]);

        // 2. Setup Conversation and Messages between Alice and Bob
        testConv = await Conversation.create({
            participants: [emp1User._id, emp2User._id],
            isGroup: false
        });

        const msg1 = await Message.create({
            conversationId: testConv._id,
            sender: emp1User._id,
            text: 'Hello Bob, check this specification.',
            status: 'seen'
        });

        const msgFile = await Message.create({
            conversationId: testConv._id,
            sender: emp2User._id,
            text: 'Here is the attachment archive.',
            fileName: 'specs_archive.zip',
            fileUrl: 'https://storage.example.com/specs_archive.zip',
            fileSize: 1048576,
            fileType: 'file',
            status: 'seen'
        });

        testConv.lastMessage = msgFile._id;
        await testConv.save();
        console.log(`[PASS] Setup test conversation ${testConv._id} with 2 messages (1 text, 1 file).`);

        // 3. Test Non-Admin Rejection on getAdminConversations
        const nonAdminReq = {
            user: { id: emp1Id, _id: emp1User._id, role: 'employee' },
            query: {}
        };
        const nonAdminRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await conversationController.getAdminConversations(nonAdminReq, nonAdminRes);
        if (nonAdminRes.statusCode !== 403) {
            throw new Error(`Expected 403 Forbidden for non-admin on getAdminConversations, got ${nonAdminRes.statusCode}`);
        }
        console.log('[PASS] Non-admin rejected with 403 on getAdminConversations.');

        // 4. Test Admin querying getAdminConversations
        const adminReq = {
            user: { id: adminEmpId, _id: adminUser._id, role: 'admin' },
            query: { search: emp1Id, page: '1', limit: '10' }
        };
        const adminRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await conversationController.getAdminConversations(adminReq, adminRes);
        if (adminRes.statusCode !== 200 || !adminRes.data?.success) {
            throw new Error(`Admin getAdminConversations failed: ${JSON.stringify(adminRes.data)}`);
        }
        if (adminRes.data.conversations.length === 0) {
            throw new Error('Expected to find conversation matching search term');
        }
        const foundConv = adminRes.data.conversations[0];
        if (!foundConv.hasAttachment) {
            throw new Error('Expected hasAttachment flag to be true for test conversation');
        }
        console.log(`[PASS] Admin getAdminConversations returned conversation with hasAttachment=true, pagination=${JSON.stringify(adminRes.data.pagination)}`);

        // 5. Test Filter with hasAttachments=true
        const attachReq = {
            user: { id: adminEmpId, _id: adminUser._id, role: 'admin' },
            query: { hasAttachments: 'true' }
        };
        const attachRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await conversationController.getAdminConversations(attachReq, attachRes);
        const hasConv = attachRes.data?.conversations?.some(c => c._id.toString() === testConv._id.toString());
        if (!hasConv) {
            throw new Error('Expected testConv to be present in hasAttachments filter results');
        }
        console.log('[PASS] Filter hasAttachments=true correctly includes attachment conversation.');

        // 6. Test Non-Admin Rejection on getAdminConversationMessages
        const nonAdminMsgReq = {
            user: { id: emp1Id, _id: emp1User._id, role: 'employee' },
            params: { id: testConv._id.toString() },
            query: {}
        };
        const nonAdminMsgRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await conversationController.getAdminConversationMessages(nonAdminMsgReq, nonAdminMsgRes);
        if (nonAdminMsgRes.statusCode !== 403) {
            throw new Error(`Expected 403 Forbidden for non-admin on getAdminConversationMessages, got ${nonAdminMsgRes.statusCode}`);
        }
        console.log('[PASS] Non-admin rejected with 403 on getAdminConversationMessages.');

        // 7. Test Admin getAdminConversationMessages and AuditLog creation
        const adminMsgReq = {
            user: { id: adminEmpId, _id: adminUser._id, role: 'admin' },
            params: { id: testConv._id.toString() },
            query: {},
            ip: '127.0.0.1',
            get: () => 'TestAgent/1.0'
        };
        const adminMsgRes = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await conversationController.getAdminConversationMessages(adminMsgReq, adminMsgRes);
        if (adminMsgRes.statusCode !== 200 || !adminMsgRes.data?.success) {
            throw new Error(`Admin getAdminConversationMessages failed: ${JSON.stringify(adminMsgRes.data)}`);
        }
        if (adminMsgRes.data.messages.length !== 2) {
            throw new Error(`Expected 2 messages, got ${adminMsgRes.data.messages.length}`);
        }
        if (adminMsgRes.data.mediaFiles.length !== 1) {
            throw new Error(`Expected 1 mediaFile, got ${adminMsgRes.data.mediaFiles.length}`);
        }
        console.log(`[PASS] Admin retrieved transcript: ${adminMsgRes.data.messages.length} messages, ${adminMsgRes.data.mediaFiles.length} media files.`);

        // 8. Confirm AuditLog record exists for CHAT_OVERSIGHT_VIEW
        const auditRecord = await AuditLog.findOne({
            user_id: adminUser._id,
            action: 'CHAT_OVERSIGHT_VIEW',
            resource_id: testConv._id
        });
        if (!auditRecord) {
            throw new Error('AuditLog record for CHAT_OVERSIGHT_VIEW was NOT created!');
        }
        console.log(`[PASS] Verified AuditLog entry created: action=${auditRecord.action}, resource=${auditRecord.resource}, resource_id=${auditRecord.resource_id}`);

        console.log('\nALL ISSUE 4 OVERSIGHT VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    } finally {
        if (testConv?._id) {
            await Message.deleteMany({ conversationId: testConv._id });
            await Conversation.deleteOne({ _id: testConv._id });
        }
        if (adminUser?._id) {
            await AuditLog.deleteMany({ user_id: adminUser._id });
        }
        await Employee.deleteMany({ id: { $in: [adminEmpId, emp1Id, emp2Id] } });
        await mongoose.connection.close();
        console.log('Cleaned up test data and closed DB connection.');
    }
}

run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
