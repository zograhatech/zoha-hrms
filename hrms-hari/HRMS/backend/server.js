const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const dns = require('node:dns');
const http = require('http');
const path = require('path');

dns.setDefaultResultOrder('ipv4first');
dotenv.config();

const connectDB = require('./config/db');

// ── Environment Checks ───────────────────────────────────
if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    if (!process.env.JWT_SECRET) {
        console.error('CRITICAL: JWT_SECRET environment variable is missing.');
    }

    if (!process.env.JWT_REFRESH_SECRET) {
        console.error('CRITICAL: JWT_REFRESH_SECRET environment variable is missing.');
    }
} else {
    if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = 'dev_jwt_secret_hrms_local_only';
    }

    if (!process.env.JWT_REFRESH_SECRET) {
        process.env.JWT_REFRESH_SECRET = 'dev_jwt_refresh_secret_hrms_local_only';
    }
}

// ── Express App ──────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────────────────
let io = null;

try {
    const { initSocket } = require('./socket');

    if (!process.env.VERCEL) {
        io = initSocket(server);
    } else {
        console.log(
            'Real-time WebSockets are disabled on Vercel serverless.'
        );
    }
} catch (e) {
    console.warn('Socket.io initialization warning:', e.message);
}

// ── CORS CONFIGURATION ───────────────────────────────────
// IMPORTANT: CORS must be before health routes,
// database initialization middleware, and API routes.

const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://10.130.39.16:5173',

    // Production frontend, if this is your actual frontend:
    'https://hrms-delta-eight.vercel.app',

    // Current frontend preview domain:
    'https://zoha-hrms-cwie-git-main-zograha.vercel.app',
];

// Add FRONTEND_URL in backend Vercel environment variables
// if you want to configure another specific frontend origin.
if (process.env.FRONTEND_URL) {
    const frontendUrl = process.env.FRONTEND_URL
        .trim()
        .replace(/\/+$/, '');

    if (!allowedOrigins.includes(frontendUrl)) {
        allowedOrigins.push(frontendUrl);
    }
}

const corsOptions = {
    origin: (origin, callback) => {
        // Requests without an Origin header, such as health
        // checks and server-to-server requests, are allowed.
        if (!origin) {
            return callback(null, true);
        }

        // Allow explicitly configured frontend origins.
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        // Allow HTTPS Vercel deployment domains.
        // For stricter production security, replace this
        // with an explicit list of trusted deployment origins.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
            return callback(null, true);
        }

        console.warn('CORS blocked origin:', origin);

        return callback(new Error('Origin not allowed by CORS'));
    },

    methods: [
        'GET',
        'POST',
        'PUT',
        'PATCH',
        'DELETE',
        'OPTIONS'
    ],

    allowedHeaders: [
        'Content-Type',
        'Authorization'
    ],

    credentials: true,
    optionsSuccessStatus: 204
};

// Register CORS FIRST so OPTIONS requests are handled before
// database initialization and authentication routes.
app.use(cors(corsOptions));

// ── Body Parsers ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Diagnostic Health Check ──────────────────────────────
app.get(['/', '/health', '/api/health'], (req, res) => {
    const mongoose = require('mongoose');

    const dbStatus = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
        4: 'uninitialized'
    };

    const hasMongoUri = !!(
        process.env.MONGODB_URI ||
        process.env.MONGO_URI
    );

    res.json({
        success: true,
        message: 'Hari HRMS API is running!',
        timestamp: new Date().toISOString(),

        database: {
            status:
                dbStatus[mongoose.connection.readyState] || 'unknown',
            name: mongoose.connection.name || 'none',
            readyState: mongoose.connection.readyState,
            configured: hasMongoUri
        },

        environment_audit: {
            JWT_SECRET: !!process.env.JWT_SECRET,
            MONGO_URI: hasMongoUri,
            VAPID_PUBLIC_KEY: !!process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: !!process.env.VAPID_PRIVATE_KEY,
            ZOOM_ENCRYPTION_KEY: !!process.env.ZOOM_ENCRYPTION_KEY
        },

        env: process.env.NODE_ENV || 'development',
        runtime: process.env.VERCEL
            ? 'Vercel Serverless'
            : 'Standard Node'
    });
});

// ── Database Initialization ──────────────────────────────
let dbInitializationPromise = null;

const initializeApp = async () => {
    const mongoose = require('mongoose');

    if (mongoose.connection.readyState === 1) {
        return true;
    }

    if (dbInitializationPromise) {
        return dbInitializationPromise;
    }

    dbInitializationPromise = (async () => {
        try {
            console.log('Initializing database connection...');

            await connectDB();

            console.log('Database initialized successfully.');

            return true;
        } catch (err) {
            console.error(
                'Database initialization failed:',
                err.message
            );

            dbInitializationPromise = null;

            throw err;
        }
    })();

    return dbInitializationPromise;
};

// CORS is already registered above this middleware.
// Therefore, database errors will still include CORS headers.
app.use(async (req, res, next) => {
    try {
        await initializeApp();
        return next();
    } catch (err) {
        return res.status(503).json({
            success: false,
            message: 'Database initialization failed.',
            error: 'DB_INIT_FAILED'
        });
    }
});

// ── Static Uploads ────────────────────────────────────────
app.use(
    '/uploads',
    express.static(path.join(__dirname, 'uploads'))
);

// ── API Routes ───────────────────────────────────────────
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/payroll', require('./routes/payrollRoutes'));
app.use('/api/tickets', require('./routes/ticketRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
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
app.use('/api/zoom', require('./modules/zoom/zoom.routes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/events', require('./routes/eventRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/notes', require('./routes/noteRoutes'));
app.use('/api/resignations', require('./routes/resignationRoutes'));
app.use('/api/documents', require('./modules/documents/document.routes'));
app.use('/api/lms', require('./routes/lmsRoutes'));
app.use('/api/tally', require('./routes/tallyRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/purchase', require('./routes/purchaseRoutes'));
app.use('/api/tax', require('./routes/taxRoutes'));
app.use('/api/banking', require('./routes/bankingRoutes'));
app.use('/api/verification', require('./routes/verificationRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));

// ── Global Error Handler ─────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    if (
        err.name === 'MongooseServerSelectionError' ||
        err.message?.includes('buffering timed out')
    ) {
        return res.status(503).json({
            success: false,
            message:
                'Database connection failed. Check your MongoDB Atlas configuration and network access.',
            error: 'DB_CONNECTION_ERROR'
        });
    }

    return res.status(500).json({
        success: false,
        message: err.message || 'Internal server error.',
        error: err.name || 'SERVER_ERROR'
    });
});

// ── 404 Handler ──────────────────────────────────────────
app.use((req, res) => {
    console.warn(
        `404 Not Found: ${req.method} ${req.originalUrl}`
    );

    res.status(404).json({
        success: false,
        message: `Route ${req.method} ${req.originalUrl} not found.`,
        note:
            'Check the API URL, HTTP method, and route configuration.'
    });
});

// ── Scheduled Jobs ───────────────────────────────────────
try {
    if (!process.env.VERCEL) {
        const cron = require('node-cron');
        const FunSubmission = require('./models/FunSubmission');

        cron.schedule('0 0 * * 0', async () => {
            try {
                console.log('Running weekly FunChatbot cleanup...');

                const deleted = await FunSubmission.deleteMany({});

                console.log(
                    `Deleted ${deleted.deletedCount} FunChatbot submissions.`
                );
            } catch (err) {
                console.error(
                    'Weekly cleanup job failed:',
                    err.message
                );
            }
        });
    } else {
        console.log(
            'Scheduled cleanup is disabled on Vercel serverless.'
        );
    }
} catch (err) {
    console.warn('Cron initialization warning:', err.message);
}

// ── Start Server Locally ──────────────────────────────────
const PORT = process.env.PORT || 5000;

// Vercel imports this Express app as a serverless handler.
// Do not call listen() on Vercel.
if (require.main === module && !process.env.VERCEL) {
    server.listen(PORT, '0.0.0.0', () => {
        console.log('Hari HRMS API started.');
        console.log(`Backend URL: http://localhost:${PORT}`);
    });
}

module.exports = app;
