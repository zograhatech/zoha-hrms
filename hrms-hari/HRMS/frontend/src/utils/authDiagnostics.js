/**
 * Auth Diagnostics Helper
 * Records detailed logout reasons and context into localStorage and console.
 */

export function recordLogoutDiagnostic({ reason, endpoint = null, status = null, details = null }) {
    const entry = {
        reason,
        endpoint,
        status,
        timestamp: new Date().toISOString(),
        details: typeof details === 'object' ? JSON.stringify(details) : details,
        url: typeof window !== 'undefined' ? window.location.href : null
    };

    console.warn('[AUTH_DIAGNOSTIC] Logout or Token Clear Triggered:', entry);

    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem('hrms_last_logout_reason', JSON.stringify(entry));
            const historyStr = localStorage.getItem('hrms_logout_history');
            const history = historyStr ? JSON.parse(historyStr) : [];
            history.unshift(entry);
            localStorage.setItem('hrms_logout_history', JSON.stringify(history.slice(0, 5)));
        } catch {
            // Ignore storage quota errors
        }
    }
}

export function getLastLogoutDiagnostic() {
    if (typeof localStorage === 'undefined') return null;
    try {
        const item = localStorage.getItem('hrms_last_logout_reason');
        return item ? JSON.parse(item) : null;
    } catch {
        return null;
    }
}
