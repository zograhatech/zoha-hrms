const mongoose = require('mongoose');
const Setting = require('./backend/models/Setting');
const LeaveBalance = require('./backend/models/LeaveBalance');
const Leave = require('./backend/models/Leave');
require('dotenv').config({ path: './backend/.env' });

async function sync() {
    try {
        console.log('... Connecting to MongoDB');
        await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
        console.log('✅ Connected to DB');

        const settings = await Setting.findOne();
        if (!settings || !settings.leave_policies) {
            console.error('❌ No global settings or leave policies found.');
            process.exit(1);
        }

        const policies = settings.leave_policies;
        const currentYear = new Date().getFullYear();
        console.log(`... Syncing balances for Year ${currentYear} mapping to policy:`, JSON.stringify(policies));

        const balances = await LeaveBalance.find({ year: currentYear });
        console.log(`... Found ${balances.length} employee balance records to fix.`);

        for (const bal of balances) {
            // Find all approved leaves for this employee in this year
            const approved = await Leave.find({
                employee_id: bal.employee_id,
                status: 'approved',
                createdAt: {
                    $gte: new Date(currentYear, 0, 1),
                    $lte: new Date(currentYear, 11, 31)
                }
            });

            // Map used days by type
            const used = { casual_leave: 0, sick_leave: 0, earned_leave: 0, maternity_leave: 0, paternity_leave: 0 };
            
            approved.forEach(l => {
                const key = `${l.leave_type}_leave`;
                if (used[key] !== undefined) {
                    used[key] += (l.total_days || 0);
                }
            });

            // Calculate new available balance
            const update = {
                casual_leave: Math.max(0, (policies.casual_leave || 12) - used.casual_leave),
                sick_leave: Math.max(0, (policies.sick_leave || 12) - used.sick_leave),
                earned_leave: Math.max(0, (policies.earned_leave || 15) - used.earned_leave),
                maternity_leave: Math.max(0, (policies.maternity_leave || 0) - used.maternity_leave),
                paternity_leave: Math.max(0, (policies.paternity_leave || 0) - used.paternity_leave)
            };

            await LeaveBalance.updateOne({ _id: bal._id }, { $set: update });
            console.log(`   - Fixed Employee ID ${bal.employee_id}: C[${update.casual_leave}] S[${update.sick_leave}]`);
        }

        console.log('🚀 SUCCESS: All employee leave balances have been synced to the global policy based on actual history.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Sync failed:', err);
        process.exit(1);
    }
}

sync();
