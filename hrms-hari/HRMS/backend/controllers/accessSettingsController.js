const AccessSettings = require('../models/AccessSettings');
const AuditLog = require('../models/AuditLog');
const { getClientIp, validateCidr, isIpInCidr, invalidateAccessSettingsCache } = require('../middleware/ipAccess');

// GET /api/access-settings (SuperAdmin only)
const getAccessSettings = async (req, res) => {
    try {
        let settings = await AccessSettings.findOne().lean();
        if (!settings) {
            settings = {
                enforce_ip_access: false,
                ranges: []
            };
        }
        const currentIp = getClientIp(req);
        return res.json({
            success: true,
            settings,
            current_ip: currentIp
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch access settings: ' + err.message
        });
    }
};

// PUT /api/access-settings (SuperAdmin only)
const updateAccessSettings = async (req, res) => {
    try {
        const { enforce_ip_access, ranges, confirm } = req.body;

        if (typeof enforce_ip_access !== 'boolean' && enforce_ip_access !== undefined) {
            return res.status(400).json({
                success: false,
                message: 'enforce_ip_access must be a boolean.'
            });
        }

        const cleanRanges = Array.isArray(ranges) ? ranges : [];

        // Validate each CIDR in ranges
        for (const r of cleanRanges) {
            if (!r || !r.cidr || typeof r.cidr !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Each range must include a valid cidr string.'
                });
            }
            if (!validateCidr(r.cidr)) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid CIDR format: "${r.cidr}". Please provide a valid IPv4 or IPv6 CIDR block.`
                });
            }
        }

        const currentIp = getClientIp(req);
        const shouldEnforce = enforce_ip_access === true;
        const enabledRanges = cleanRanges.filter(r => r.enabled !== false);

        // Safety Guard: if saving ranges that exclude current SuperAdmin IP when enforcement is on
        if (shouldEnforce && enabledRanges.length > 0) {
            const currentIpAllowed = enabledRanges.some(r => isIpInCidr(currentIp, r.cidr));
            if (!currentIpAllowed && !confirm) {
                return res.status(400).json({
                    success: false,
                    requires_confirm: true,
                    warning: `Saving these ranges will exclude your current IP (${currentIp}). Pass confirm=true to proceed.`
                });
            }
        }

        // Save settings singleton
        const updated = await AccessSettings.findOneAndUpdate(
            {},
            {
                $set: {
                    enforce_ip_access: shouldEnforce,
                    ranges: cleanRanges
                }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // Invalidate in-memory cache
        invalidateAccessSettingsCache();

        // AuditLog entry
        try {
            await AuditLog.create({
                user_id: req.user._id || req.user.id,
                action: 'UPDATE',
                resource: 'AccessSettings',
                new_value: {
                    enforce_ip_access: updated.enforce_ip_access,
                    ranges: updated.ranges
                },
                ip_address: currentIp,
                user_agent: req.headers['user-agent']
            });
        } catch (auditErr) {
            console.error('[updateAccessSettings] AuditLog creation failed:', auditErr.message);
        }

        return res.json({
            success: true,
            settings: updated,
            current_ip: currentIp
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to update access settings: ' + err.message
        });
    }
};

module.exports = {
    getAccessSettings,
    updateAccessSettings
};

