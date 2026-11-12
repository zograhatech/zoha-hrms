/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import API from '../api/axios';
import { recordLogoutDiagnostic } from '../utils/authDiagnostics';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
    // Initialize SYNCHRONOUSLY from localStorage — no useEffect, no loading flash
    const [user, setUser] = useState(() => {
        try {
            const stored = localStorage.getItem('hrms_user');
            return stored ? JSON.parse(stored) : null;
        } catch { return null; }
    });
    const [token, setToken] = useState(() => localStorage.getItem('hrms_token') || null);

    const login = async (email, password, rememberMe = false) => {
        const { data } = await API.post('/auth/login', { email, password, rememberMe });
        if (data.requires2fa || data.requires_2fa) {
            return data;
        }
        if (data.success) {
            localStorage.setItem('hrms_token', data.token);
            localStorage.setItem('hrms_refresh_token', data.refreshToken);
            localStorage.setItem('hrms_user', JSON.stringify(data.user));
            localStorage.setItem('hrms_remember_me', rememberMe ? 'true' : 'false');
            setToken(data.token);
            setUser(data.user);
            return data.user;
        }
        throw new Error(data.message);
    };

    const complete2fa = (data) => {
        localStorage.setItem('hrms_token', data.token);
        localStorage.setItem('hrms_refresh_token', data.refreshToken);
        localStorage.setItem('hrms_user', JSON.stringify(data.user));
        if (data.rememberMe !== undefined) {
            localStorage.setItem('hrms_remember_me', data.rememberMe ? 'true' : 'false');
        }
        setToken(data.token);
        setUser(data.user);
        return data.user;
    };

    const refreshUser = useCallback(async () => {
        try {
            const currentToken = localStorage.getItem('hrms_token');
            if (!currentToken) return;

            const { data } = await API.get('/auth/me');
            if (data.success) {
                if (data.token) {
                    localStorage.setItem('hrms_token', data.token);
                    setToken(data.token);
                }
                localStorage.setItem('hrms_user', JSON.stringify(data.user));
                setUser(data.user);
                return data.user;
            }
        } catch (err) {
            console.error('Failed to refresh user:', err);
        }
    }, []);

    // Re-fetch profile on window focus, visibility change, and every 60s
    useEffect(() => {
        if (!token) return;

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                refreshUser();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);

        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                refreshUser();
            }
        }, 60000);

        return () => {
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
            clearInterval(interval);
        };
    }, [token, refreshUser]);

    const logout = async () => {
        recordLogoutDiagnostic({ reason: 'explicit_logout' });
        const refreshToken = localStorage.getItem('hrms_refresh_token');
        try {
            if (refreshToken) {
                await API.post('/auth/logout', { refreshToken });
            }
        } catch {
            // Ignore logout network errors
        } finally {
            localStorage.removeItem('hrms_token');
            localStorage.removeItem('hrms_refresh_token');
            localStorage.removeItem('hrms_user');
            localStorage.removeItem('hrms_remember_me');
            setToken(null);
            setUser(null);
            if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
                try {
                    const ch = new BroadcastChannel('hrms_auth_channel');
                    ch.postMessage({ type: 'LOGOUT' });
                    ch.close();
                } catch {
                    // Ignore channel errors
                }
            }
        }
    };

    return (
        <AuthContext.Provider value={{ user, token, loading: false, login, complete2fa, logout, refreshUser, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
