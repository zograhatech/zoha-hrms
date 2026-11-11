import { FiClock, FiAlertTriangle, FiLogOut, FiCheckCircle } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export default function IdleWarningModal({ show, secondsRemaining, onStaySignedIn }) {
    const { logout } = useAuth();

    if (!show) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="idle-modal-title"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 99999,
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '16px',
                animation: 'fadeIn 0.2s ease-out'
            }}
        >
            <div
                style={{
                    backgroundColor: 'var(--bg-secondary, #1e293b)',
                    color: 'var(--text-primary, #f8fafc)',
                    borderRadius: '16px',
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1)',
                    maxWidth: '440px',
                    width: '100%',
                    padding: '28px',
                    textAlign: 'center',
                    border: '1px solid rgba(239, 68, 68, 0.3)'
                }}
            >
                <div
                    style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        backgroundColor: 'rgba(239, 68, 68, 0.15)',
                        color: '#ef4444',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 18px',
                        fontSize: '32px'
                    }}
                >
                    <FiAlertTriangle />
                </div>

                <h3
                    id="idle-modal-title"
                    style={{
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        marginBottom: '8px',
                        color: 'var(--text-primary, #ffffff)'
                    }}
                >
                    Inactive Session Warning
                </h3>

                <p
                    style={{
                        fontSize: '0.9rem',
                        color: 'var(--text-secondary, #94a3b8)',
                        lineHeight: 1.5,
                        marginBottom: '20px'
                    }}
                >
                    You have been inactive for a while. To protect your account security and ensure accurate attendance tracking, your session will automatically close in:
                </p>

                <div
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        backgroundColor: 'rgba(239, 68, 68, 0.12)',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '12px',
                        padding: '10px 20px',
                        marginBottom: '24px',
                        color: '#ef4444',
                        fontWeight: 800,
                        fontSize: '1.5rem',
                        fontVariantNumeric: 'tabular-nums'
                    }}
                >
                    <FiClock />
                    <span>{secondsRemaining}s</span>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                        type="button"
                        onClick={onStaySignedIn}
                        style={{
                            flex: 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            backgroundColor: 'var(--accent-primary, #4f46e5)',
                            color: '#ffffff',
                            border: 'none',
                            padding: '12px 18px',
                            borderRadius: '10px',
                            fontSize: '0.95rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FiCheckCircle />
                        Stay Signed In
                    </button>

                    <button
                        type="button"
                        onClick={logout}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            backgroundColor: 'transparent',
                            color: 'var(--text-secondary, #94a3b8)',
                            border: '1px solid rgba(148, 163, 184, 0.25)',
                            padding: '12px 16px',
                            borderRadius: '10px',
                            fontSize: '0.9rem',
                            fontWeight: 500,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FiLogOut />
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}
