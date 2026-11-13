import axios from 'axios';
import { recordLogoutDiagnostic } from '../utils/authDiagnostics';

// Base URL configuration: dynamically resolves preview backend deployments on Vercel
export const resolveApiBaseUrl = () => {
    // 1. In browser on Vercel preview deployment: ALWAYS pair with the matching backend preview deployment
    if (typeof window !== 'undefined') {
        const hostname = window.location.hostname || '';
        if (hostname.includes('zoha-hrms-cwie') && hostname.endsWith('.vercel.app') && hostname !== 'zoha-hrms-cwie.vercel.app') {
            const backendHost = hostname.replace('zoha-hrms-cwie', 'zoha-hrms');
            return `https://${backendHost}/api`;
        }
    }

    // 2. Explicit override via VITE_API_BASE_URL env var (production or custom environments)
    if (import.meta.env.VITE_API_BASE_URL) {
        const url = String(import.meta.env.VITE_API_BASE_URL).trim().replace(/\/+$/, '');
        return url.endsWith('/api') ? url : `${url}/api`;
    }

    // 3. Fallback to production backend
    return 'https://zoha-hrms.vercel.app/api';
};

const apiBaseUrl = resolveApiBaseUrl();

const API = axios.create({
    baseURL: apiBaseUrl,
    headers: { 'Content-Type': 'application/json' },
});

// In-flight GET request deduplication and 1.5s short-TTL cache for polling queries
const inFlightRequests = new Map();
const shortTtlCache = new Map();

const originalGet = API.get.bind(API);

API.get = function (url, config = {}) {
    if (config?.noDedup || config?.responseType === 'blob') {
        return originalGet(url, config);
    }

    const queryString = config.params ? JSON.stringify(config.params) : '';
    const cacheKey = `GET:${url}:${queryString}`;
    const now = Date.now();

    // 1. Check short-TTL cache for high-frequency polling endpoints
    const cached = shortTtlCache.get(cacheKey);
    if (cached && (now - cached.timestamp < 1500)) {
        return Promise.resolve({ ...cached.response });
    }

    // 2. Check in-flight concurrent requests to share single promise
    if (inFlightRequests.has(cacheKey)) {
        return inFlightRequests.get(cacheKey);
    }

    const promise = originalGet(url, config)
        .then((response) => {
            if (response?.status === 200 && (url.includes('unread-count') || url.includes('/settings/branding') || url.includes('/attendance/idle-policy'))) {
                shortTtlCache.set(cacheKey, { response, timestamp: Date.now() });
            }
            return response;
        })
        .finally(() => {
            inFlightRequests.delete(cacheKey);
        });

    inFlightRequests.set(cacheKey, promise);
    return promise;
};

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
            recordLogoutDiagnostic({ reason: 'auth_channel_broadcast' });
            localStorage.removeItem('hrms_token');
            localStorage.removeItem('hrms_refresh_token');
            localStorage.removeItem('hrms_user');
            localStorage.removeItem('hrms_remember_me');
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

        // Retry loop for cold-start serverless / DB timeouts (up to 3 attempts)
        let lastErr = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
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
                lastErr = err;
                const status = err.response?.status;
                if (status === 401 || status === 403) {
                    // Truly revoked or invalid refresh token: do not retry
                    err.isAuthError = true;
                    throw err;
                }
                // Network error, 5xx server error, or cold-start DB timeout: retry if attempts remain
                if (attempt < 3) {
                    await new Promise(r => setTimeout(r, attempt * 500));
                }
            }
        }

        if (lastErr) {
            // Cold start or network failure after retries: NEVER clear credentials
            lastErr.isAuthError = false;
            throw lastErr;
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

            // Unessential background pings should NEVER trigger a forced logout if they fail
            const isBackgroundPing = originalRequest.url?.includes('/attendance/heartbeat') ||
                originalRequest.url?.includes('/attendance/idle-policy') ||
                originalRequest.url?.includes('/settings/branding') ||
                originalRequest.url?.includes('/health');

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
                if (refreshErr?.isAuthError && !isBackgroundPing) {
                    // Truly unauthenticated: record diagnostic, clear credentials and redirect to login
                    recordLogoutDiagnostic({
                        reason: refreshErr.message?.includes('No refresh token') ? 'refresh_token_missing' : 'refresh_401_403',
                        endpoint: originalRequest.url,
                        status: refreshErr.response?.status || 401,
                        details: refreshErr.response?.data?.message || refreshErr.message
                    });
                    localStorage.removeItem('hrms_token');
                    localStorage.removeItem('hrms_refresh_token');
                    localStorage.removeItem('hrms_user');
                    localStorage.removeItem('hrms_remember_me');
                    authChannel?.postMessage({ type: 'LOGOUT' });
                    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
                        window.location.href = '/login';
                    }
                }
                // On network/server/cold-start errors or background pings, do NOT clear tokens or redirect
                return Promise.reject(refreshErr);
            }
        }
        return Promise.reject(err);
    }
);

export default API;
