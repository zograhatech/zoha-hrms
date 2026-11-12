import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { recordLogoutDiagnostic } from '../utils/authDiagnostics';

const IDLE_SYNC_CHANNEL = 'hrms_idle_sync';
const LAST_ACTIVITY_KEY = 'hrms_last_activity';
const WARNING_THRESHOLD_SECONDS = 60; // Show warning modal 60s before timeout

export function useIdleTimeout() {
    const { user, isAuthenticated, logout } = useAuth();
    const [showWarning, setShowWarning] = useState(false);
    const [secondsRemaining, setSecondsRemaining] = useState(WARNING_THRESHOLD_SECONDS);
    const [policy, setPolicy] = useState(null);

    const channelRef = useRef(null);
    const lastBroadcastRef = useRef(0);
    const isClockingOutRef = useRef(false);

    // 1. Fetch idle policy
    useEffect(() => {
        if (!isAuthenticated) return;

        let isMounted = true;
        API.get('/attendance/idle-policy')
            .then(({ data }) => {
                if (isMounted && data) {
                    setPolicy(data);
                }
            })
            .catch((err) => {
                console.warn('[useIdleTimeout] Could not fetch idle policy, using defaults:', err.message);
                if (isMounted) {
                    setPolicy({
                        enabled: true,
                        timeout_minutes: 10,
                        office_start_time: '09:00',
                        office_end_time: '18:00'
                    });
                }
            });

        return () => {
            isMounted = false;
        };
    }, [isAuthenticated]);

    // 2. Cross-tab activity broadcast channel
    useEffect(() => {
        if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;

        const ch = new BroadcastChannel(IDLE_SYNC_CHANNEL);
        channelRef.current = ch;

        ch.onmessage = (event) => {
            const { type, timestamp } = event.data || {};
            if (type === 'ACTIVITY' && timestamp) {
                localStorage.setItem(LAST_ACTIVITY_KEY, String(timestamp));
                setShowWarning(false);
            }
        };

        return () => {
            ch.close();
            channelRef.current = null;
        };
    }, []);

    // 3. Activity recorder (throttled to 3s)
    const recordActivity = useCallback(() => {
        const now = Date.now();
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
        setShowWarning(false);

        if (now - lastBroadcastRef.current > 3000) {
            lastBroadcastRef.current = now;
            channelRef.current?.postMessage({ type: 'ACTIVITY', timestamp: now });
        }
    }, []);

    // 4. Attach window event listeners
    useEffect(() => {
        if (!isAuthenticated) return;

        // Fresh page load always resets last activity to now (never assume idle from hours earlier when app was closed)
        localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

        const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'focus'];
        const handleActivity = () => recordActivity();

        events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));
        document.addEventListener('visibilitychange', handleActivity);

        return () => {
            events.forEach((evt) => window.removeEventListener(evt, handleActivity));
            document.removeEventListener('visibilitychange', handleActivity);
        };
    }, [isAuthenticated, recordActivity]);

    // 5. Timer loop and heartbeat
    useEffect(() => {
        if (!isAuthenticated || !policy || policy.exempt) return;

        const isEnabled = policy.enabled ?? policy.idle_auto_clockout_enabled ?? true;
        if (!isEnabled) return;

        const isRemembered = localStorage.getItem('hrms_remember_me') === 'true';
        const timeoutMinutes = policy.timeout_minutes ?? policy.idle_timeout_minutes ?? 10;
        const timeoutMs = timeoutMinutes * 60 * 1000;
        let lastHeartbeat = 0;

        const interval = setInterval(async () => {
            const now = Date.now();
            const lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || now);
            const idleMs = now - lastActivity;
            const remainingMs = timeoutMs - idleMs;
            const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));

            // Periodic heartbeat every 60s while active (idle < 60s)
            if (idleMs < 60000 && now - lastHeartbeat >= 60000) {
                lastHeartbeat = now;
                API.post('/attendance/heartbeat').catch(() => {});
            }

            // If "Stay logged in" is enabled, web idle timer must NEVER sign the user out of the web portal
            if (isRemembered) {
                // Keep activity warning hidden; do not log out
                setShowWarning(false);
                return;
            }

            if (remainingMs <= WARNING_THRESHOLD_SECONDS * 1000 && remainingMs > 0) {
                setShowWarning(true);
                setSecondsRemaining(remainingSec);
            } else if (remainingMs > WARNING_THRESHOLD_SECONDS * 1000) {
                setShowWarning(false);
            } else if (remainingMs <= 0 && !isClockingOutRef.current) {
                // Timeout reached
                isClockingOutRef.current = true;
                setShowWarning(false);

                const hasCompanion = Boolean(user?.has_companion || user?.is_companion_active);

                // Only call auto-clock-out if employee does NOT have an active desktop companion
                if (!hasCompanion && policy.web_auto_clockout !== false) {
                    try {
                        const idleSec = Math.floor(idleMs / 1000);
                        await API.post('/attendance/auto-clock-out', {
                            idle_seconds: idleSec,
                            source: 'web'
                        });
                    } catch (err) {
                        console.warn('[useIdleTimeout] Auto clock-out failed:', err.message);
                    }
                }

                // Record diagnostic and log out user
                recordLogoutDiagnostic({
                    reason: 'idle_hook_timeout',
                    endpoint: '/attendance/auto-clock-out',
                    status: 200,
                    details: { timeoutMinutes, idleSeconds: Math.floor(idleMs / 1000) }
                });
                logout();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isAuthenticated, policy, user, logout]);

    const resetIdleTimer = useCallback(() => {
        recordActivity();
        setShowWarning(false);
    }, [recordActivity]);

    return {
        showWarning,
        secondsRemaining,
        resetIdleTimer,
        policy
    };
}
