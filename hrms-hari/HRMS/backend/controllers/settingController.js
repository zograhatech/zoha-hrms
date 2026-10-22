const Setting = require('../models/Setting');
const { toISTDateString } = require('../utils/istDate');
const LeaveBalance = require('../models/LeaveBalance');
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const Notification = require('../models/Notification');
const { sendEmail, getTransporter } = require('../utils/emailService');
const nodemailer = require('nodemailer');

const getSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = await Setting.create({});
        }

        const obj = settings.toObject();

        if (obj.monthly_leave_allowance === undefined || obj.monthly_leave_allowance === null) {
            obj.monthly_leave_allowance = 1;
        }

        const isAdmin = req.user && ['admin', 'manager', 'team_lead', 'hr_manager', 'hr', 'hrmanager'].includes(req.user.role.toLowerCase());

        // Security: Remove sensitive email settings for regular employees / unauth
        if (!isAdmin) {
            delete obj.email_settings;
            // Also hide sensitive payroll / roles info if not admin
            delete obj.roles_permissions;
            delete obj.payroll_formulas;
        }

        res.json({ success: true, settings: obj });
    } catch (err) {
        console.error('[getSettings]', err);
        res.status(500).json({ success: false, message: 'Server error fetching settings.' });
    }
};

const getBranding = async (req, res) => {
    try {
        let settings = await Setting.findOne({}, 'company_name company_logo company_subtext');
        if (!settings) {
            settings = {
                company_name: process.env.COMPANY_NAME || 'HRMS',
                company_logo: '',
                company_subtext: 'HR Management System'
            };
        }
        res.json({ success: true, settings });
    } catch (err) {
        console.error('[getBranding]', err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

const updateSettings = async (req, res) => {
    try {
        let updateData = req.body;

        // If sent as FormData with a file, the text fields might be in a 'settings' key or just at req.body
        // We'll handle both cases.
        if (typeof updateData.settings === 'string') {
            updateData = JSON.parse(updateData.settings);
        }

        if (req.file || (req.files && (req.files['logo'] || req.files['qr_code']))) {
            const { uploadFromBuffer } = require('../utils/cloudinary');
            
            if (req.file) { // Single file fallback (legacy)
                const result = await uploadFromBuffer(req.file.buffer, 'company_branding', 'image');
                updateData.company_logo = result.secure_url;
            } else {
                if (req.files['logo']) {
                    const result = await uploadFromBuffer(req.files['logo'][0].buffer, 'company_branding', 'image');
                    updateData.company_logo = result.secure_url;
                }
                if (req.files['qr_code']) {
                    const result = await uploadFromBuffer(req.files['qr_code'][0].buffer, 'payment_branding', 'image');
                    updateData.payment_qr_code = result.secure_url;
                }
            }
        }

        let settings = await Setting.findOne({});
        if (!settings) settings = new Setting({});

        console.log('[updateSettings] Current roles in DB:', Object.keys(settings.roles_permissions || {}));
        console.log('[updateSettings] Received updateData roles:', Object.keys(updateData.roles_permissions || {}));

        // monthly_leave_allowance: SuperAdmin only, non-negative whole integer check before any writes
        if (updateData.monthly_leave_allowance !== undefined) {
            const userRole = (req.user?.role || '').toLowerCase();
            if (userRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only SuperAdmin can edit monthly_leave_allowance.'
                });
            }
            const rawVal = updateData.monthly_leave_allowance;
            if (rawVal === null || typeof rawVal === 'boolean' || (typeof rawVal === 'string' && rawVal.trim() === '')) {
                return res.status(400).json({
                    success: false,
                    message: 'monthly_leave_allowance must be a non-negative whole integer.'
                });
            }
            const allowanceVal = Number(rawVal);
            if (!Number.isInteger(allowanceVal) || allowanceVal < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'monthly_leave_allowance must be a non-negative whole integer.'
                });
            }
            settings.monthly_leave_allowance = allowanceVal;
        }

        // Explicitly update fields to ensure Mongoose tracks changes
        if (updateData.company_name) settings.company_name = updateData.company_name;
        if (updateData.company_subtext) settings.company_subtext = updateData.company_subtext;
        if (updateData.company_logo) settings.company_logo = updateData.company_logo;
        if (updateData.company_address) settings.company_address = updateData.company_address;
        if (updateData.company_email) settings.company_email = updateData.company_email;
        if (updateData.company_phone) settings.company_phone = updateData.company_phone;
        if (updateData.company_gstin !== undefined) settings.company_gstin = updateData.company_gstin;

        if (updateData.leave_policies) {
            settings.leave_policies = updateData.leave_policies;
            settings.markModified('leave_policies');

            const currentYear = new Date().getFullYear();
            const newPolicies = updateData.leave_policies;

            console.log('[updateSettings] Leave Balance Sync for Year', currentYear);

            // Fetch all balances for current year
            const allBalances = await LeaveBalance.find({ year: currentYear });
            
            for (const bal of allBalances) {
                // Sum approved days for this employee in current year
                const approvedLeaves = await Leave.find({
                    employee_id: bal.employee_id,
                    status: 'approved',
                    start_date: {
                        $gte: new Date(currentYear, 0, 1),
                        $lte: new Date(currentYear, 11, 31, 23, 59, 59)
                    }
                });

                const usedMapping = { casual_leave: 0, sick_leave: 0, earned_leave: 0, maternity_leave: 0, paternity_leave: 0 };
                approvedLeaves.forEach(l => {
                    const key = `${l.leave_type}_leave`;
                    if (usedMapping[key] !== undefined) {
                        const istDate = toISTDateString(l.start_date);
                        const isNewRule = istDate >= '2026-10-01';
                        const effectiveUsed = isNewRule ? (l.free_days ?? 0) : (l.total_days || 0);
                        usedMapping[key] += effectiveUsed;
                    }
                });

                await LeaveBalance.updateOne(
                    { _id: bal._id },
                    {
                        $set: {
                            casual_leave: Math.max(0, (newPolicies.casual_leave ?? 12) - usedMapping.casual_leave),
                            sick_leave: Math.max(0, (newPolicies.sick_leave ?? 12) - usedMapping.sick_leave),
                            earned_leave: Math.max(0, (newPolicies.earned_leave ?? 15) - usedMapping.earned_leave),
                            maternity_leave: Math.max(0, (newPolicies.maternity_leave ?? 0) - usedMapping.maternity_leave),
                            paternity_leave: Math.max(0, (newPolicies.paternity_leave ?? 0) - usedMapping.paternity_leave)
                        }
                    }
                );
            }
            console.log(`[updateSettings] Sync complete for ${allBalances.length} employees.`);
        }
        if (updateData.attendance_settings) {
            settings.attendance_settings = updateData.attendance_settings;
            settings.markModified('attendance_settings');
        }
        if (updateData.email_settings) {
            settings.email_settings = updateData.email_settings;
            settings.markModified('email_settings');
        }
        if (updateData.payroll_formulas) {
            settings.payroll_formulas = updateData.payroll_formulas;
            settings.markModified('payroll_formulas');
        }
        if (updateData.roles_permissions) {
            settings.roles_permissions = updateData.roles_permissions;
            settings.markModified('roles_permissions');
            console.log('[updateSettings] Marked roles_permissions as modified');
        }

        if (updateData.payment_qr_code !== undefined) settings.payment_qr_code = updateData.payment_qr_code;
        if (updateData.module_pricing) {
            settings.module_pricing = updateData.module_pricing;
            settings.markModified('module_pricing');
        }

        let emailVerificationFlagChanged = false;
        let twofaFlagChanged = false;
        let pilotListChanged = false;

        if (updateData.require_email_verification !== undefined) {
            const nextVal = Boolean(updateData.require_email_verification);
            if (nextVal !== settings.require_email_verification) {
                emailVerificationFlagChanged = true;
            }
            settings.require_email_verification = nextVal;
        }

        if (updateData.require_2fa !== undefined) {
            const nextVal = Boolean(updateData.require_2fa);
            if (nextVal !== settings.require_2fa) {
                twofaFlagChanged = true;
            }
            settings.require_2fa = nextVal;
        }

        if (updateData.security_pilot_employee_ids !== undefined) {
            let pilots = [];
            if (Array.isArray(updateData.security_pilot_employee_ids)) {
                pilots = updateData.security_pilot_employee_ids.map(id => String(id).trim()).filter(Boolean);
            } else if (typeof updateData.security_pilot_employee_ids === 'string') {
                pilots = updateData.security_pilot_employee_ids.split(',').map(id => id.trim()).filter(Boolean);
            }
            settings.security_pilot_employee_ids = pilots;
            settings.markModified('security_pilot_employee_ids');
            pilotListChanged = true;
        }

        if (updateData.enable_browser_push !== undefined) {
            settings.enable_browser_push = Boolean(updateData.enable_browser_push);
        }

        if (updateData.push_pilot_employee_ids !== undefined) {
            let pushPilots = [];
            if (Array.isArray(updateData.push_pilot_employee_ids)) {
                pushPilots = updateData.push_pilot_employee_ids.map(id => String(id).trim()).filter(Boolean);
            } else if (typeof updateData.push_pilot_employee_ids === 'string') {
                pushPilots = updateData.push_pilot_employee_ids.split(',').map(id => id.trim()).filter(Boolean);
            }
            settings.push_pilot_employee_ids = pushPilots;
            settings.markModified('push_pilot_employee_ids');
        }

        if (updateData.idle_auto_clockout_enabled !== undefined) {
            settings.idle_auto_clockout_enabled = Boolean(updateData.idle_auto_clockout_enabled);
        }

        if (updateData.idle_timeout_minutes !== undefined) {
            const timeout = Number(updateData.idle_timeout_minutes);
            if (isNaN(timeout) || timeout < 1 || timeout > 240) {
                return res.status(400).json({
                    success: false,
                    message: 'idle_timeout_minutes must be a number between 1 and 240.'
                });
            }
            settings.idle_timeout_minutes = timeout;
        }

        if (updateData.idle_exempt_employee_ids !== undefined) {
            let exemptEmps = [];
            if (Array.isArray(updateData.idle_exempt_employee_ids)) {
                exemptEmps = updateData.idle_exempt_employee_ids.map(id => String(id).trim()).filter(Boolean);
            } else if (typeof updateData.idle_exempt_employee_ids === 'string') {
                exemptEmps = updateData.idle_exempt_employee_ids.split(',').map(id => id.trim()).filter(Boolean);
            }
            if (exemptEmps.length > 500) exemptEmps = exemptEmps.slice(0, 500);
            settings.idle_exempt_employee_ids = exemptEmps;
            settings.markModified('idle_exempt_employee_ids');
        }

        if (updateData.idle_exempt_app_names !== undefined) {
            let exemptApps = [];
            if (Array.isArray(updateData.idle_exempt_app_names)) {
                exemptApps = updateData.idle_exempt_app_names.map(name => String(name).trim()).filter(Boolean);
            } else if (typeof updateData.idle_exempt_app_names === 'string') {
                exemptApps = updateData.idle_exempt_app_names.split(',').map(name => name.trim()).filter(Boolean);
            }
            if (exemptApps.length > 500) exemptApps = exemptApps.slice(0, 500);
            settings.idle_exempt_app_names = exemptApps;
            settings.markModified('idle_exempt_app_names');
        }

        if (updateData.companion_download_url !== undefined) {
            const userRole = (req.user?.role || '').toLowerCase();
            if (userRole !== 'admin') {
                return res.status(403).json({
                    success: false,
                    message: 'Only SuperAdmin can edit companion_download_url.'
                });
            }
            const rawUrl = String(updateData.companion_download_url).trim();
            if (rawUrl !== '') {
                try {
                    const parsedUrl = new URL(rawUrl);
                    if (parsedUrl.protocol !== 'https:') {
                        return res.status(400).json({
                            success: false,
                            message: 'companion_download_url must be a valid https:// URL or empty.'
                        });
                    }
                } catch (_) {
                    return res.status(400).json({
                        success: false,
                        message: 'companion_download_url must be a valid https:// URL or empty.'
                    });
                }
            }
            settings.companion_download_url = rawUrl;
        }

        const savedSettings = await settings.save();
        console.log('[updateSettings] Saved roles in DB:', Object.keys(savedSettings.roles_permissions || {}));

        // Log security settings changes to AuditLog
        if (req.user && (emailVerificationFlagChanged || twofaFlagChanged || pilotListChanged)) {
            try {
                const AuditLog = require('../models/AuditLog');
                await AuditLog.create({
                    user_id: req.user._id || req.user.id,
                    action: 'UPDATE',
                    resource: 'SecuritySettings',
                    new_value: {
                        require_email_verification: savedSettings.require_email_verification,
                        require_2fa: savedSettings.require_2fa,
                        security_pilot_employee_ids: savedSettings.security_pilot_employee_ids
                    },
                    ip_address: req.ip,
                    user_agent: req.headers['user-agent']
                });
            } catch (auditErr) {
                console.error('[updateSettings] AuditLog creation failed:', auditErr.message);
            }
        }

        // Send notifications and emails if feature flags were changed
        if (emailVerificationFlagChanged || twofaFlagChanged) {
            (async () => {
                try {
                    const admins = await Employee.find({ role: 'admin', status: 'active' }).select('_id email name').lean();
                    const flagChanges = [];
                    if (emailVerificationFlagChanged) {
                        flagChanges.push(`Email Verification requirement is now ${savedSettings.require_email_verification ? 'ENABLED' : 'DISABLED'}`);
                    }
                    if (twofaFlagChanged) {
                        flagChanges.push(`Two-Factor Authentication (2FA) requirement is now ${savedSettings.require_2fa ? 'ENABLED' : 'DISABLED'}`);
                    }
                    const summaryText = flagChanges.join('; ');

                    for (const adm of admins) {
                        // In-app notification for admin
                        try {
                            await Notification.create({
                                recipient: adm._id,
                                type: 'general',
                                title: 'Security Settings Updated',
                                message: summaryText
                            });
                        } catch (notifErr) {
                            console.error('[updateSettings] In-app notification error for admin', adm._id, notifErr.message);
                        }

                        // Email notification for admin
                        if (adm.email) {
                            try {
                                await sendEmail({
                                    to: adm.email,
                                    subject: 'Security Settings Updated',
                                    text: `Hello ${adm.name || ''},\n\nSecurity settings have been updated:\n${summaryText}\n\nRegards,\n${savedSettings.company_name || 'HRMS'}`
                                });
                            } catch (mailErr) {
                                console.error('[updateSettings] Email error for admin', adm.email, mailErr.message);
                            }
                        }
                    }

                    // Also: when require_email_verification is turned ON, unverified users get an in-app Notification for verification required
                    if (emailVerificationFlagChanged && savedSettings.require_email_verification) {
                        const unverifiedEmployees = await Employee.find({ status: 'active', emailVerified: { $ne: true } }).select('_id email name').lean();
                        for (const emp of unverifiedEmployees) {
                            try {
                                await Notification.create({
                                    recipient: emp._id,
                                    type: 'general',
                                    title: 'Email Verification Required',
                                    message: 'Please verify your email address to continue accessing your account features.'
                                });
                            } catch (e) {
                                console.error('[updateSettings] Unverified user notification error:', e.message);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[updateSettings] Flag change notification error:', e);
                }
            })();
        }

        res.json({ success: true, message: 'Settings updated successfully.', settings: savedSettings });
    } catch (err) {
        console.error('[updateSettings]', err);
        res.status(500).json({ success: false, message: 'Server error updating settings.' });
    }
};

const sendTestEmail = async (req, res) => {
    try {
        const currentSetting = await Setting.findOne();
        const savedEmail = currentSetting?.email_settings || {};

        let mail_host = req.body?.mail_host || savedEmail.mail_host;
        let mail_port = req.body?.mail_port || savedEmail.mail_port;
        let mail_username = req.body?.mail_username || savedEmail.mail_username;
        let mail_password = req.body?.mail_password || savedEmail.mail_password;
        let mail_encryption = req.body?.mail_encryption || savedEmail.mail_encryption;
        let mail_from_email = req.body?.mail_from_email || savedEmail.mail_from_email;
        let mail_from_name = req.body?.mail_from_name || savedEmail.mail_from_name || 'HRMS';

        if (mail_host) mail_host = mail_host.trim().toLowerCase().replace(/^stmp\./, 'smtp.');
        if (mail_username && typeof mail_username === 'string') mail_username = mail_username.trim();
        if (mail_password && typeof mail_password === 'string') mail_password = mail_password.trim();

        if (!mail_host || !mail_username || !mail_password || !mail_from_email) {
            return res.status(400).json({ success: false, message: 'SMTP Host, Username, Password, and From Email are required.' });
        }

        const transporter = getTransporter({
            mail_host,
            mail_port,
            mail_username,
            mail_password,
            mail_encryption
        });

        if (!transporter) {
            return res.status(400).json({ success: false, message: 'Invalid SMTP configuration. Host, Username and Password are required.' });
        }

        const companyName = currentSetting?.company_name || process.env.COMPANY_NAME || 'HRMS';

        const info = await transporter.sendMail({
            from: `"${mail_from_name}" <${mail_from_email}>`,
            to: mail_from_email, // Send to self for testing
            subject: `${companyName} - Test SMTP Connection`,
            text: 'Success! Your HRMS email configuration is working correctly.',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6366f1; margin-top: 0;">🚀 Connection Success!</h2>
                    <p>Hello,</p>
                    <p>This is a test email from your <b>${companyName}</b> enterprise platform.</p>
                    <p>Your SMTP settings have been verified and are ready for use. You can now use this configuration for system notifications and alerts.</p>
                    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 0.9em;">
                        <strong>Configuration Verified:</strong><br/>
                        Host: ${mail_host}<br/>
                        Port: ${mail_port}<br/>
                        Encryption: ${mail_encryption}
                    </div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <small style="color: #999;">This is an automated system message from ${companyName}. Please do not reply.</small>
                </div>
            `
        });

        res.json({ success: true, message: 'Test email sent successfully to ' + mail_from_email });
    } catch (err) {
        console.error('[sendTestEmail]', err);
        let errorMessage = err.message;

        if (err.code === 'EAUTH') {
            errorMessage = 'Authentication failed. Please verify your username and password. If using Gmail, ensure you use an "App Password" and not your account password.';
        } else if (err.code === 'ESOCKET') {
            errorMessage = 'Connection failed. Please check your SMTP Host, Port, and Encryption settings.';
        }

        res.status(500).json({ success: false, message: 'Failed to send test email: ' + errorMessage });
    }
};

module.exports = { getSettings, updateSettings, sendTestEmail, getBranding };
