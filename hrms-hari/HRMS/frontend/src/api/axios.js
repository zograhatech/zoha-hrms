import axios from 'axios';

// Base URL configuration: reads from VITE_API_BASE_URL env var, defaulting to production backend fallback
const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://zoha-hrms.vercel.app';
const sanitizedBaseUrl = String(rawApiBaseUrl).trim().replace(/\/+$/, '');
const apiBaseUrl = sanitizedBaseUrl.endsWith('/api') ? sanitizedBaseUrl : `${sanitizedBaseUrl}/api`;

const API = axios.create({
    baseURL: apiBaseUrl,
    headers: { 'Content-Type': 'application/json' },
});

// Startup diagnostic log for preview and dev environments
if (typeof window !== 'undefined') {
    const isProdMode = import.meta.env.MODE === 'production';
    const hostname = window.location.hostname || '';
    const isProdDomain = hostname === 'zoha-hrms-cwie.vercel.app';

    if (!isProdMode || (hostname.includes('vercel.app') && !isProdDomain)) {
        console.info(`[HRMS API] Resolved Base URL: ${apiBaseUrl}`);
    }
}

// Attach token to every request
API.interceptors.request.use((config) => {
    const token = localStorage.getItem('hrms_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// BroadcastChannel for cross-tab auth state synchronization
const authChannel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('hrms_auth_channel')
    : null;

if (authChannel) {
    authChannel.onmessage = (event) => {
        const { type, token, refreshToken } = event.data || {};
        if (type === 'TOKEN_REFRESHED' && token && refreshToken) {
            localStorage.setItem('hrms_token', token);
            localStorage.setItem('hrms_refresh_token', refreshToken);
        } else if (type === 'LOGOUT') {
            localStorage.removeItem('hrms_token');
            localStorage.removeItem('hrms_refresh_token');
            localStorage.removeItem('hrms_user');
            if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }
    };
}

// Cross-tab lock using Web Locks API with localStorage fallback
async function withCrossTabLock(lockName, timeoutMs, fn) {
    if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return new Promise((resolve, reject) => {
            navigator.locks.request(lockName, async () => {
                try {
                    const result = await fn();
                    resolve(result);
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    // Fallback: localStorage timestamp-based spinlock
    const start = Date.now();
    const lockKey = `__hrms_lock_${lockName}`;
    const myId = `${Date.now()}_${Math.random()}`;

    while (Date.now() - start < timeoutMs) {
        const existing = localStorage.getItem(lockKey);
        const lockData = existing ? JSON.parse(existing) : null;
        const isExpired = lockData && (Date.now() - lockData.timestamp > 8000);

        if (!lockData || isExpired) {
            localStorage.setItem(lockKey, JSON.stringify({ id: myId, timestamp: Date.now() }));
            await new Promise((r) => setTimeout(r, 40));
            try {
                const check = JSON.parse(localStorage.getItem(lockKey) || '{}');
                if (check.id === myId) {
                    try {
                        return await fn();
                    } finally {
                        localStorage.removeItem(lockKey);
                    }
                }
            } catch {
                // Parse error - retry loop
            }
        }
        await new Promise((r) => setTimeout(r, 80));
    }
    // Timeout waiting for lock - run fn to avoid permanent freeze
    return await fn();
}

// In-tab single-flight mutex promise
let inFlightRefreshPromise = null;

async function performCrossTabRefresh(failedToken) {
    return withCrossTabLock('hrms_token_refresh_lock', 8000, async () => {
        // 1. Check if another tab refreshed while we waited for the lock
        const currentToken = localStorage.getItem('hrms_token');
        if (currentToken && currentToken !== failedToken) {
            return currentToken;
        }

        const refreshToken = localStorage.getItem('hrms_refresh_token');
        if (!refreshToken) {
            const err = new Error('No refresh token available');
            err.isAuthError = true;
            throw err;
        }

        try {
            const { data } = await axios.post(`${API.defaults.baseURL}/auth/refresh`, { refreshToken });
            if (data?.token && data?.refreshToken) {
                localStorage.setItem('hrms_token', data.token);
                localStorage.setItem('hrms_refresh_token', data.refreshToken);
                authChannel?.postMessage({
                    type: 'TOKEN_REFRESHED',
                    token: data.token,
                    refreshToken: data.refreshToken
                });
                return data.token;
            }
            const formatErr = new Error('Malformed refresh response');
            formatErr.isAuthError = true;
            throw formatErr;
        } catch (err) {
            const status = err.response?.status;
            if (status === 401 || status === 403) {
                // Refresh token is genuinely invalid, revoked, or expired
                err.isAuthError = true;
            } else {
                // Network error, 5xx server error, or timeout: keep tokens intact
                err.isAuthError = false;
            }
            throw err;
        }
    });
}

// Handle 401 globally with seamless cross-tab mutex refresh
API.interceptors.response.use(
    (res) => res,
    async (err) => {
        const originalRequest = err.config;

        if (err.response?.status === 401 && originalRequest && !originalRequest._retry) {
            // Do not attempt refresh on auth endpoints to prevent recursion
            if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/refresh')) {
                return Promise.reject(err);
            }

            originalRequest._retry = true;
            const failedToken = (originalRequest.headers?.Authorization || '').replace(/^Bearer\s+/i, '');

            try {
                if (!inFlightRefreshPromise) {
                    inFlightRefreshPromise = performCrossTabRefresh(failedToken)
                        .finally(() => {
                            inFlightRefreshPromise = null;
                        });
                }
                const newToken = await inFlightRefreshPromise;
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return API(originalRequest);
            } catch (refreshErr) {
                if (refreshErr?.isAuthError) {
                    // Truly unauthenticated: clear credentials and redirect to login
                    localStorage.removeItem('hrms_token');
                    localStorage.removeItem('hrms_refresh_token');
                    localStorage.removeItem('hrms_user');
                    authChannel?.postMessage({ type: 'LOGOUT' });
                    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                }
                // On network/server errors, do NOT clear tokens or redirect
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(err);
    }
);

export default API;
