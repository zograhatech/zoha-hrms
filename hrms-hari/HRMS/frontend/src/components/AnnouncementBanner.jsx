import { useState, useEffect } from 'react';
import API from '../api/axios';
import { FiVolume2, FiX, FiAlertTriangle, FiInfo } from 'react-icons/fi';

export default function AnnouncementBanner() {
    const [announcements, setAnnouncements] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchAnnouncements = async () => {
            try {
                const { data } = await API.get('/announcements');
                if (mounted && data.success) {
                    setAnnouncements(data.announcements);
                }
            } catch (error) {
                console.error('Error fetching announcements:', error);
            }
        };
        fetchAnnouncements();
        return () => { mounted = false; };
    }, []);

    if (!visible || announcements.length === 0) return null;

    const current = announcements[currentIndex];

    const getBannerStyles = () => {
        switch (current.priority) {
            case 'high':
                return { background: 'var(--gradient-red)', icon: <FiAlertTriangle /> };
            case 'medium':
                return { background: 'var(--gradient-primary)', icon: <FiVolume2 /> };
            default:
                return { background: 'var(--bg-secondary)', icon: <FiInfo />, border: '1px solid var(--border-color)' };
        }
    };

    const styles = getBannerStyles();

    return (
        <div style={{
            background: styles.background,
            color: '#fff',
            padding: '10px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 20,
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            border: styles.border || 'none',
            position: 'relative',
            overflow: 'hidden',
            animation: 'slideDown 0.4s ease-out'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                <span style={{ fontSize: '1.2rem', display: 'flex' }}>
                    {styles.icon}
                </span>
                <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 800, fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.9 }}>
                        Announcement:
                    </span>
                    <span style={{ marginLeft: 8, fontSize: '0.9rem', fontWeight: 500 }}>
                        {current.title} — {current.content}
                    </span>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {announcements.length > 1 && (
                    <div style={{ display: 'flex', gap: 4 }}>
                        {announcements.map((_, idx) => (
                            <div
                                key={idx}
                                onClick={() => setCurrentIndex(idx)}
                                style={{
                                    width: 6, height: 6, borderRadius: '50%',
                                    background: currentIndex === idx ? '#fff' : 'rgba(255,255,255,0.3)',
                                    cursor: 'pointer'
                                }}
                            />
                        ))}
                    </div>
                )}
                <button
                    onClick={() => setVisible(false)}
                    style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 4, display: 'flex', opacity: 0.7 }}
                >
                    <FiX />
                </button>
            </div>

            <style>{`
                @keyframes slideDown {
                    from { transform: translateY(-20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
            `}</style>
        </div>
    );
}
