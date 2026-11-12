/**
 * dev-only script: normalize_conversation_participants.js
 * 
 * Reports how many conversations have string vs ObjectId participants
 * and normalizes string participants to MongoDB ObjectIds.
 * 
 * SAFETY:
 * - Dry-run by default (no writes unless --execute flag is passed).
 * - Strictly dev-only: refuses to run on production database ('hrms_db' or NODE_ENV=production).
 * - NEVER RUN ON PRODUCTION.
 * 
 * Usage:
 *   node scripts/normalize_conversation_participants.js           (dry-run by default)
 *   node scripts/normalize_conversation_participants.js --execute (applies updates in dev)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');

// Helper to check if value is BSON ObjectId
function isBsonObjectId(val) {
    if (!val) return false;
    return val instanceof mongoose.Types.ObjectId || (typeof val === 'object' && val._bsontype === 'ObjectID');
}

// Safety check against production
function assertNotProduction(dbName, uri, { allowProdReadonly = false, dryRun = true } = {}) {
    const isProdEnv = process.env.NODE_ENV === 'production';
    const activeDb = (dbName || '').toLowerCase();
    const isProdDb = activeDb === 'hrms_db' || (!activeDb && uri && uri.toLowerCase().includes('/hrms_db'));

    if (isProdEnv || isProdDb) {
        if (allowProdReadonly) {
            if (!dryRun) {
                throw new Error(
                    `[FATAL] --allow-prod-readonly strictly permits READ-ONLY analysis (dry-run).\n` +
                    `Execution / DB writes are strictly forbidden against production database ('${dbName || uri}').`
                );
            }
            console.warn(
                `\n[SAFETY NOTICE] Running in READ-ONLY dry-run mode against production database ('${dbName || uri}').\n` +
                `No database modifications will be executed.\n`
            );
            return;
        }

        if (!process.env.ALLOW_DEV_SCRIPT) {
            throw new Error(
                `[FATAL] Refusing to run dev normalization script on production database ('${dbName || uri}').\n` +
                `This script is dev-only and must never be run on production.\n` +
                `To inspect production safely in read-only mode, pass the explicit flag: --allow-prod-readonly`
            );
        }
    }
}

/**
 * Core normalization logic
 * @param {Object} options
 * @param {boolean} options.dryRun - Whether to perform a dry run (default true)
 * @param {boolean} [options.allowProdReadonly] - Allow read-only dry-run against production
 * @param {mongoose.Connection} [options.connection] - Optional existing mongoose connection
 * @returns {Promise<Object>} Summary statistics
 */
async function normalizeParticipants(options = {}) {
    const allowProdReadonly = Boolean(options.allowProdReadonly || process.argv.includes('--allow-prod-readonly'));
    let dryRun = options.dryRun !== false;

    // Hard guard: if allowProdReadonly is active, force dryRun to true (strictly zero writes)
    if (allowProdReadonly) {
        dryRun = true;
    }

    const conn = options.connection || mongoose.connection;
    const db = conn.db;

    if (!db) {
        throw new Error('Database connection is not open.');
    }

    assertNotProduction(db.databaseName, conn.client?.s?.url || process.env.MONGO_URI, { allowProdReadonly, dryRun });

    const EmployeeModel = conn.model('Employee');
    const ConversationModel = conn.model('Conversation');

    console.log(`\n===============================================================`);
    console.log(` Participant Normalization Report ${dryRun ? '[DRY-RUN]' : '[EXECUTING WRITES]'}`);
    console.log(` Target Database: ${db.databaseName}`);
    console.log(` Mode: ${dryRun ? 'Dry-run (no DB writes)' : 'EXECUTE (writing to dev DB)'}`);
    console.log(`===============================================================\n`);

    const conversations = await ConversationModel.collection.find({}).toArray();
    console.log(`Total conversations found: ${conversations.length}`);

    // Pre-load all employees for quick resolution of employee string codes (e.g. ZOHA105)
    const allEmployees = await EmployeeModel.find({})
        .select('_id id employee_id name email')
        .lean();

    const empByOid = new Map(allEmployees.map(e => [e._id.toString(), e._id]));
    const empByStrId = new Map(allEmployees.filter(e => e.id).map(e => [e.id.toUpperCase(), e._id]));
    const empByEmpCode = new Map(allEmployees.filter(e => e.employee_id).map(e => [e.employee_id.toUpperCase(), e._id]));

    let stats = {
        totalConversations: conversations.length,
        cleanConversations: 0,        // All participants already ObjectIds
        conversationsWithStrings: 0,  // Contains at least one string participant
        totalParticipantsChecked: 0,
        participantsAlreadyObjectId: 0,
        participantsHexString: 0,
        participantsEmployeeCode: 0,
        participantsUnresolvable: 0,
        updatedConversationsCount: 0
    };

    const updatesToApply = [];

    for (const conv of conversations) {
        const rawParticipants = Array.isArray(conv.participants) ? conv.participants : [];
        let hasString = false;
        const normalizedParticipants = [];
        const seenOids = new Set();

        for (const p of rawParticipants) {
            stats.totalParticipantsChecked++;

            if (isBsonObjectId(p)) {
                stats.participantsAlreadyObjectId++;
                const oidStr = p.toString();
                if (!seenOids.has(oidStr)) {
                    seenOids.add(oidStr);
                    normalizedParticipants.push(p);
                }
                continue;
            }

            // It's a string or other non-ObjectId type
            hasString = true;
            const pStr = (typeof p === 'object' && p !== null) ? (p._id || p.id || '').toString() : String(p || '');

            if (!pStr) {
                stats.participantsUnresolvable++;
                continue;
            }

            // Case A: 24-character hex string representing ObjectId
            if (/^[0-9a-fA-F]{24}$/.test(pStr)) {
                stats.participantsHexString++;
                const oid = new mongoose.Types.ObjectId(pStr);
                const oidStr = oid.toString();
                if (!seenOids.has(oidStr)) {
                    seenOids.add(oidStr);
                    normalizedParticipants.push(oid);
                }
                continue;
            }

            // Case B: Employee code / string id (e.g. 'ZOHA105', 'EMP001')
            const upper = pStr.toUpperCase();
            const matchedOid = empByStrId.get(upper) || empByEmpCode.get(upper);

            if (matchedOid) {
                stats.participantsEmployeeCode++;
                const oidStr = matchedOid.toString();
                if (!seenOids.has(oidStr)) {
                    seenOids.add(oidStr);
                    normalizedParticipants.push(matchedOid);
                }
            } else {
                stats.participantsUnresolvable++;
                console.warn(`[WARN] Unresolvable participant '${pStr}' in conversation ${conv._id}`);
            }
        }

        if (hasString) {
            stats.conversationsWithStrings++;
            updatesToApply.push({
                convId: conv._id,
                before: rawParticipants,
                after: normalizedParticipants
            });
        } else {
            stats.cleanConversations++;
        }
    }

    console.log(`\n--- Summary Statistics ---`);
    console.log(`- Total Conversations:             ${stats.totalConversations}`);
    console.log(`- Clean (100% ObjectId):           ${stats.cleanConversations}`);
    console.log(`- Needing Normalization (Strings): ${stats.conversationsWithStrings}`);
    console.log(`- Total Participants Checked:      ${stats.totalParticipantsChecked}`);
    console.log(`  * Already ObjectId:              ${stats.participantsAlreadyObjectId}`);
    console.log(`  * 24-hex String -> ObjectId:     ${stats.participantsHexString}`);
    console.log(`  * Employee Code -> ObjectId:     ${stats.participantsEmployeeCode}`);
    console.log(`  * Unresolvable Strings:          ${stats.participantsUnresolvable}`);

    if (updatesToApply.length > 0) {
        console.log(`\n--- Conversations to Normalize (${updatesToApply.length}) ---`);
        for (const item of updatesToApply) {
            console.log(
                `Conversation [${item.convId}] : ` +
                `Before: [${item.before.map(p => (isBsonObjectId(p) ? `ObjectId(${p})` : `"${p}"`)).join(', ')}] -> ` +
                `After: [${item.after.map(p => `ObjectId(${p})`).join(', ')}]`
            );
        }
    }

    if (dryRun) {
        console.log(`\n[DRY-RUN] No changes were written to the database.`);
        console.log(`To apply these normalizations in development, run with: node scripts/normalize_conversation_participants.js --execute`);
    } else {
        console.log(`\nApplying updates to database...`);
        for (const item of updatesToApply) {
            await ConversationModel.collection.updateOne(
                { _id: item.convId },
                { $set: { participants: item.after } }
            );
            stats.updatedConversationsCount++;
        }
        console.log(`[SUCCESS] Normalized ${stats.updatedConversationsCount} conversations to consistent ObjectIds.`);
    }

    console.log(`===============================================================\n`);
    return stats;
}

async function run() {
    try {
        const allowProdReadonly = process.argv.includes('--allow-prod-readonly');
        const isExecute = process.argv.includes('--execute') || process.argv.includes('--apply');

        if (allowProdReadonly && isExecute) {
            throw new Error('Conflicting options: --allow-prod-readonly strictly forbids --execute or --apply. Production writes are blocked.');
        }

        const isProduction = process.env.NODE_ENV === 'production' ||
            (process.env.DB_NAME && process.env.DB_NAME.toLowerCase() === 'hrms_db');

        const dbName = allowProdReadonly && isProduction ? 'hrms_db' : (process.env.DB_NAME || 'hrms_dev');
        const uri = process.env.MONGO_URI || `mongodb://localhost:27017/${dbName}`;

        assertNotProduction(dbName, uri, { allowProdReadonly, dryRun: !isExecute });

        if (allowProdReadonly) {
            process.env.ALLOW_PROD_READONLY = 'true';
        }

        console.log(`Connecting to database (${dbName})...`);
        const connectDB = require('../config/db');
        await connectDB();

        await normalizeParticipants({ dryRun: !isExecute, allowProdReadonly });
        process.exit(0);
    } catch (err) {
        console.error(`\n[ERROR] ${err.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    run();
}

module.exports = {
    normalizeParticipants,
    assertNotProduction,
    isBsonObjectId
};
