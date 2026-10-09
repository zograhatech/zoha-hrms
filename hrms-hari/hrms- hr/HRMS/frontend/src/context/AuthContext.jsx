/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState } from 'react';
import API from '../api/axios';

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
        if (data.success) {
            localStorage.setItem('hrms_token', data.token);
            localStorage.setItem('hrms_refresh_token', data.refreshToken);
            localStorage.setItem('hrms_user', JSON.stringify(data.user));
            setToken(data.token);
            setUser(data.user);
            return data.user;
        }
        throw new Error(data.message);
    };

    const refreshUser = async () => {
        try {
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
    };


    const logout = () => {
        localStorage.removeItem('hrms_token');
        localStorage.removeItem('hrms_refresh_token');
        localStorage.removeItem('hrms_user');
        setToken(null);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, token, loading: false, login, logout, refreshUser, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );

};

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
};
