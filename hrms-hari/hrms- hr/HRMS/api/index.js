try {
    const app = require('../backend/server');
    module.exports = (req, res) => {
        if (req.url && !req.url.startsWith('/api')) {
            req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
        }
        return app(req, res);
    };
} catch (err) {
    console.error('--- Vercel Bridge: Backend Loading FAILED ---');
    console.error('Error Name:', err.name);
    console.error('Error Message:', err.message);
    console.error('Stack:', err.stack);
    
    module.exports = (req, res) => {
        res.status(500).json({
            success: false,
            message: 'Critical: Backend failed to initialize in Vercel environment.',
            error_type: err.name,
            error_details: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
            tip: 'Check Vercel Logs. Often caused by missing dependencies in root package.json or path issues.'
        });
    };
}
