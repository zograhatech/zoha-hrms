const nodemailer = require('nodemailer');
const Setting = require('../models/Setting');

/**
 * Robust Email Service for Hari Hrms
 * Fetches latest SMTP settings from database and sends formatted emails.
 */
const sendEmail = async ({ to, subject, text, html }) => {
    try {
        const settings = await Setting.findOne();
        if (!settings || !settings.email_settings || !settings.email_settings.mail_host) {
            console.error('Email settings not configured in Admin Settings.');
            return false;
        }

const {
            mail_host, mail_port, mail_username, mail_password,
            mail_encryption, mail_from_email, mail_from_name
        } = settings.email_settings;

        const companyName = settings.company_name || 'HRMS';
        
        const port = process.env.PORT || 5001;
        const baseUrl = process.env.VERCEL || process.env.NODE_ENV === 'production' 
            ? 'https://hrms-delta-eight.vercel.app' 
            : `http://localhost:${port}`;
            
        let companyLogo = settings.company_logo || null;
        if (companyLogo && !companyLogo.startsWith('http') && !companyLogo.startsWith('data:')) {
            companyLogo = `${baseUrl}${companyLogo.startsWith('/') ? '' : '/'}${companyLogo}`;
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
            to,
            subject,
            text,
            attachments: Array.isArray(arguments[0].attachments) ? arguments[0].attachments : [],
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #eee; border-radius: 12px; overflow: hidden;">
                    <div style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 30px; text-align: center; color: white;">
                        ${companyLogo ? `<img src="${companyLogo}" alt="${companyName} Logo" style="max-height: 60px; margin-bottom: 15px; border-radius: 4px;" />` : ''}
                        <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px; text-transform: uppercase;">${companyName}</h1>
                    </div>
                    <div style="padding: 30px; line-height: 1.6;">
                        ${html}
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; font-size: 12px; color: #888; text-align: center;">
                            <p>This is an automated notification from ${companyName}.<br>Please do not reply to this email.</p>
                            <p>&copy; ${new Date().getFullYear()} ${companyName}</p>
                        </div>
                    </div>
                </div>
            `
        });

        console.log('Notification Email Sent:', info.messageId);
        return true;
    } catch (err) {
        console.error('Email Service Error:', err);
        return false;
    }
};

module.exports = { sendEmail };
