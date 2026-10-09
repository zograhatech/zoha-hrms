const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const connectDB = require('./config/db');

dotenv.config();
if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = 'hari_hrms_super_secret_key_2025';
}
if (!process.env.JWT_REFRESH_SECRET) {
    process.env.JWT_REFRESH_SECRET = 'hari_hrms_refresh_secret_2025';
}

const app = express();
const http = require('http');
const server = http.createServer(app);

// Socket.io: only meaningful in long-running Node; gracefully skip on Vercel
let io = null;
try {
    const { initSocket } = require('./socket');
    if (!process.env.VERCEL) {
        io = initSocket(server);
    } else {
        console.log('ℹ️ Real-time WebSockets (Socket.io) are disabled on Vercel environment.');
    }
} catch (e) {
    console.warn('⚠️ Socket.io failed to initialize (non-fatal):', e.message);
}

// Cron Jobs: not supported on Vercel serverless, skip them
try {
    if (!process.env.VERCEL) {
        const { initCronJobs } = require('./utils/cronJobs');
        initCronJobs();
    } else {
        console.log('💡 System is falling back to Web Push Notifications provided by Service Worker.');
    }
} catch (e) {
    console.warn('⚠️ Cron jobs failed to initialize (non-fatal):', e.message);
}

// ── Diagnostic Health Check (MUST BE FIRST) ──────────────────
app.get('/api/health', (req, res) => {
    const mongoose = require('mongoose');
    const dbStatus = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting', 4: 'uninitialized' };
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'not_set';
    const maskedUri = uri.replace(/\/\/(.*):(.*)@/, '//****:****@');

    res.json({
        success: true,
        message: '🚀 Hari HRMS API is running!',
        timestamp: new Date().toISOString(),
        database: {
            status: dbStatus[mongoose.connection.readyState] || 'unknown',
            name: mongoose.connection.name || 'none',
            readyState: mongoose.connection.readyState,
            uri_configured: uri !== 'not_set',
            uri_preview: maskedUri
        },
        environment_audit: {
            JWT_SECRET: !!process.env.JWT_SECRET,
            MONGO_URI: !!(process.env.MONGODB_URI || process.env.MONGO_URI),
            VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
            ZOOM_ENCRYPTION_KEY: !!process.env.ZOOM_ENCRYPTION_KEY
        },
        env: process.env.NODE_ENV,
        runtime: process.env.VERCEL ? 'Vercel Serverless' : 'Standard Node',
        memory: process.memoryUsage().rss
    });
});

// ── Database Initialization Logic ────────────────────────────
let dbInitializationPromise = null;

const initializeApp = async () => {
    if (dbInitializationPromise) return dbInitializationPromise;

    dbInitializationPromise = (async () => {
        try {
            console.log('--- Initializing Database Connection ---');
            await connectDB();
            console.log('--- Database Initialized Successfully ---');

            if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
                console.log('--- Starting Initial Seeding ---');
            }
            return true;
        } catch (err) {
            console.error('CRITICAL: Initial DB connection/seeding failed.');
            dbInitializationPromise = null; // Reset to allow retry on next request
            throw err;
        }
    })();

    return dbInitializationPromise;
};

app.use(async (req, res, next) => {
    // Skip for health check
    if (req.path === '/api/health') return next();

    try {
        await initializeApp();
        
        const mongoose = require('mongoose');
        if (mongoose.connection.readyState !== 1) {
            console.warn(`--- DB State is ${mongoose.connection.readyState} after init. Mongoose buffering will handle queries.`);
        }
        next();
    } catch (err) {
        res.status(503).json({
            success: false,
            message: 'Database initialization failed: ' + err.message,
            error: 'DB_INIT_FAILED'
        });
    }
});

// ── Middleware ─────────────────────────────────────────
const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://10.130.39.16:5173', // Current Local IP
    'https://hrms-delta-eight.vercel.app',
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            // Log rejection but don't crash
            console.log('CORS blocked origin:', origin);
            callback(null, false);
        }
    },
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files for uploads
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ─────────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/chat', require('./routes/chatRoutes')); // AI Copilot
app.use('/api/conversations', require('./routes/conversationRoutes'));
app.use('/api/messages', require('./routes/messageRoutes'));
app.use('/api/settings', require('./routes/settingRoutes'));
app.use('/api/shifts', require('./routes/shiftRoutes'));
app.use('/api/rotation-shifts', require('./routes/rotationShiftRoutes'));
app.use('/api/audit', require('./routes/auditRoutes'));
app.use('/api/onboarding', require('./routes/onboardingRoutes'));
app.use('/api/performance', require('./routes/performanceRoutes'));
app.use('/api/assets', require('./routes/assetRoutes'));
app.use('/api/recruitment', require('./routes/recruitmentRoutes'));
app.use('/api/announcements', require('./routes/announcementRoutes'));
app.use('/api/fun', require('./routes/funRoutes'));
app.use('/api/zoom', require('./modules/zoom/zoom.routes')); // Added Zoom Module
app.use('/api/notifications', require('./routes/notificationRoutes')); // Notification Module
app.use('/api/events', require('./routes/eventRoutes')); // Event Module
app.use('/api/payments', require('./routes/paymentRoutes')); // Payment/Marketplace Module
app.use('/api/notes', require('./routes/noteRoutes')); // Personal Notes
app.use('/api/resignations', require('./routes/resignationRoutes')); // Exit Management
app.use('/api/documents', require('./modules/documents/document.routes')); // Document Management Module

app.use('/api/lms', require('./routes/lmsRoutes')); // LMS Module
app.use('/api/tally', require('./routes/tallyRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/purchase', require('./routes/purchaseRoutes'));
app.use('/api/tax', require('./routes/taxRoutes'));
app.use('/api/banking', require('./routes/bankingRoutes'));
app.use('/api/verification', require('./routes/verificationRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));


// ── Routes ─────────────────────────────────────────────

// ── Global error handler ────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    
    // Specifically handle Mongoose/MongoDB connection errors for clearer frontend feedback
    if (err.name === 'MongooseServerSelectionError' || err.message.includes('buffering timed out')) {
        return res.status(503).json({ 
            success: false, 
            message: 'Database connection failed. Please check if your IP is whitelisted in MongoDB Atlas.',
            error: 'DB_CONNECTION_ERROR'
        });
    }

    res.status(500).json({ 
        success: false, 
        message: err.message || 'Internal server error.',
        error: err.name || 'SERVER_ERROR'
    });
});

app.use((req, res) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found.`,
        note: 'Make sure you are using the correct HTTP method (POST/GET) and that the URL is exact.'
    });
});

// ── Scheduled Jobs ─────────────────────────────────────
const cron = require('node-cron');
const FunSubmission = require('./models/FunSubmission');

// Run every Sunday at midnight (00:00)
cron.schedule('0 0 * * 0', async () => {
    try {
        console.log('--- Running Weekly Sunday Cleanup Job ---');
        const deleted = await FunSubmission.deleteMany({});
        console.log(`--- Automatically deleted ${deleted.deletedCount} items from FunChatbot ---`);
    } catch (err) {
        console.error('Failed to run Sunday cleanup job:', err);
    }
});

const PORT = process.env.PORT || 5000;
// CRITICAL: Never call .listen() on Vercel as it crashes the Serverless Function
if (!process.env.VERCEL && process.env.NODE_ENV !== 'production') {
    server.listen(PORT, '0.0.0.0', () => {
        const networkIP = '10.130.39.16';
        console.log(`\n  ╔ ══════════════════════════════════════╗`);
        console.log(`  ║    🚀  Hari HRMS Enterprise API    ║`);
        console.log(`  ║    Backend URL: http://localhost:${PORT}      ║`);
        console.log(`  ║    Network: http://${networkIP}:${PORT}   ║`);
        console.log(`  ╚══════════════════════════════════════╝\n`);
    });
}

module.exports = app;
