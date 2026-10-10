const AuditLog = require('../models/AuditLog');

const trackAudit = (action, resource) => {
    return async (req, res, next) => {
        // We capture the original values if it's an update
        const oldValue = req.resourceData || null;

        // Custom function to be called after the response is sent
        const originalSend = res.json;
        res.json = function (data) {
            res.json = originalSend;

            // Only log successful operations
            if (res.statusCode >= 200 && res.statusCode < 300) {
                const logEntry = {
                    user_id: req.user?._id || null,
                    action,
                    resource,
                    resource_id: (data?._id || req.params.id) || null,
                    old_value: oldValue,
                    new_value: req.body,
                    ip_address: req.ip || req.headers['x-forwarded-for'],
                    user_agent: req.headers['user-agent']
                };

                // Save log asynchronously (don't block response)
                if (logEntry.user_id) {
                    AuditLog.create(logEntry).catch(err => console.error('Audit Log Error:', err));
                }
            }
            return originalSend.apply(res, arguments);
        };
        next();
    };
};

module.exports = { trackAudit };
