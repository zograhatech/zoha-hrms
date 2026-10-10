const AuditLog = require('../models/AuditLog');

exports.getRecentLogs = async (req, res) => {
    try {
        const logs = await AuditLog.find()
            .populate('user_id', 'name profile_image role')
            .sort({ timestamp: -1 })
            .limit(15);

        res.status(200).json({
            success: true,
            logs
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching audit logs',
            error: error.message
        });
    }
};
