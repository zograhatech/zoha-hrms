const ipaddr = require('ipaddr.js');
const AccessSettings = require('../models/AccessSettings');
const RemoteAccess = require('../models/RemoteAccess');

// Client IP resolver:
// Prioritizes x-vercel-forwarded-for (set by Vercel edge proxy), then falls back to req.ip.
// Directly ignores x-forwarded-for from untrusted clients.
function getClientIp(req) {
    if (process.env.TRUST_PROXY === 'vercel') {
        const vercelForwarded = req.headers['x-vercel-forwarded-for'];
        if (vercelForwarded && typeof vercelForwarded === 'string') {
            return vercelForwarded.split(',')[0].trim();
        }
    }
    return req.ip || req.connection?.remoteAddress || '127.0.0.1';
}

// Parse an IP address, converting IPv4-mapped IPv6 (::ffff:1.2.3.4) to IPv4
function parseIp(ipStr) {
    if (!ipStr) return null;
    let cleanIp = ipStr.trim();
    if (cleanIp.startsWith('::ffff:')) {
        cleanIp = cleanIp.slice(7);
    }
    try {
        let addr = ipaddr.parse(cleanIp);
        if (addr.kind() === 'ipv6' && addr.isIPv4MappedAddress()) {
            addr = addr.toIPv4Address();
        }
        return addr;
    } catch (_) {
        return null;
    }
}

// CIDR check supporting IPv4 and IPv6
function isIpInCidr(ipStr, cidrStr) {
    try {
        const addr = parseIp(ipStr);
        if (!addr) return false;
        const cidr = ipaddr.parseCIDR(cidrStr.trim());
        if (addr.kind() !== cidr[0].kind()) {
            return false;
        }
        return addr.match(cidr);
    } catch (_) {
        return false;
    }
}

// Validate CIDR format string
function validateCidr(cidrStr) {
    if (!cidrStr || typeof cidrStr !== 'string') return false;
    try {
        ipaddr.parseCIDR(cidrStr.trim());
        return true;
    } catch (_) {
        return false;
    }
}

// In-memory cache for AccessSettings (30 seconds TTL)
let cachedSettings = null;
let cacheExpiry = 0;

async function getCachedAccessSettings() {
    const now = Date.now();
    if (cachedSettings && now < cacheExpiry) {
        return cachedSettings;
    }
    let settings = await AccessSettings.findOne().lean();
    if (!settings) {
        settings = { enforce_ip_access: false, ranges: [] };
    }
    cachedSettings = settings;
    cacheExpiry = now + 30000;
    return cachedSettings;
}

function invalidateAccessSettingsCache() {
    cachedSettings = null;
    cacheExpiry = 0;
}

/**
 * Checks IP access for an authenticated user.
 * Returns true if allowed, or sends 403 and returns false if blocked.
 */
async function checkIpAccess(req, res, userRole) {
    const rawRole = (userRole || req.user?.role || '').toLowerCase().replace(/\s+/g, '');
    const isSuperAdmin = rawRole === 'admin';
    const isManager = ['manager', 'hr_manager', 'hrmanager', 'hrmanger', 'hr_manger'].includes(rawRole);

    // SuperAdmin and manager are never blocked
    if (isSuperAdmin || isManager) {
        return true;
    }

    // Applies only to role employee and team_lead
    const isEmployeeOrTeamLead = ['employee', 'team_lead', 'hr'].includes(rawRole);
    if (!isEmployeeOrTeamLead) {
        return true;
    }

    const settings = await getCachedAccessSettings();
    if (!settings.enforce_ip_access) {
        return true;
    }

    const enabledRanges = (settings.ranges || []).filter(r => r.enabled);
    if (enabledRanges.length === 0) {
        return true;
    }

    const clientIp = getClientIp(req);
    const empId = req.user?.id || req.user?.employee_id;

    // Check if an active Remote Access exception exists
    if (empId) {
        const now = new Date();
        const activeExceptions = await RemoteAccess.find({
            employee_id: empId,
            active: true,
            $or: [
                { expiresAt: null },
                { expiresAt: { $gt: now } }
            ]
        }).lean();

        for (const exc of activeExceptions) {
            // Null or empty allowedIp means any remote IP is allowed
            if (!exc.allowedIp) {
                return true;
            }
            const allowed = exc.allowedIp.trim();
            if (allowed === clientIp) return true;
            if (validateCidr(allowed) && isIpInCidr(clientIp, allowed)) return true;
        }
    }

    // Check if client IP matches any enabled CIDR range
    const isAllowed = enabledRanges.some(r => isIpInCidr(clientIp, r.cidr));
    if (isAllowed) {
        return true;
    }

    res.status(403).json({
        success: false,
        message: 'Access allowed only from the office network.'
    });
    return false;
}

// Standalone middleware for use in routers
const ipAccessMiddleware = async (req, res, next) => {
    const allowed = await checkIpAccess(req, res);
    if (allowed) {
        return next();
    }
};

module.exports = {
    getClientIp,
    parseIp,
    isIpInCidr,
    validateCidr,
    getCachedAccessSettings,
    invalidateAccessSettingsCache,
    checkIpAccess,
    ipAccessMiddleware
};

