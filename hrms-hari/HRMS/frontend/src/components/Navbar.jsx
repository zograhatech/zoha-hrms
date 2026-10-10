import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
    FiSun, FiMoon, FiSunrise, FiCloud,
    FiShield, FiUserCheck, FiUser, FiBriefcase, FiMenu, FiBell, FiMail, FiCheckCircle, FiVideo
} from 'react-icons/fi';
import API from '../api/axios';
import { useState, useEffect } from 'react';
import { useSocket } from '../context/SocketContext';
import { formatDate } from '../utils/dateFormatter';

export default function Navbar({ onToggleSidebar }) {
    const { user } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const navigate = useNavigate();
    const now = new Date();

    const permissions = user?.permissions || [];
    const hasManagementAccess = user?.role === 'hr_manager' || permissions.some(p => p.startsWith('manage_') || p === 'view_analytics');

    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showNotifs, setShowNotifs] = useState(false);

    const socket = useSocket();

    // Click outside to close notifications
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (showNotifs && !event.target.closest('.notif-container')) {
                setShowNotifs(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showNotifs]);

    useEffect(() => {
        fetchNotifications();
        
        if (socket) {
            socket.on('notification', (notif) => {
                setNotifications(prev => [notif, ...prev]);
                setUnreadCount(prev => prev + 1);
            });
        }

        return () => {
            if (socket) socket.off('notification');
        };
    }, [socket]);

    const fetchNotifications = async () => {
        try {
            const res = await API.get('/notifications');
            if (res.data.success) {
                setNotifications(res.data.notifications);
                setUnreadCount(res.data.notifications.filter(n => !n.is_read).length);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
            if (error.response?.status === 401) {
                // Token invalid/expired. The AuthContext should handle redirection eventually,
                // but we can at least stop the spam here if we wanted.
            }
        }
    };

    const markAsRead = async (id) => {
        try {
            await API.patch(`/notifications/${id}/read`);
            fetchNotifications();
        } catch (error) {
            console.error('Error marking as read:', error);
        }
    };

    const clearAll = async () => {
        try {
            await API.delete('/notifications/clear');
            setNotifications([]);
            setUnreadCount(0);
        } catch (error) {
            console.error('Error clearing:', error);
        }
    };

    const hour = now.getHours();
    const greetingData = hour < 12
        ? { text: 'Good Morning', icon: <FiSunrise className="text-warning" /> }
        : hour < 17
            ? { text: 'Good Afternoon', icon: <FiSun className="text-warning" /> }
            : { text: 'Good Evening', icon: <FiCloud className="text-info" /> };

    return (
        <header className="navbar">
            <div style={{ display: 'flex', alignItems: 'center' }}>
                {/* Hamburger — shown only on tablet/mobile via CSS */}
                <button className="navbar-hamburger" onClick={onToggleSidebar} aria-label="Toggle sidebar">
                    <FiMenu />
                </button>
                <div className="navbar-greet">
                    <div className="navbar-greet-top">
                        {greetingData.icon} <span className="navbar-greet-text">{greetingData.text}, {user?.name?.split(' ')[0]}!</span>
                    </div>
                    <div className="navbar-greet-date">
                        {formatDate(now)}
                    </div>
                </div>
            </div>

            <div className="navbar-actions">
                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '10px',
                        width: '36px',
                        height: '36px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        transition: 'var(--transition)',
                        color: 'var(--text-primary)'
                    }}
                    title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                    className="theme-toggle-btn"
                >
                    {theme === 'dark' ? <FiSun /> : <FiMoon />}
                </button>

                {/* Notification Bell */}
                <div className="notif-container" style={{ position: 'relative' }}>
                    <button
                        onClick={() => setShowNotifs(!showNotifs)}
                        style={{
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '10px',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '1.1rem',
                            transition: 'var(--transition)',
                            color: unreadCount > 0 ? 'var(--accent-indigo)' : 'var(--text-primary)',
                            position: 'relative'
                        }}
                        className="notif-btn"
                    >
                        <FiBell className={unreadCount > 0 ? 'pulse-indigo' : ''} />
                        {unreadCount > 0 && (
                            <span style={{
                                position: 'absolute',
                                top: -4,
                                right: -4,
                                background: 'var(--accent-red)',
                                color: 'white',
                                fontSize: '10px',
                                fontWeight: 800,
                                padding: '2px 5px',
                                borderRadius: '10px',
                                border: '2px solid var(--bg-card)',
                                boxShadow: '0 0 10px rgba(244,63,94,0.4)'
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notification Dropdown */}
                    {showNotifs && (
                        <div className="notif-dropdown zoom-glass-card shadow-dropdown">
                            <div className="notif-header">
                                <h3>Notifications</h3>
                                <button onClick={clearAll} className="clear-btn">Clear All</button>
                            </div>
                            <div className="notif-list">
                                {notifications.length > 0 ? (
                                    notifications.map(n => (
                                        <div 
                                            key={n._id} 
                                            className={`notif-item ${n.is_read ? 'read' : 'unread'}`}
                                            onClick={() => {
                                                markAsRead(n._id);
                                                if (n.data?.link) window.open(n.data.link, '_blank');
                                            }}
                                        >
                                            <div className="notif-icon">
                                                {n.type === 'meeting' ? <FiVideo className="text-indigo" /> : <FiMail />}
                                            </div>
                                            <div className="notif-body">
                                                <div className="notif-title">{n.title} {!n.is_read && <span className="new-dot"></span>}</div>
                                                <div className="notif-msg">{n.message}</div>
                                                <div className="notif-time">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="notif-empty">
                                        <FiMail size={32} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                        <p>No new notifications</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Role badge */}
                <span className={`badge navbar-role-badge ${user?.role === 'hr_manager' ? 'badge-purple' : user?.role === 'hr' ? 'badge-info' : hasManagementAccess ? 'badge-info' : 'badge-success'}`}>
                    {user?.role === 'hr_manager' ? <><FiShield /> HR Manager</> : user?.role === 'hr' ? <><FiUserCheck /> hr</> : <><FiUser /> Employee</>}
                </span>

                {/* Department — hide on small screens */}
                {user?.department_name && (
                    <span className="navbar-dept" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <FiBriefcase size={14} /> {user.department_name}
                    </span>
                )}

                {/* Avatar */}
                <div 
                    onClick={() => navigate('/dashboard/profile')}
                    style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: 'var(--gradient-primary)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.875rem', color: '#fff',
                    cursor: 'pointer', border: '2px solid rgba(99,102,241,0.4)',
                    flexShrink: 0
                }}>
                    {user?.name?.[0] || '?'}
                </div>
            </div>
        </header>
    );
}
