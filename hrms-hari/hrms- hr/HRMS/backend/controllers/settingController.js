const Setting = require('../models/Setting');
const LeaveBalance = require('../models/LeaveBalance');
const Leave = require('../models/Leave');
const nodemailer = require('nodemailer');

const getSettings = async (req, res) => {
    try {
        let settings = await Setting.findOne();
        if (!settings) {
            settings = await Setting.create({});
        }

        const obj = settings.toObject();

        const isAdmin = req.user && ['admin', 'hr_manager', 'hr', 'hrmanager'].includes(req.user.role.toLowerCase());

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
                company_name: 'Hari Hrms', 
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
                        usedMapping[key] += (l.total_days || 0);
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

        const savedSettings = await settings.save();
        console.log('[updateSettings] Saved roles in DB:', Object.keys(savedSettings.roles_permissions || {}));

        res.json({ success: true, message: 'Settings updated successfully.', settings: savedSettings });
    } catch (err) {
        console.error('[updateSettings]', err);
        res.status(500).json({ success: false, message: 'Server error updating settings.' });
    }
};

const sendTestEmail = async (req, res) => {
    try {
        let { mail_host, mail_port, mail_username, mail_password, mail_encryption, mail_from_email, mail_from_name } = req.body;

        if (mail_host) mail_host = mail_host.trim().toLowerCase().replace(/^stmp\./, 'smtp.');
        if (mail_username) mail_username = mail_username.trim();
        if (mail_password) mail_password = mail_password.trim();

        if (!mail_host || !mail_username || !mail_password) {
            return res.status(400).json({ success: false, message: 'SMTP Host, Username and Password are required.' });
        }

        const isGmail = mail_host.includes('gmail.com') || mail_host.includes('googlemail.com');

        const transportConfig = {
            host: isGmail ? undefined : mail_host,
            port: isGmail ? undefined : parseInt(mail_port),
            secure: isGmail ? undefined : (mail_encryption === 'ssl' || mail_port === '465'),
            service: isGmail ? 'gmail' : undefined,
            auth: {
                user: mail_username,
                pass: mail_password
            },
            tls: {
                rejectUnauthorized: false
            }
        };

        const transporter = nodemailer.createTransport(transportConfig);

        const info = await transporter.sendMail({
            from: `"${mail_from_name}" <${mail_from_email}>`,
            to: mail_from_email, // Send to self for testing
            subject: 'Hari Hrms - Test SMTP Connection',
            text: 'Success! Your HRMS email configuration is working correctly.',
            html: `
                <div style="font-family: sans-serif; padding: 20px; border: 1px solid #ddd; border-radius: 10px; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6366f1; margin-top: 0;">🚀 Connection Success!</h2>
                    <p>Hello,</p>
                    <p>This is a test email from your <b>Hari Hrms</b> enterprise platform.</p>
                    <p>Your SMTP settings have been verified and are ready for use. You can now use this configuration for system notifications and alerts.</p>
                    <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin: 20px 0; font-size: 0.9em;">
                        <strong>Configuration Verified:</strong><br/>
                        Host: ${mail_host}<br/>
                        Port: ${mail_port}<br/>
                        Encryption: ${mail_encryption}
                    </div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                    <small style="color: #999;">This is an automated system message from Hari Hrms. Please do not reply.</small>
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
