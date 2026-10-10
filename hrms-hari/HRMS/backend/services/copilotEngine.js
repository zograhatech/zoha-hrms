const Employee = require('../models/Employee');
const LeaveBalance = require('../models/LeaveBalance');
const Leave = require('../models/Leave');
const Payroll = require('../models/Payroll');
const Attendance = require('../models/Attendance');
const Ticket = require('../models/Ticket');
const Department = require('../models/Department');
const CopilotSession = require('../models/CopilotSession');
const Notification = require('../models/Notification');

const INTENTS = {
    GREETING: ['hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'howdy'],
    LEAVE_BALANCE: ['leave balance', 'how many leaves', 'remaining leave', 'leave left', 'leaves available'],
    APPLY_LEAVE: ['apply leave', 'take leave', 'request leave', 'book leave', 'leave application', 'apply for leave'],
    LEAVE_STATUS: ['leave status', 'my leaves', 'leave history', 'leave applied', 'pending leave'],
    PAYSLIP: ['payslip', 'salary slip', 'pay slip', 'salary details', 'my salary', 'show salary', 'payroll', 'ctc', 'income', 'pay'],
    ATTENDANCE: ['attendance', 'present', 'absent', 'check in', 'check out', 'working days', 'attendance report'],
    PROFILE: ['my profile', 'my details', 'employee details', 'employee profile', 'show profile', 'view profile', 'personal info', 'my info', 'who am i'],
    HELPDESK: ['complaint', 'issue', 'problem', 'ticket', 'raise ticket', 'create ticket', 'help', 'support', 'not working'],
    ADD_EMPLOYEE: ['add employee', 'new employee', 'onboard', 'create employee'],
    LEAVE_APPROVE: ['approve leave', 'pending approval', 'team leaves', 'pending leaves'],
    ANALYTICS: ['analytics', 'report', 'insights', 'statistics', 'dashboard', 'summary'],
    PROFILE: ['profile', 'my details', 'who am i', 'my info', 'me', 'employee profile'],
    POLICIES: ['policy', 'policies', 'wfh', 'work from home', 'office hours', 'holidays', 'benefits', 'insurance', 'leave rules'],
    GOODBYE: ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'exit', 'quit', 'done'],
    HELP: ['help', 'what can you do', 'options', 'commands', 'menu'],
};

const LEAVE_TYPES = {
    casual: ['casual', 'cl'],
    sick: ['sick', 'sl', 'medical', 'illness'],
    earned: ['earned', 'el', 'annual', 'vacation', 'pl', 'privilege'],
    maternity: ['maternity', 'ml', 'maternity leave'],
    paternity: ['paternity', 'paternity leave'],
    unpaid: ['unpaid', 'lop', 'loss of pay'],
};

const MONTHS = {
    january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
    may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
    september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12
};

// ─── Intent Detection ────────────────────────────────────────
const detectIntent = (message) => {
    const lower = message.toLowerCase().trim();
    for (const [intent, keywords] of Object.entries(INTENTS)) {
        if (keywords.some(kw => lower.includes(kw))) return intent;
    }
    return 'UNKNOWN';
};

// ─── Entity Extraction ───────────────────────────────────────
const extractEntities = (message) => {
    const lower = message.toLowerCase().trim();
    const entities = {};

    // Employee ID  EMP001, EMP123 etc.
    const empMatch = message.match(/\b(EMP\d{3,6})\b/i);
    if (empMatch) entities.employee_id = empMatch[1].toUpperCase();

    // Leave type
    for (const [type, keywords] of Object.entries(LEAVE_TYPES)) {
        if (keywords.some(kw => lower.includes(kw))) { entities.leave_type = type; break; }
    }

    // Date patterns: YYYY-MM-DD or DD/MM/YYYY or DD-MM-YYYY
    const dateMatches = message.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{4})\b/g);
    if (dateMatches) {
        const parsedDates = dateMatches.map(d => {
            if (d.includes('-') && d.length === 10 && d.indexOf('-') === 4) return d;
            const parts = d.split(/[\/\-]/);
            return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        });
        if (parsedDates[0]) entities.start_date = parsedDates[0];
        if (parsedDates[1]) entities.end_date = parsedDates[1];
        else if (parsedDates[0]) entities.end_date = parsedDates[0]; // single date = same day
    }

    // Month by name
    for (const [month, num] of Object.entries(MONTHS)) {
        if (lower.includes(month)) { entities.month = num; break; }
    }
    // Month by number
    const monthNumMatch = message.match(/\b(1[0-2]|[1-9])\s*\/\s*(\d{4})\b/);
    if (monthNumMatch) { entities.month = parseInt(monthNumMatch[1]); entities.year = parseInt(monthNumMatch[2]); }

    // Year
    const yearMatch = message.match(/\b(202[0-9]|203[0-9])\b/);
    if (yearMatch) entities.year = parseInt(yearMatch[0]);

    return entities;
};

// ─── Session management (Persistent) ────────────────────────
const getSession = async (sessionId) => {
    let session = await CopilotSession.findOne({ sessionId });
    if (!session) {
        session = await CopilotSession.create({ sessionId, step: 0, data: {}, intent: null, history: [] });
    }
    return session;
};

const saveSession = async (session) => {
    session.last_active = Date.now();
    session.markModified('data');
    await session.save();
};

const resetSession = async (sessionId) => {
    await CopilotSession.deleteOne({ sessionId });
};

// ─── DB Helpers ──────────────────────────────────────────────
// ─── DB Helpers ──────────────────────────────────────────────
const fetchEmployee = async (id) => {
    const emp = await Employee.findOne({ id }).populate('department_id', 'name').lean();
    if (emp && emp.department_id) {
        emp.department_name = emp.department_id.name;
    }
    return emp;
};

const fetchLeaveBalance = async (id) => {
    return await LeaveBalance.findOne({ employee_id: id }).lean();
};

const fetchPayroll = async (id, month, year) => {
    return await Payroll.findOne({ employee_id: id, month, year });
};

const fetchAttendance = async (id, month, year) => {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return await Attendance.find({
        employee_id: id,
        date: { $gte: start, $lte: end }
    }).sort({ date: 1 }).lean();
};

// ─── Response Formatters ─────────────────────────────────────
const formatCurrency = (amount) => `₹${parseFloat(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

const formatLeaveBalance = (bal) => `
📊 **Your Leave Balance (${bal.year}):**

| Leave Type | Available |
|---|---|
| 🏖️ Casual Leave | **${bal.casual_leave} days** |
| 🤒 Sick Leave | **${bal.sick_leave} days** |
| 🌴 Earned Leave | **${bal.earned_leave} days** |
| 👶 Maternity Leave | **${bal.maternity_leave} days** |
| 👦 Paternity Leave | **${bal.paternity_leave} days** |

Would you like to **apply for leave**? Just say "apply leave"!`;

const formatPayslip = (emp, p) => `
💰 **Salary Statement — ${getMonthName(p.month)} ${p.year}**

👤 **${emp.name}** | ${emp.designation || ''} | ${emp.department_name || ''}

**Earnings:**
- Basic Salary: ${formatCurrency(p.basic)}
- DA: ${formatCurrency(p.da)}
- Other Allowances (OA): ${formatCurrency(p.oa)}
- Leave Wages: ${formatCurrency(p.leave_wages)}
- **Gross Salary: ${formatCurrency(p.gross_salary)}**

**Deductions:**
- EPF/Provident Fund: ${formatCurrency(p.provident_fund)}
- ESI: ${formatCurrency(p.esi_deduction)}
- Professional Tax (PT): ${formatCurrency(p.pt)}
- TDS: ${formatCurrency(p.tds)}
- Other Deductions: ${formatCurrency(p.other_deductions)}

---
💵 **Net Salary: ${formatCurrency(p.net_salary)}**
📅 Status: **${p.status === 'paid' ? 'Paid' : 'Pending'}** ${p.paid_date ? `on ${new Date(p.paid_date).toLocaleDateString('en-IN')}` : ''}

Would you like to **view more details**?`;

const formatAttendanceSummary = (records, month, year) => {
    const present = records.filter(r => r.status === 'present').length;
    const absent = records.filter(r => r.status === 'absent').length;
    const late = records.filter(r => r.status === 'late').length;
    const halfDay = records.filter(r => r.status === 'half-day').length;
    const holidays = records.filter(r => r.status === 'holiday').length;
    const working = present + late + halfDay;
    return `
📅 **Attendance Summary — ${getMonthName(month)} ${year}**

| Status | Count |
|---|---|
| ✅ Present | **${present}** |
| ❌ Absent | **${absent}** |
| ⏰ Late | **${late}** |
| 🕐 Half Day | **${halfDay}** |
| 🎉 Holiday | **${holidays}** |
| 📊 Effective Working Days | **${working}** |

${absent > 3 ? '⚠️ You have more than 3 absences this month.' : ''}`;
};

const getMonthName = (num) => ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][parseInt(num)] || '';

// ─── Workflow Definitions ────────────────────────────────────
const WORKFLOWS = {
    LEAVE_BALANCE: {
        steps: ['employee_id'],
        execute: async (data) => {
            const emp = await fetchEmployee(data.employee_id);
            if (!emp) return { ok: false, message: `❌ Employee **${data.employee_id}** not found. Please check the ID and try again.` };
            const bal = await fetchLeaveBalance(data.employee_id);
            if (!bal) return { ok: false, message: `❌ No leave balance record found for ${data.employee_id}.` };
            return { ok: true, message: formatLeaveBalance(bal) };
        }
    },
    APPLY_LEAVE: {
        steps: ['employee_id', 'leave_type', 'start_date', 'end_date', 'reason', 'confirm'],
        execute: async (data) => {
            const start = new Date(data.start_date);
            const end = new Date(data.end_date);
            const total = Math.ceil(Math.abs(end - start) / 86400000) + 1;

            const leave = await Leave.create({
                employee_id: data.employee_id,
                leave_type: data.leave_type,
                start_date: new Date(data.start_date),
                end_date: new Date(data.end_date),
                total_days: total,
                reason: data.reason || 'Personal'
            });

            // ─── Notify Employee ───
            const empDoc = await Employee.findOne({ id: data.employee_id });
            if (empDoc) {
                await Notification.create({
                    recipient: empDoc._id,
                    type: 'leave',
                    title: 'Leave Application Submitted',
                    message: `Your ${data.leave_type} leave application (#${leave._id.toString().slice(-6)}) from ${data.start_date} to ${data.end_date} has been submitted.`,
                    data: { link: '/dashboard/leave', status: 'pending' }
                });
            }

            return {
                ok: true,
                message: `✅ **Leave Applied Successfully!**\n\n📋 Application ID: **#${leave._id}**\n📅 Dates: ${data.start_date} → ${data.end_date} (${total} day${total > 1 ? 's' : ''})\n🏷️ Type: ${data.leave_type} leave\n⏳ Status: **Pending HR Approval**\n\nYou'll receive a notification once approved. Is there anything else I can help you with?`
            };
        }
    },
    PAYSLIP: {
        steps: ['employee_id', 'month', 'year'],
        execute: async (data) => {
            const emp = await fetchEmployee(data.employee_id);
            if (!emp) return { ok: false, message: `❌ Employee **${data.employee_id}** not found.` };
            const payroll = await fetchPayroll(data.employee_id, data.month, data.year);
            if (!payroll) return { ok: false, message: `❌ No payroll record found for **${data.employee_id}** for ${getMonthName(data.month)} ${data.year}. Please verify the month and year.` };
            return { ok: true, message: formatPayslip(emp, payroll) };
        }
    },
    ATTENDANCE: {
        steps: ['employee_id', 'month', 'year'],
        execute: async (data) => {
            const records = await fetchAttendance(data.employee_id, data.month, data.year);
            if (records.length === 0) return { ok: false, message: `❌ No attendance records found for **${data.employee_id}** in ${getMonthName(data.month)} ${data.year}.` };
            return { ok: true, message: formatAttendanceSummary(records, data.month, data.year) };
        }
    },
    PROFILE: {
        steps: ['employee_id'],
        execute: async (data) => {
            const emp = await fetchEmployee(data.employee_id);
            if (!emp) return { ok: false, message: `❌ Employee **${data.employee_id}** not found.` };
            return {
                ok: true,
                message: `
👤 **Employee Profile**

| Field | Details |
|---|---|
| 🆔 Employee ID | **${emp.id}** |
| 👤 Name | **${emp.name}** |
| 📧 Email | ${emp.email} |
| 📱 Phone | ${emp.phone || 'N/A'} |
| 📅 DOB | ${emp.date_of_birth ? new Date(emp.date_of_birth).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'} |
| ⚧ Gender | ${emp.gender || 'N/A'} |
| 🏠 Address | ${emp.address || 'N/A'} |
| 💼 Designation | ${emp.designation || 'N/A'} |
| 🏢 Department | ${emp.department_name || 'N/A'} |
| 📅 Joining Date | ${emp.date_of_joining ? new Date(emp.date_of_joining).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A'} |
| 👥 Role | ${emp.role} |
| ✅ Status | ${emp.status} |

What else would you like to know?`
            };
        }
    },
    HELPDESK: {
        steps: ['employee_id', 'subject', 'description', 'confirm'],
        execute: async (data) => {
            const ticketNumber = `TKT-${new Date().getFullYear()}-${String(Date.now()).slice(-4)}`;
            const ticket = await Ticket.create({
                ticket_number: ticketNumber,
                employee_id: data.employee_id,
                subject: data.subject,
                description: data.description || '',
                category: 'general'
            });

            // ─── Notify Employee & HR Managers ───
            const empDoc = await Employee.findOne({ id: data.employee_id });
            if (empDoc) {
                // 1. Create for Employee
                await Notification.create({
                    recipient: empDoc._id,
                    type: 'ticket',
                    title: 'Support Ticket Raised',
                    message: `Your ticket **${ticketNumber}** regarding "${data.subject}" has been successfully submitted.`,
                    data: { link: '/dashboard/tickets', status: 'open' }
                });

                // 2. Notify all HR managers
                const hrManagers = await Employee.find({ role: 'hr_manager', status: 'active' });
                for (const hr of hrManagers) {
                    await Notification.create({
                        recipient: hr._id,
                        sender: empDoc._id,
                        type: 'ticket',
                        title: 'New Support Ticket',
                        message: `Employee **${empDoc.name}** raised a new ticket: **${data.subject}** (${ticketNumber})`,
                        data: { link: '/admin/tickets', status: 'open' }
                    });
                }
            }

            return {
                ok: true,
                message: `🎫 **Support Ticket Created!**\n\n📋 Ticket Number: **${ticketNumber}**\n📝 Subject: ${data.subject}\n⏰ Our HR team will respond within **24 hours**.\n\nIs there anything else I can help you with?`
            };
        }
    },
};

// ─── Step Prompt Generator ───────────────────────────────────
const getStepPrompt = (intent, step, data) => {
    const prompts = {
        LEAVE_BALANCE: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
        },
        APPLY_LEAVE: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
            leave_type: '🏷️ What type of leave would you like to apply?\n- **Casual** | **Sick** | **Earned** | **Maternity** | **Paternity** | **Unpaid**',
            start_date: '📅 What is the **start date** of your leave? (format: YYYY-MM-DD)',
            end_date: `📅 What is the **end date** of your leave? (or same as start date: ${data.start_date || 'YYYY-MM-DD'})`,
            reason: '📝 Please provide the **reason** for your leave (or type "skip" to skip):',
            confirm: `✅ **Confirm Leave Application:**\n- Employee: **${data.employee_id}**\n- Type: **${data.leave_type}**\n- From: **${data.start_date}** To: **${data.end_date}**\n- Reason: ${data.reason || 'Not specified'}\n\nType **YES** to confirm or **NO** to cancel.`,
        },
        PAYSLIP: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
            month: '📅 Which **month**? (e.g., January or 1)',
            year: '📅 Which **year**? (e.g., 2026)',
        },
        ATTENDANCE: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
            month: '📅 Which **month**? (e.g., February or 2)',
            year: '📅 Which **year**? (e.g., 2026)',
        },
        PROFILE: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
        },
        HELPDESK: {
            employee_id: '👤 Please provide your **Employee ID** (e.g., EMP001):',
            subject: '📝 Please briefly describe the **subject** of your issue:',
            description: '📋 Please provide more **details** about your issue (or type "skip"):',
            confirm: `✅ **Confirm Ticket Creation:**\n- Employee: **${data.employee_id}**\n- Subject: **${data.subject}**\n- Details: ${data.description || 'Not provided'}\n\nType **YES** to submit or **NO** to cancel.`,
        },
    };
    return prompts[intent]?.[step] || 'Please provide the required information:';
};

// ─── Main Copilot Processing Function ────────────────────────
const processMessage = async (message, sessionId, currentUser = null) => {
    const session = await getSession(sessionId);

    // Pre-fill employee_id for regular employees from their JWT token
    // so they never have to manually type their own ID
    if (currentUser && currentUser.role === 'employee') {
        if (!session.loggedInEmployeeId) {
            session.loggedInEmployeeId = currentUser.id; // The employee's own ID
        }
    }
    const entities = extractEntities(message);
    const lower = message.toLowerCase().trim();

    // ── Cancel / Reset ──
    if (['cancel', 'reset', 'start over', 'no'].includes(lower)) {
        await resetSession(sessionId);
        return {
            intent: 'RESET',
            message: '↩️ Operation cancelled. How else can I assist you? I can help with:\n- 🏖️ **Leave** (Balance/Apply)\n- 💰 **Payroll** (Payslips)\n- 📅 **Attendance** (Monthly Summary)\n- 🎫 **Support** (Raise Ticket)',
            suggestions: currentUser?.role === 'hr_manager' ? ['View Team Analytics', 'Check pending leaves', 'System status'] : ['Check leave balance', 'View payroll', 'Check attendance']
        };
    }

    // ── Active workflow in progress ──
    if (session.intent && session.step > 0) {
        const workflow = WORKFLOWS[session.intent];
        if (workflow) {
            const steps = workflow.steps;
            const currentStep = steps[session.step - 1];

            // Merge extracted entities
            Object.assign(session.data, entities);

            // Auto-fill employee_id for regular employees in active sessions too
            if (session.loggedInEmployeeId && !session.data.employee_id) {
                session.data.employee_id = session.loggedInEmployeeId;
            }

            // If current step is employee_id and we already have it (from auto-fill), skip ahead
            if (currentStep === 'employee_id' && session.data.employee_id) {
                session.step++;
                if (session.step > steps.length) {
                    try {
                        const result = await workflow.execute(session.data);
                        const savedIntent = session.intent;
                        await resetSession(sessionId);
                        return {
                            intent: savedIntent, action: 'executed',
                            message: result.message, success: result.ok,
                            suggestions: ['Check leave balance', 'View payslip', 'Raise support ticket', 'View attendance']
                        };
                    } catch (err) {
                        await resetSession(sessionId);
                        return { intent: 'ERROR', message: '❌ Error processing request. Please try again.', suggestions: [] };
                    }
                }
                const nextStepName = steps[session.step - 1];
                await saveSession(session);
                return {
                    intent: session.intent, action: 'collecting',
                    message: getStepPrompt(session.intent, nextStepName, session.data),
                    suggestions: []
                };
            }

            // Handle confirm step
            if (currentStep === 'confirm') {
                if (['yes', 'confirm', 'ok', 'sure', 'proceed', 'y'].some(w => lower.includes(w))) {
                    try {
                        const result = await workflow.execute(session.data);
                        const savedIntent = session.intent;
                        await resetSession(sessionId);
                        return {
                            intent: savedIntent,
                            action: 'executed',
                            message: result.message,
                            success: result.ok,
                            suggestions: ['Check leave balance', 'View my payslip', 'Raise support ticket', 'View attendance']
                        };
                    } catch (err) {
                        console.error('Workflow execution error:', err);
                        await resetSession(sessionId);
                        return { intent: 'ERROR', message: '❌ Sorry, I encountered an error processing your request. Please try again.', suggestions: [] };
                    }
                } else {
                    await resetSession(sessionId);
                    return { intent: 'CANCELLED', message: '↩️ Operation cancelled. Is there anything else I can help you with?', suggestions: ['Check leave balance', 'View payslip', 'Raise ticket'] };
                }
            }

            // Fill data from message for the current step
            if (currentStep === 'reason' || currentStep === 'description') {
                if (!lower.includes('skip')) {
                    session.data[currentStep] = message.trim();
                } else {
                    session.data[currentStep] = '';
                }
            } else if (currentStep === 'subject') {
                session.data.subject = message.trim();
            } else if (currentStep === 'leave_type') {
                if (!entities.leave_type) {
                    return {
                        intent: session.intent,
                        message: '❓ I didn\'t recognize that leave type. Please choose from:\n- **Casual** | **Sick** | **Earned** | **Maternity** | **Paternity** | **Unpaid**',
                        suggestions: ['Casual leave', 'Sick leave', 'Earned leave']
                    };
                }
            } else if (currentStep === 'month') {
                if (!entities.month) {
                    const numericMonth = parseInt(message.trim());
                    if (numericMonth >= 1 && numericMonth <= 12) session.data.month = numericMonth;
                    else return { intent: session.intent, message: '❓ Please enter a valid month (e.g., **January** or **1**):', suggestions: [] };
                }
            } else if (currentStep === 'year') {
                if (!entities.year) {
                    const numericYear = parseInt(message.trim());
                    if (numericYear >= 2020 && numericYear <= 2030) session.data.year = numericYear;
                    else return { intent: session.intent, message: '❓ Please enter a valid year (e.g., **2026**):', suggestions: [] };
                }
            } else if (currentStep === 'start_date' || currentStep === 'end_date') {
                if (!entities.start_date && !entities.end_date) {
                    return { intent: session.intent, message: '📅 Please enter the date in **YYYY-MM-DD** format (e.g., 2026-03-10):', suggestions: [] };
                }
            }

            // Advance step
            session.step++;
            if (session.step > steps.length) {
                // All steps collected — execute
                try {
                    const result = await workflow.execute(session.data);
                    const savedIntent = session.intent;
                    await resetSession(sessionId);
                    return {
                        intent: savedIntent, action: 'executed',
                        message: result.message, success: result.ok,
                        suggestions: ['Check leave balance', 'View payslip', 'Raise support ticket', 'View attendance']
                    };
                } catch (err) {
                    await resetSession(sessionId);
                    return { intent: 'ERROR', message: '❌ Error processing request. Please try again.', suggestions: [] };
                }
            }

            const nextStep = steps[session.step - 1];
            await saveSession(session);
            return {
                intent: session.intent,
                action: 'collecting',
                message: getStepPrompt(session.intent, nextStep, session.data),
                suggestions: []
            };
        }
    }

    // ── New intent detection ──
    const intent = detectIntent(message);

    // ── Greeting ──
    if (intent === 'GREETING' || intent === 'HELP') {
        const userName = currentUser?.name ? currentUser.name.split(' ')[0] : null;
        const greetingName = userName ? `, **${userName}**` : '';
        const roleName = currentUser?.role === 'hr_manager' ? 'HR Manager' : currentUser?.role === 'hr' ? 'HR' : 'Employee';

        let helpContent = `\n\nI'm your intelligent HR Assistant. As an **${roleName}**, you can ask me about:\n\n- 🏖️ **Leave** — check balance, apply leave\n- 💰 **Payroll** — view salary, download payslip\n- 📅 **Attendance** — view summary\n- 👤 **Profile** — see your details\n- 🎫 **Support** — raise helpdesk tickets`;

        if (currentUser?.role === 'hr_manager' || currentUser?.role === 'hr') {
            helpContent += `\n- 📊 **Management** — view team analytics & pending leaves`;
        }

        const msg = intent === 'GREETING'
            ? `Hello${greetingName}! 👋 Welcome to **HR Copilot**!${helpContent}`
            : `Here's what I can help you with:${helpContent}`;

        const suggestionsArr = currentUser?.role === 'hr_manager'
            ? ['View Team Analytics', 'Check pending leaves', 'View my profile']
            : ['Check leave balance', 'View my payslip', 'Raise support ticket'];

        return {
            intent,
            message: msg,
            suggestions: suggestionsArr
        };
    }

    // ── Goodbye ──
    if (intent === 'GOODBYE') {
        return {
            intent,
            message: '👋 Thank you for using **HR Copilot**! Have a great day! 😊\n\nFeel free to return anytime you need HR assistance.',
            suggestions: []
        };
    }

    // ── Policies ──
    if (intent === 'POLICIES') {
        return {
            intent,
            message: `📋 **Company Policies:**\n\nFor questions regarding office hours, leave entitlements, remote work policies, or employee benefits, please refer to the official employee handbook or reach out directly to the HR department via the **Support Tickets** module.`,
            suggestions: ['Check leave balance', 'Apply leave', 'Raise HR ticket']
        };
    }

    // ── Analytics (HR/Admin) ──
    if (intent === 'ANALYTICS') {
        try {
            const total = await Employee.countDocuments({ status: 'active' });
            const pending = await Leave.countDocuments({ status: 'pending' });
            const openTicketsCount = await Ticket.countDocuments({ status: 'open' });

            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date();
            endOfDay.setHours(23, 59, 59, 999);

            const presentToday = await Attendance.countDocuments({
                date: { $gte: startOfDay, $lte: endOfDay },
                status: 'present'
            });

            return {
                intent,
                message: `📊 **HRMS Analytics Dashboard**\n\n| Metric | Value |\n|---|---|\n| 👥 Active Employees | **${total}** |\n| ✅ Present Today | **${presentToday}** |\n| ⏳ Pending Leave Requests | **${pending}** |\n| 🎫 Open Support Tickets | **${openTicketsCount}** |\n\nWould you like a detailed attendance or payroll report?`,
                suggestions: ['View attendance report', 'View payroll report', 'Employee list']
            };
        } catch (err) {
            console.error('[Copilot Analytics]', err);
            return { intent, message: 'Unable to load analytics at this time.', suggestions: [] };
        }
    }

    // ── Helpdesk ──
    if (intent === 'HELPDESK') {
        session.intent = 'HELPDESK';
        session.step = 1;

        // For regular employees: pre-fill their ID and skip to next step
        if (session.loggedInEmployeeId) {
            session.data.employee_id = session.loggedInEmployeeId;
            session.step = 2; // Skip employee_id step
            await saveSession(session);
            return {
                intent,
                action: 'workflow_start',
                message: `🎫 I'll help you raise a support ticket!\n\n${getStepPrompt('HELPDESK', 'subject', session.data)}`,
                suggestions: []
            };
        }

        await saveSession(session);
        return {
            intent,
            action: 'workflow_start',
            message: `🎫 I understand your concern! I'll help you raise a support ticket.\n\n${getStepPrompt('HELPDESK', 'employee_id', {})}`,
            suggestions: []
        };
    }

    // ── Start workflow ──
    const workflowMap = {
        LEAVE_BALANCE: 'LEAVE_BALANCE',
        APPLY_LEAVE: 'APPLY_LEAVE',
        LEAVE_STATUS: 'LEAVE_BALANCE',
        PAYSLIP: 'PAYSLIP',
        ATTENDANCE: 'ATTENDANCE',
        PROFILE: 'PROFILE',
    };

    const workflowKey = workflowMap[intent];
    if (workflowKey) {
        const workflow = WORKFLOWS[workflowKey];
        const preData = { ...entities };
        const steps = workflow.steps;

        // For regular employees: auto-fill their own employee_id
        if (session.loggedInEmployeeId && !preData.employee_id) {
            preData.employee_id = session.loggedInEmployeeId;
        }

        // Find first missing step
        let firstMissingStep = 0;
        for (let i = 0; i < steps.length; i++) {
            if (!preData[steps[i]]) { firstMissingStep = i; break; }
            firstMissingStep = i + 1;
        }

        session.intent = workflowKey;
        session.data = preData;

        if (firstMissingStep >= steps.length) {
            // All data already available — execute
            try {
                const result = await workflow.execute(session.data);
                await resetSession(sessionId);
                return {
                    intent, action: 'executed',
                    message: result.message, success: result.ok,
                    suggestions: ['Apply leave', 'View payslip', 'Raise support ticket']
                };
            } catch (err) {
                await resetSession(sessionId);
                return { intent, message: '❌ Error. Please try again.', suggestions: [] };
            }
        }

        session.step = firstMissingStep + 1;
        await saveSession(session);
        return {
            intent, action: 'workflow_start',
            message: getStepPrompt(workflowKey, steps[firstMissingStep], preData),
            suggestions: []
        };
    }

    // ── Unknown ──
    return {
        intent: 'UNKNOWN',
        message: 'I cannot answer that.',
        suggestions: ['Check leave balance', 'View my payslip', 'Check attendance', 'Raise support ticket']
    };
};

module.exports = { processMessage };
