import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';

const SocketContext = createContext(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, refreshUser } = useAuth();
    const { showToast } = useToast();
    const [realtimeClient, setRealtimeClient] = useState(null);
    const listenersRef = useRef(new Map()); // event -> Set of callbacks
    const wsRef = useRef(null);

    // ── Unified Event Dispatcher ────────────────────────────────────
    const on = useCallback((event, callback) => {
        if (!listenersRef.current.has(event)) {
            listenersRef.current.set(event, new Set());
        }
        listenersRef.current.get(event).add(callback);
    }, []);

    const off = useCallback((event, callback) => {
        if (!listenersRef.current.has(event)) return;
        if (callback) {
            listenersRef.current.get(event).delete(callback);
        } else {
            listenersRef.current.delete(event);
        }
    }, []);

    const emitEvent = useCallback((event, data) => {
        const callbacks = listenersRef.current.get(event);
        if (callbacks) {
            callbacks.forEach(cb => {
                try { cb(data); } catch (e) { console.error(`[Realtime Callback Error]`, e); }
            });
        }
    }, []);

    const subscribeChannel = useCallback((channelName) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
                event: 'pusher:subscribe',
                data: { channel: channelName }
            }));
        }
    }, []);

    useEffect(() => {
        if (!user || !user.id) return;

        const pusherKey = import.meta.env.VITE_PUSHER_KEY;
        const pusherCluster = import.meta.env.VITE_PUSHER_CLUSTER || 'mt1';
        const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');

        // ── Option A: Hosted Realtime (Pusher Channels via WebSocket) ──
        if (pusherKey) {
            console.info('🚀 Connecting to Hosted Realtime (Pusher Channels)...');
            const wsUrl = `wss://ws-${pusherCluster}.pusher.com/app/${pusherKey}?protocol=7&client=js&version=8.4.0`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                console.info('✅ Hosted Realtime connected to Pusher edge network.');
            };

            ws.onmessage = (msgEvent) => {
                try {
                    const parsed = JSON.parse(msgEvent.data);
                    const { event, channel, data } = parsed;

                    // Handle Pusher keep-alive ping
                    if (event === 'pusher:ping') {
                        ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
                        return;
                    }

                    if (event === 'pusher:connection_established') {
                        // Automatically subscribe to user-specific channel
                        subscribeChannel(`user-${user.id}`);
                        return;
                    }

                    let payload = data;
                    if (typeof data === 'string') {
                        try { payload = JSON.parse(data); } catch (_) {}
                    }

                    // Forward to registered event handlers
                    emitEvent(event, payload);
                    if (channel) {
                        emitEvent(`${channel}:${event}`, payload);
                    }

                    // Built-in handlers for notifications and permission updates
                    if (event === 'notification' || event === 'chat-notification') {
                        showToast(payload.message || 'New notification', 'info');
                    }
                    if (event === 'permission_update') {
                        showToast(payload.message || 'Permissions updated', 'success');
                        refreshUser();
                    }
                } catch (err) {
                    console.error('[Hosted Realtime Parse Error]', err);
                }
            };

            ws.onerror = (err) => {
                console.warn('[Hosted Realtime WebSocket Notice] Falling back to polling:', err);
            };

            const clientApi = {
                on,
                off,
                subscribe: subscribeChannel,
                type: 'pusher',
                connected: true
            };
            setRealtimeClient(clientApi);

            return () => {
                ws.close();
                wsRef.current = null;
            };
        }

        // ── Option B: Fallback Socket.io (for local development only) ─
        if (!isVercel) {
            const backendUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
            const newSocket = io(backendUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 2,
                timeout: 4000
            });

            newSocket.on('connect', () => {
                newSocket.emit('join', user.id);
            });

            newSocket.on('notification', (notif) => {
                showToast(notif.message, notif.type === 'meeting' ? 'info' : 'success');
            });

            newSocket.on('permission_update', (data) => {
                showToast(data.message, 'success');
                refreshUser();
            });

            const clientApi = {
                on: (evt, cb) => newSocket.on(evt, cb),
                off: (evt, cb) => newSocket.off(evt, cb),
                subscribe: (room) => newSocket.emit('join', room),
                type: 'socket.io',
                connected: true
            };
            setRealtimeClient(clientApi);

            return () => {
                newSocket.off();
                newSocket.close();
            };
        }

        // ── Option C: Vercel without Pusher configured ───────────────
        console.info('ℹ️ Hosted realtime (VITE_PUSHER_KEY) is not set. Adaptive polling active as fallback.');
        setRealtimeClient({
            on,
            off,
            subscribe: () => {},
            type: 'polling-fallback',
            connected: false
        });
    }, [user, showToast, refreshUser, on, off, emitEvent, subscribeChannel]);

    return (
        <SocketContext.Provider value={realtimeClient}>
            {children}
        </SocketContext.Provider>
    );
};
