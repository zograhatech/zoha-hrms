import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiMessageCircle } from 'react-icons/fi';
import API from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function FloatingChatButton() {
    const location = useLocation();
    const navigate = useNavigate();
    const { token, user } = useAuth();
    const socket = useSocket();
    const [unreadCount, setUnreadCount] = useState(0);

    const isChatPage = location.pathname.includes('/dashboard/messages');

    const fetchUnreadCount = useCallback(async () => {
        if (!token || isChatPage) return;
        try {
            const { data } = await API.get('/messages/unread-count');
            if (data?.success && typeof data.count === 'number') {
                setUnreadCount(data.count);
            }
        } catch (_) {}
    }, [token, isChatPage]);

    useEffect(() => {
        if (!token || isChatPage) return;

        fetchUnreadCount();

        // 15-20s lightweight polling when tab is active
        const interval = setInterval(() => {
            if (document.visibilityState === 'visible') {
                fetchUnreadCount();
            }
        }, 15000);

        const handleFocus = () => {
            if (document.visibilityState === 'visible') {
                fetchUnreadCount();
            }
        };

        const handleCountUpdate = (e) => {
            if (typeof e.detail?.count === 'number') {
                setUnreadCount(e.detail.count);
            } else {
                fetchUnreadCount();
            }
        };

        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleFocus);
        window.addEventListener('chat_unread_update', handleCountUpdate);

        if (socket) {
            socket.on('receive_message', fetchUnreadCount);
            socket.on('messages_seen', fetchUnreadCount);
        }

        return () => {
            clearInterval(interval);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleFocus);
            window.removeEventListener('chat_unread_update', handleCountUpdate);
            if (socket) {
                socket.off('receive_message', fetchUnreadCount);
                socket.off('messages_seen', fetchUnreadCount);
            }
        };
    }, [token, isChatPage, fetchUnreadCount, socket]);

    // Deactivate / hide on the Live Chat page itself
    if (isChatPage || !user) return null;

    const displayCount = unreadCount > 99 ? '99+' : unreadCount;

    return (
        <button
            id="floating-live-chat-btn"
            className="floating-live-chat-shortcut"
            onClick={() => navigate('/dashboard/messages')}
            aria-label={`Open Live Chat${unreadCount > 0 ? `, ${unreadCount} unread messages` : ''}`}
            title="Team Live Chat"
            style={{
                position: 'fixed',
                bottom: 'calc(92px + env(safe-area-inset-bottom, 0px))',
                right: '24px',
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                background: 'var(--gradient-primary, linear-gradient(135deg, #6366f1 0%, #4f46e5 100%))',
                color: '#ffffff',
                border: 'none',
                boxShadow: '0 4px 18px rgba(99, 102, 241, 0.4), 0 2px 6px rgba(0, 0, 0, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 9990,
                transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.2s ease',
                outline: 'none',
            }}
            onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.08)';
                e.currentTarget.style.boxShadow = '0 6px 22px rgba(99, 102, 241, 0.5), 0 3px 8px rgba(0, 0, 0, 0.15)';
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(99, 102, 241, 0.4), 0 2px 6px rgba(0, 0, 0, 0.1)';
            }}
            onFocus={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--bg-primary, #ffffff), 0 0 0 5px #6366f1';
            }}
            onBlur={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 18px rgba(99, 102, 241, 0.4), 0 2px 6px rgba(0, 0, 0, 0.1)';
            }}
        >
            <FiMessageCircle size={26} />
            {unreadCount > 0 && (
                <span
                    className="floating-chat-badge"
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        background: '#ef4444',
                        color: '#ffffff',
                        fontSize: '11px',
                        fontWeight: 800,
                        lineHeight: 1,
                        padding: '3px 6px',
                        borderRadius: '12px',
                        border: '2px solid var(--bg-card, #ffffff)',
                        boxShadow: '0 2px 6px rgba(239, 68, 68, 0.5)',
                        minWidth: '20px',
                        textAlign: 'center'
                    }}
                >
                    {displayCount}
                </span>
            )}
        </button>
    );
}
