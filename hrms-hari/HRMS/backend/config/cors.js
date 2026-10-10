const getAllowedOrigins = () => {
    const isProduction = process.env.NODE_ENV === 'production';
    const origins = [];

    // Localhost dev origins only when NODE_ENV is not production
    if (!isProduction) {
        origins.push(
            'http://localhost:5173',
            'http://localhost:5174',
            'http://localhost:3000',
            'http://127.0.0.1:5173',
            'http://127.0.0.1:3000'
        );
    }

    const envUrls = [process.env.CLIENT_URL, process.env.FRONTEND_URL, process.env.CORS_ORIGIN];
    for (const envVal of envUrls) {
        if (envVal) {
            const configuredUrls = envVal.split(',')
                .map(u => u.trim().replace(/\/$/, ''))
                .filter(Boolean);
            for (const u of configuredUrls) {
                if (!origins.includes(u)) {
                    origins.push(u);
                }
            }
        }
    }

    return origins;
};

const corsOptions = {
    origin: (origin, callback) => {
        const allowed = getAllowedOrigins();
        // Allow requests with no origin (e.g. same-origin server requests, mobile apps, or curl)
        if (!origin) {
            return callback(null, true);
        }
        if (allowed.includes(origin)) {
            return callback(null, true);
        }
        // Unlisted origin: pass false so no Access-Control-Allow-Origin header is set
        callback(null, false);
    },
    credentials: true
};

module.exports = {
    getAllowedOrigins,
    corsOptions
};

