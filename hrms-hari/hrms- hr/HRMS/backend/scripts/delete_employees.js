const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const Employee = require('../models/Employee');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const LeaveBalance = require('../models/LeaveBalance');
const Payroll = require('../models/Payroll');
const Ticket = require('../models/Ticket');
const Notification = require('../models/Notification');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');

async function deleteEmployees() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to MongoDB');

        // Keep only ADM001 and EMP001
        const keepIds = ['ADM001', 'EMP001'];

        // Get list of employees to delete
        const toDelete = await Employee.find({ id: { $nin: keepIds } });
        const toDeleteIds = toDelete.map(emp => emp.id);
        const toDeleteObjectIds = toDelete.map(emp => emp._id);

        console.log(`Found ${toDelete.length} employees to delete:`, toDeleteIds);

        if (toDelete.length > 0) {
            // Delete associated attendance
            const attDel = await Attendance.deleteMany({ employee_id: { $in: toDeleteIds } });
            console.log(`Deleted ${attDel.deletedCount} attendance records.`);

            // Delete associated leaves
            const leaveDel = await Leave.deleteMany({ employee_id: { $in: toDeleteIds } });
            console.log(`Deleted ${leaveDel.deletedCount} leave records.`);

            // Delete associated leave balances
            const lbDel = await LeaveBalance.deleteMany({ employee_id: { $in: toDeleteIds } });
            console.log(`Deleted ${lbDel.deletedCount} leave balance records.`);

            // Delete associated payroll
            const payrollDel = await Payroll.deleteMany({ employee_id: { $in: toDeleteIds } });
            console.log(`Deleted ${payrollDel.deletedCount} payroll records.`);

            // Delete associated tickets
            const ticketDel = await Ticket.deleteMany({ employee_id: { $in: toDeleteIds } });
            console.log(`Deleted ${ticketDel.deletedCount} ticket records.`);

            // Delete associated notifications
            const notifDel = await Notification.deleteMany({ 
                $or: [
                    { recipient: { $in: toDeleteObjectIds } },
                    { sender: { $in: toDeleteObjectIds } }
                ]
            });
            console.log(`Deleted ${notifDel.deletedCount} notification records.`);

            // Delete associated messages and conversations
            const msgDel = await Message.deleteMany({ sender: { $in: toDeleteObjectIds } });
            console.log(`Deleted ${msgDel.deletedCount} message records.`);

            const convDel = await Conversation.deleteMany({ participants: { $in: toDeleteObjectIds } });
            console.log(`Deleted ${convDel.deletedCount} conversation records.`);

            // Finally, delete the employees
            const empDel = await Employee.deleteMany({ id: { $in: toDeleteIds } });
            console.log(`Successfully deleted ${empDel.deletedCount} employee records.`);
        } else {
            console.log('No other employees found to delete.');
        }

        process.exit(0);
    } catch (err) {
        console.error('Delete operation failed:', err);
        process.exit(1);
    }
}

deleteEmployees();
