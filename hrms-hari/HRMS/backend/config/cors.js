/**
 * CORS Configuration
 * 
 * Supports:
 * 1. FRONTEND_URL, CLIENT_URL, CORS_ORIGIN (existing production origins)
 * 2. ALLOWED_ORIGINS (comma-separated list of additional origins)
 * 3. Strict regex for Vercel preview deployments of zoha-hrms-cwie:
 *    Matches:
 *      https://zoha-hrms-cwie-git-feature-chat-status-sync-zograha.vercel.app
 *      https://zoha-hrms-cwie-*.vercel.app
 *      https://zoha-hrms-cwie.vercel.app
 *      https://zoha-hrms-cwie-zograha.vercel.app
 * 4. http://localhost:* and http://127.0.0.1:* for local development (only when NODE_ENV !== 'production')
 * 
 * Rules:
 * - Never use '*' with credentials
 * - Echo back only the matching origin
 * - Ensure Vary: Origin is present on all responses
 */

// Regex for Vercel preview and deployment domains of zoha-hrms-cwie
const VERCEL_PREVIEW_REGEX = /^https:\/\/zoha-hrms-cwie(?:-git-[a-z0-9-]+)?(?:-[a-z0-9]+)?(?:-zograha)?\.vercel\.app$/i;

// Regex for local development (localhost / 127.0.0.1 on any port)
const LOCALHOST_REGEX = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

const getStaticAllowedOrigins = () => {
    const origins = [];
    const envVars = [
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
        process.env.CORS_ORIGIN,
        process.env.ALLOWED_ORIGINS
    ];

    for (const val of envVars) {
        if (val) {
            const parsed = val.split(',')
                .map(u => u.trim().replace(/\/+$/, ''))
                .filter(Boolean);
            for (const url of parsed) {
                if (!origins.includes(url)) {
                    origins.push(url);
                }
            }
        }
    }

    return origins;
};

const isOriginAllowed = (origin) => {
    if (!origin) return false;
    const cleanOrigin = origin.trim().replace(/\/+$/, '');

    // 1. Static allowlist from environment variables
    const staticOrigins = getStaticAllowedOrigins();
    if (staticOrigins.includes(cleanOrigin)) {
        return true;
    }

    // 2. Vercel preview domain pattern for zoha-hrms-cwie
    if (VERCEL_PREVIEW_REGEX.test(cleanOrigin)) {
        return true;
    }

    // 3. Localhost origins (dev only when NODE_ENV is not production)
    const isProduction = process.env.NODE_ENV === 'production';
    if (!isProduction && LOCALHOST_REGEX.test(cleanOrigin)) {
        return true;
    }

    return false;
};

const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
        if (!origin) {
            return callback(null, true);
        }

        if (isOriginAllowed(origin)) {
            // Echo back only the matching origin (never '*')
            return callback(null, origin);
        }

        // Unlisted origin: pass false so no Access-Control-Allow-Origin header is set
        callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept',
        'X-Requested-With',
        'Origin',
        'Cache-Control',
        'Pragma',
        'Expires'
    ],
    exposedHeaders: ['Content-Length', 'ETag', 'Cache-Control'],
    optionsSuccessStatus: 204,
    maxAge: 86400
};

module.exports = {
    isOriginAllowed,
    getStaticAllowedOrigins,
    corsOptions
};
