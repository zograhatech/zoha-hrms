import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import { subscribeToPushNotifications } from '../utils/pushHelper';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
    const { user, refreshUser } = useAuth();
    const { showToast } = useToast();
    const [socket, setSocket] = useState(null);

    useEffect(() => {
        if (user && user.id) {
            // Determine backend URL - handle local vs production
            const backendUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;

            // CRITICAL: Standard WebSockets are NOT supported on Vercel Serverless.
            // Disable socket entirely on Vercel to avoid console error flood.
            if (window.location.hostname.includes('vercel.app')) {
                console.info('ℹ️ Real-time WebSockets (Socket.io) are disabled on Vercel environment.');
                console.info('💡 System is falling back to Web Push Notifications provided by Service Worker.');
                subscribeToPushNotifications();
                return;
            }

            const newSocket = io(backendUrl, {
                withCredentials: true,
                transports: ['websocket', 'polling'],
                reconnectionAttempts: 3,
                timeout: 5000
            });

            newSocket.on('connect', () => {
                console.log('Socket connected:', newSocket.id);
                newSocket.emit('join', user.id);
                subscribeToPushNotifications();
            });

            newSocket.on('notification', (notif) => {
                console.log('Real-time notification received:', notif);
                showToast(notif.message, notif.type === 'meeting' ? 'info' : 'success');
                try {
                    const audio = new Audio('/notification.mp3');
                    audio.play().catch(() => {});
                } catch (e) {}
            });

            newSocket.on('permission_update', (data) => {
                console.log('Permission update received:', data);
                showToast(data.message, 'success');
                refreshUser(); // Sync session real-time
            });

            setSocket(newSocket);

            return () => {
                if (newSocket) {
                    newSocket.off();
                    newSocket.close();
                }
            };
        }
    }, [user, showToast, refreshUser]);

    return (
        <SocketContext.Provider value={socket}>
            {children}
        </SocketContext.Provider>
    );
};
