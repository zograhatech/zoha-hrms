const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Setting = require('../models/Setting');

/**
 * Generate a monthly attendance PDF report for an employee
 */
const generateMonthlyAttendancePDF = async (employee, month, year) => {
    return new Promise(async (resolve, reject) => {
        try {
            const doc = new PDFDocument({ margin: 50 });
            const buffers = [];
            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => resolve(Buffer.concat(buffers)));

            const settings = await Setting.findOne();
            const companyName = settings?.company_name || 'HRMS';

            // Filter for the specific month/year
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0); // Last day of month

            // Query attendance records for this month
            const attendance = await Attendance.find({
                employee_id: employee.id,
                date: { $gte: startDate, $lte: endDate }
            }).sort({ date: 1 });

            // Query leave records for this month
            const leaves = await Leave.find({
                employee_id: employee.id,
                status: 'approved',
                $or: [
                    { start_date: { $gte: startDate, $lte: endDate } },
                    { end_date: { $gte: startDate, $lte: endDate } },
                    { $and: [{ start_date: { $lte: startDate } }, { end_date: { $gte: endDate } }] }
                ]
            });

            // Process stats
            const stats = {
                present: 0,
                absent: 0,
                late: 0,
                leaves: 0,
                workingDays: 0
            };

            const dayRecords = {};
            attendance.forEach(rec => {
                const day = new Date(rec.date).getDate();
                if (!dayRecords[day]) {
                    dayRecords[day] = rec;
                } else {
                    const priority = { present: 4, late: 3, 'half-day': 2, holiday: 1, absent: 0 };
                    if (priority[rec.status] > (priority[dayRecords[day].status] || 0)) {
                        dayRecords[day] = rec;
                    }
                }
            });

            // Map all days in the month
            const reportData = [];
            for (let d = 1; d <= endDate.getDate(); d++) {
                const date = new Date(year, month - 1, d);
                const rec = dayRecords[d];
                
                let status = 'absent';
                let checkIn = '-';
                let checkOut = '-';
                let hours = 0;

                if (rec) {
                    status = rec.status;
                    checkIn = rec.check_in ? new Date(rec.check_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                    checkOut = rec.check_out ? new Date(rec.check_out).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
                    hours = rec.work_hours || 0;
                }

                // If absent, check if it's a leave
                if (status === 'absent' || !rec) {
                    const isOnLeave = leaves.some(l => date >= new Date(l.start_date) && date <= new Date(l.end_date));
                    if (isOnLeave) {
                        status = 'leave';
                        stats.leaves++;
                    } else {
                        stats.absent++;
                    }
                } else if (status === 'present') {
                    stats.present++;
                } else if (status === 'late') {
                    stats.late++;
                    stats.present++; // Still present if late
                }

                reportData.push({
                    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
                    status: status.toUpperCase(),
                    checkIn,
                    checkOut,
                    hours: hours.toFixed(2)
                });
            }

            // PDF Generation
            // Header
            doc.fillColor('#6366f1').fontSize(20).text(companyName, { align: 'center' });
            doc.fillColor('#444').fontSize(14).text(`Monthly Attendance Report`, { align: 'center' });
            doc.fontSize(10).text(`${startDate.toLocaleString('default', { month: 'long' })} ${year}`, { align: 'center' });
            doc.moveDown();

            // Employee details
            doc.fillColor('#000').fontSize(12).text(`Employee: ${employee.name}`);
            doc.text(`ID: ${employee.id}`);
            doc.text(`Designation: ${employee.designation || 'N/A'}`);
            doc.moveDown();

            // Stats box
            doc.rect(50, doc.y, 500, 70).fill('#f3f4f6').stroke('#eee');
            doc.fillColor('#000').fontSize(10);
            const startY = doc.y + 15;
            doc.text(`Present Days: ${stats.present}`, 70, startY);
            doc.text(`Late Entries: ${stats.late}`, 70, startY + 20);
            doc.text(`Absent Days: ${stats.absent}`, 250, startY);
            doc.text(`Leaves (Approved): ${stats.leaves}`, 250, startY + 20);
            doc.text(`Total Days: ${endDate.getDate()}`, 430, startY);
            doc.moveDown(5);

            // Table headers
            const tableTop = doc.y;
            doc.font('Helvetica-Bold');
            doc.text('Date', 50, tableTop);
            doc.text('Status', 120, tableTop);
            doc.text('Check In', 220, tableTop);
            doc.text('Check Out', 320, tableTop);
            doc.text('Work Hours', 420, tableTop);
            doc.moveDown();
            doc.font('Helvetica');

            // Draw line
            doc.moveTo(50, doc.y - 12).lineTo(550, doc.y - 12).stroke('#ccc');

            // Table rows
            reportData.forEach(row => {
                if (doc.y > 700) doc.addPage();
                
                doc.fontSize(9);
                doc.text(row.date, 50, doc.y);
                
                if (row.status === 'LATE') doc.fillColor('#f59e0b');
                else if (row.status === 'ABSENT') doc.fillColor('#ef4444');
                else if (row.status === 'LEAVE') doc.fillColor('#3b82f6');
                else if (row.status === 'PRESENT') doc.fillColor('#22c55e');
                
                doc.text(row.status, 120, doc.y);
                doc.fillColor('#000');
                
                doc.text(row.checkIn, 220, doc.y);
                doc.text(row.checkOut, 320, doc.y);
                doc.text(row.hours, 420, doc.y);
                doc.moveDown(0.5);
                doc.moveTo(50, doc.y - 5).lineTo(550, doc.y - 5).stroke('#f1f1f1');
                doc.moveDown();
            });

            doc.end();

        } catch (error) {
            console.error('PDF Generation Error:', error);
            reject(error);
        }
    });
};

module.exports = { generateMonthlyAttendancePDF };
