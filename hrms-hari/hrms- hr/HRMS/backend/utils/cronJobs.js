const cron = require('node-cron');
const Resignation = require('../models/Resignation');
const Employee = require('../models/Employee');
const { sendEmail } = require('./emailService');

const { generateExitEmailTemplate } = require('../controllers/resignationController');

const { generateMonthlyAttendancePDF } = require('./reportGenerator');

/**
 * Daily Cron Jobs for HRMS
 * Runs every day at 12:01 AM
 */
const initCronJobs = () => {
    // 0 1 0 * * * = 12:01 AM every day
    cron.schedule('0 1 0 * * *', async () => {
        console.log('--- Running Daily HRMS Maintenance Tasks ---');
        await processLastWorkingDayReminders();
    });

    // 0 50 23 28-31 * * = 11:50 PM on days 28-31
    // We check if it's the LAST day inside the function
    cron.schedule('0 50 23 28-31 * *', async () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        if (tomorrow.getDate() === 1) {
            console.log('--- Detected Last Day of Month: Running Monthly Attendance Reports ---');
            await processMonthlyAttendanceReports();
        }
    });
};

const processMonthlyAttendanceReports = async () => {
    try {
        const now = new Date();
        const month = now.getMonth() + 1; // 1-indexed
        const year = now.getFullYear();
        const monthName = now.toLocaleString('default', { month: 'long' });

        const employees = await Employee.find({ status: 'active' });
        console.log(`Processing monthly reports for ${employees.length} active employees.`);

        for (const employee of employees) {
            try {
                // 1. Generate PDF
                const pdfBuffer = await generateMonthlyAttendancePDF(employee, month, year);

                // 2. Fetch stats for email body (simulating what's inside generateMonthlyAttendancePDF for accuracy)
                const Attendance = require('../models/Attendance');
                const endDate = new Date(year, month, 0);
                const records = await Attendance.find({
                    employee_id: employee.id,
                    date: { $gte: new Date(year, month - 1, 1), $lte: endDate }
                });
                
                const late = records.filter(r => r.status === 'late').length;
                const present = records.filter(r => r.status === 'present').length + late;
                
                // 3. Send Email
                const subject = `Monthly Attendance Report - ${monthName} ${year} - ${employee.name}`;
                const html = `
                    <p>Dear ${employee.name},</p>
                    <p>Please find attached your summarized attendance report for <b>${monthName} ${year}</b>.</p>
                    <div style="background: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
                        <h4 style="margin-top: 0; color: #111827;">Monthly Summary</h4>
                        <ul style="list-style: none; padding: 0;">
                            <li>✅ Present Days: ${present}</li>
                            <li>⚠️ Late Entries: ${late}</li>
                        </ul>
                        <p style="font-size: 13px; color: #6b7280; margin-bottom: 0;">Detailed breakdown of absences and leaves is available in the attached PDF.</p>
                    </div>
                    <p>If you notice any discrepancies, please contact the HR department within the next 3 working days.</p>
                    <p>Best Regards,<br>HR Department</p>
                `;

                await sendEmail({
                    to: employee.email,
                    subject,
                    html,
                    attachments: [
                        {
                            filename: `Attendance_Report_${monthName}_${year}.pdf`,
                            content: pdfBuffer,
                            contentType: 'application/pdf'
                        }
                    ]
                });

                console.log(`Successfully sent monthly report to ${employee.name} (${employee.email})`);
            } catch (err) {
                console.error(`Failed to process monthly report for ${employee.name}:`, err);
            }
        }
    } catch (err) {
        console.error('Error in Monthly Attendance Report Cron Job:', err);
    }
};

const processLastWorkingDayReminders = async () => {
    try {
        // We want to find anyone whose last working day is TOMORROW
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const endOfTomorrow = new Date(tomorrow);
        endOfTomorrow.setHours(23, 59, 59, 999);

        // Find approved resignations where last working day is TOMORROW
        const departures = await Resignation.find({
            status: 'approved',
            last_working_day: {
                $gte: tomorrow,
                $lte: endOfTomorrow
            }
        }).populate('employee');

        console.log(`Found ${departures.length} employees finishing their notice period TOMORROW.`);

        for (const record of departures) {
            const { employee } = record;
            // Send standard exit confirmation email with full credentials
            const subject = `Final Day Reminder & Access Details - ${employee.name}`;
            const html = generateExitEmailTemplate(employee, record, record.hr_comments);

            await sendEmail({
                to: employee.email,
                subject,
                html
            });
            console.log(`Sent 24h exit reminder to ${employee.name} (ID: ${employee.id})`);
        }

        // 2. Automatically update employee status to Inactive on their ACTUAL last day
        const departuresToday = await Resignation.find({
            status: 'approved',
            last_working_day: {
                $gte: new Date(new Date().setHours(0,0,0,0)),
                $lte: new Date(new Date().setHours(23,59,59,999))
            }
        }).populate('employee');

        for (const record of departuresToday) {
            await Employee.findByIdAndUpdate(record.employee._id, { status: 'inactive' });
            console.log(`Auto-deactivated exited employee ${record.employee.name} (ID: ${record.employee.id})`);
        }
    } catch (err) {
        console.error('Error in HRMS Maintenance Cron Job:', err);
    }
};

module.exports = { initCronJobs };
