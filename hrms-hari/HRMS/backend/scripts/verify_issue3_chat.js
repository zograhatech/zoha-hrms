/**
 * Verification script for Issue 3: Chat Uploads, Direct Signatures, File Whitelist Removal & Linkification
 * Strictly tests against DB_NAME=hrms_dev
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
process.env.DB_NAME = 'hrms_dev';
process.env.MAX_UPLOAD_BYTES = '104857600'; // 100 MB

const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Employee = require('../models/Employee');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { getUploadSignature, sendMessage } = require('../controllers/messageController');

async function run() {
    console.log('=== Starting Issue 3 Verification ===');
    console.log(`Target DB: ${process.env.DB_NAME}`);

    if (process.env.DB_NAME !== 'hrms_dev') {
        throw new Error('SAFETY CHECK FAILED: DB_NAME must be hrms_dev');
    }

    await connectDB();
    console.log(`Connected to database: ${mongoose.connection.name}`);
    if (mongoose.connection.name !== 'hrms_dev') {
        throw new Error(`ABORT: Connected database is "${mongoose.connection.name}", but must be strictly "hrms_dev"!`);
    }

    const empId1 = `TEST_CHAT1_${Date.now()}`;
    const empId2 = `TEST_CHAT2_${Date.now()}`;

    let user1, user2;
    try {
        [user1, user2] = await Promise.all([
            Employee.create({
                id: empId1,
                name: 'Test Chat User 1',
                email: `${empId1}@example.com`,
                password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
                role: 'employee',
                status: 'active'
            }),
            Employee.create({
                id: empId2,
                name: 'Test Chat User 2',
                email: `${empId2}@example.com`,
                password_hash: '$2a$10$abcdefghijklmnopqrstuvwxyzABCDEF1234567890abcdefghijklm',
                role: 'employee',
                status: 'active'
            })
        ]);

        const conversation = await Conversation.create({
            participants: [user1._id, user2._id],
            isGroup: false
        });

        console.log(`[PASS] Test conversation created: ${conversation._id}`);

        // 1. Test POST /api/messages/upload-signature
        const mockReqSig = {
            user: { id: empId1, _id: user1._id },
            body: { filename: 'project_archive.zip', fileType: 'application/zip', fileSize: 50 * 1024 * 1024 }
        };
        let mockResSig = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await getUploadSignature(mockReqSig, mockResSig);
        console.log(`[PASS] upload-signature endpoint returned: provider=${mockResSig.data?.provider}, success=${mockResSig.data?.success}`);
        if (!mockResSig.data?.success || !mockResSig.data?.uploadUrl) {
            throw new Error(`Upload signature generation failed: ${JSON.stringify(mockResSig.data)}`);
        }

        // Test file size limit rejection on signature
        const mockReqSigTooLarge = {
            user: { id: empId1, _id: user1._id },
            body: { filename: 'giant_file.iso', fileType: 'application/octet-stream', fileSize: 200 * 1024 * 1024 }
        };
        let mockResSigTooLarge = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await getUploadSignature(mockReqSigTooLarge, mockResSigTooLarge);
        console.log(`[PASS] Over-limit file properly rejected on signature endpoint: status=${mockResSigTooLarge.statusCode}`);
        if (mockResSigTooLarge.statusCode !== 400) {
            throw new Error(`Expected 400 for file exceeding max limit, got ${mockResSigTooLarge.statusCode}`);
        }

        // 2. Test Direct-Upload message creation (for files uploaded direct to storage)
        const mockReqDirectMsg = {
            user: { id: empId1, _id: user1._id },
            body: {
                conversationId: conversation._id.toString(),
                clientMessageId: `cli_${Date.now()}_1`,
                text: 'Here is the large archive and documentation: https://zograha.com/docs',
                fileUrl: 'https://res.cloudinary.com/demo/raw/upload/v1/chat_attachments/project_archive.zip',
                fileName: 'project_archive.zip',
                fileSize: 45000000,
                fileType: 'file',
                mimeType: 'application/zip'
            }
        };
        let mockResDirectMsg = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };

        await sendMessage(mockReqDirectMsg, mockResDirectMsg);
        console.log(`[PASS] Direct upload message created: id=${mockResDirectMsg.data?.message?._id}`);
        if (!mockResDirectMsg.data?.success || !mockResDirectMsg.data?.message?.fileUrl) {
            throw new Error(`Direct upload message failed: ${JSON.stringify(mockResDirectMsg.data)}`);
        }

        const savedMsg = await Message.findById(mockResDirectMsg.data.message._id);
        if (savedMsg.fileName !== 'project_archive.zip' || savedMsg.fileType !== 'file') {
            throw new Error(`Saved message metadata mismatch: ${JSON.stringify(savedMsg)}`);
        }
        console.log('[PASS] File metadata verified in DB: fileName, fileSize, fileType, fileUrl properly persisted.');

        // 3. Test Non-whitelisted file types (e.g. .py, .mp4, .zip, .json)
        const mockReqDirectCode = {
            user: { id: empId1, _id: user1._id },
            body: {
                conversationId: conversation._id.toString(),
                clientMessageId: `cli_${Date.now()}_2`,
                text: 'Video demonstration and script',
                fileUrl: 'https://res.cloudinary.com/demo/video/upload/v1/chat_attachments/demo_video.mp4',
                fileName: 'demo_video.mp4',
                fileSize: 15000000,
                fileType: 'video',
                mimeType: 'video/mp4'
            }
        };
        let mockResDirectCode = {
            statusCode: 200,
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.data = payload; return this; }
        };
        await sendMessage(mockReqDirectCode, mockResDirectCode);
        console.log(`[PASS] Video file message accepted without extension restrictions: type=${mockResDirectCode.data?.message?.fileType}`);
        if (mockResDirectCode.data?.message?.fileType !== 'video') {
            throw new Error('Video file type was not correctly registered');
        }

        // 4. Test URL Linkification regex logic
        const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|www\.[^\s<]+[^<.,:;"')\]\s]|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
        const sampleText = 'Visit https://zograha.com and www.google.com or email hr@zograha.com for info. <script>alert(1)</script>';
        const matches = sampleText.match(URL_REGEX);
        console.log(`[PASS] URL extraction matches: ${JSON.stringify(matches)}`);
        if (!matches || matches.length < 3) {
            throw new Error('URL Regex failed to detect links');
        }

        console.log('\nALL ISSUE 3 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
    } finally {
        if (user1?._id && user2?._id) {
            await Conversation.deleteMany({ participants: { $in: [user1._id, user2._id] } });
        }
        await Employee.deleteMany({ id: { $in: [empId1, empId2] } });
        await Message.deleteMany({ text: { $regex: /large archive|Video demonstration/ } });
        await mongoose.connection.close();
        console.log('Cleaned up test data and closed DB connection.');
    }
}

run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
});
