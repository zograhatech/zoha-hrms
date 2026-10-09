import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useBranding } from '../context/BrandingContext';
import API from '../api/axios';
import {
    FiBriefcase, FiShield, FiUserCheck, FiUser,
    FiCpu, FiPieChart, FiCalendar, FiCreditCard,
    FiMessageSquare, FiZap, FiLogIn, FiX,
    FiClock, FiLogOut, FiBell, FiVideo, FiEye, FiEyeOff
} from 'react-icons/fi';
import { useToast } from '../context/ToastContext';

// Removed DEMO_CREDENTIALS for security and privacy

export default function Login() {
    const { showToast } = useToast();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();

    // Forgot Password States
    const [showForgot, setShowForgot] = useState(false);
    const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
    const [forgotEmail, setForgotEmail] = useState('');
    const [otp, setOtp] = useState('');
    const [newPass, setNewPass] = useState('');
    const [forgotLoading, setForgotLoading] = useState(false);
    const [forgotError, setForgotError] = useState('');
    const [forgotSuccess, setForgotSuccess] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(email, password, rememberMe);
            showToast('Welcome back!', 'success');
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotError('');
        try {
            const { data } = await API.post('/auth/forgot-password', { email: forgotEmail });
            if (data.success) {
                setForgotStep(2);
                setForgotSuccess(data.message);
            }
        } catch (err) {
            setForgotError(err.response?.data?.message || 'Failed to send OTP');
        } finally {
            setForgotLoading(false);
        }
    };

    const handleResetSubmit = async (e) => {
        e.preventDefault();
        setForgotLoading(true);
        setForgotError('');
        try {
            const { data } = await API.post('/auth/reset-password', {
                email: forgotEmail,
                otp,
                newPassword: newPass
            });
            if (data.success) {
                setForgotStep(1);
                setShowForgot(false);
                setForgotEmail('');
                setOtp('');
                setNewPass('');
                showToast('Password reset successful! Please login.', 'success');
            }
        } catch (err) {
            setForgotError(err.response?.data?.message || 'Reset failed');
        } finally {
            setForgotLoading(false);
        }
    };

    const fillDemo = (account) => {
        setEmail(account.email);
        setPassword(account.password);
        setError('');
    };

    const features = [
        { label: 'AI HR Copilot', desc: 'Ask questions and get instant insights', icon: <FiCpu /> },
        { label: 'Real-time Analytics', desc: 'Track performance and trends globally', icon: <FiPieChart /> },
        { label: 'Leave & Attendance', desc: 'Automated tracking and smart approvals', icon: <FiCalendar /> },
        { label: 'Payroll & Compliance', desc: 'Accurate processing and tax calculation', icon: <FiCreditCard /> },
        { label: 'Smart Exit System', desc: 'Seamless offboarding and resignation tracking', icon: <FiLogOut /> },
        { label: 'Support & Helpdesk', desc: 'Resolve employee queries in real-time', icon: <FiMessageSquare /> },
        { label: 'Integrated Zoom', desc: 'Host and schedule meetings effortlessly', icon: <FiVideo /> },
        { label: 'Shift & Rosters', desc: 'Dynamic scheduling and workforce management', icon: <FiClock /> },
    ];

    return (
        <div className="login-page">
            <div className="login-bg">
                <div className="bg-blob bg-blob-1" />
                <div className="bg-blob bg-blob-2" />
                <div className="bg-blob bg-blob-3" />
            </div>

            <div className="login-container">
                <div className="login-left">
                    <div className="login-logo">
                        <div className="logo-icon" style={{ width: 64, height: 64, fontSize: '1.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                            <FiBriefcase />
                        </div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#fff' }}>{branding.company_name}</div>
                            <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{branding.company_subtext}</div>
                        </div>
                    </div>

                    <div className="login-brand-content">
                        <h1>Welcome Back! <FiZap className="text-warning" style={{ fontSize: '1.5rem' }} /></h1>
                        <p>Your intelligent HR Copilot is now enhanced with performance tracking, smart offboarding, and real-time collaboration tools.</p>

                        <div className="login-features">
                            {features.map(f => (
                                <div key={f.label} className="login-feature-item">
                                    <div className="feature-icon">{f.icon}</div>
                                    <div className="feature-info">
                                        <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.9rem' }}>{f.label}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)' }}>{f.desc}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="login-right">
                    <div className="login-form-card">
                        <div className="login-form-header">
                            <div className="login-form-branding">
                                {branding.company_logo ? (
                                    <img src={branding.company_logo} alt="Company Logo" className="form-logo" />
                                ) : (
                                    <div className="form-logo-icon"><FiBriefcase /></div>
                                )}
                                <span className="form-company-name">{branding.company_name}</span>
                            </div>
                            <h2>Sign In</h2>
                            <p>Enter your credentials to access the HRMS</p>
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}

                        <form onSubmit={handleLogin}>
                            <div className="form-group">
                                <label className="form-label">Email or Employee ID</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    placeholder="your email or Employee ID"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                    <label className="form-label" style={{ margin: 0 }}>Password</label>
                                    <button type="button" onClick={() => { setShowForgot(true); setForgotStep(1); setForgotError(''); setForgotSuccess(''); }} style={{ background: 'none', border: 'none', color: 'var(--accent-light)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>
                                        Forgot Password?
                                    </button>
                                </div>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        className="form-input"
                                        placeholder="••••••••"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        required
                                        style={{ paddingRight: '40px' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        {showPassword ? <FiEyeOff size={18} /> : <FiEye size={18} />}
                                    </button>
                                </div>
                            </div>
                            <div className="form-group" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', marginTop: '-10px', marginBottom: '20px' }}>
                                <input 
                                    type="checkbox" 
                                    id="remember" 
                                    checked={rememberMe} 
                                    onChange={e => setRememberMe(e.target.checked)} 
                                    style={{ width: '16px', height: '16px', marginRight: '8px', cursor: 'pointer', accentColor: 'var(--accent-primary)' }} 
                                />
                                <label htmlFor="remember" style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500, userSelect: 'none' }}>Stay logged in</label>
                            </div>
                            <button type="submit" className="btn btn-primary w-full btn-lg" disabled={loading} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                                {loading ? <><span className="loading-spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Signing in...</> : <><FiLogIn /> Sign In</>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            {showForgot && (
                <div className="modal-overlay" onClick={() => setShowForgot(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Reset Password</h3>
                            <button className="modal-close" onClick={() => setShowForgot(false)}><FiX /></button>
                        </div>
                        <div className="modal-body">
                            {forgotError && <div className="alert alert-error" style={{ marginBottom: 16 }}>{forgotError}</div>}
                            {forgotSuccess && forgotStep === 2 && <div className="alert alert-success" style={{ marginBottom: 16 }}>{forgotSuccess}</div>}

                            {forgotStep === 1 && (
                                <form onSubmit={handleForgotSubmit}>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                        Enter your registered email address and we'll send you an OTP to reset your password.
                                    </p>
                                    <div className="form-group">
                                        <label className="form-label">Email Address</label>
                                        <input
                                            type="email"
                                            className="form-input"
                                            placeholder="email address"
                                            value={forgotEmail}
                                            onChange={e => setForgotEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary w-full" disabled={forgotLoading}>
                                        {forgotLoading ? 'Sending...' : 'Send OTP'}
                                    </button>
                                </form>
                            )}

                            {forgotStep === 2 && (
                                <form onSubmit={e => { e.preventDefault(); setForgotStep(3); }}>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 16 }}>
                                        Check your email for the 6-digit OTP.
                                    </p>
                                    <div className="form-group">
                                        <label className="form-label">Enter OTP</label>
                                        <input
                                            type="text"
                                            className="form-input"
                                            placeholder="123456"
                                            maxLength="6"
                                            style={{ letterSpacing: 8, textAlign: 'center', fontSize: '1.2rem', fontWeight: 800 }}
                                            value={otp}
                                            onChange={e => setOtp(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 10 }}>
                                        <button type="button" className="btn btn-outline" onClick={() => setForgotStep(1)}>Back</button>
                                        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Verify OTP</button>
                                    </div>
                                </form>
                            )}

                            {forgotStep === 3 && (
                                <form onSubmit={handleResetSubmit}>
                                    <div className="form-group">
                                        <label className="form-label">New Password</label>
                                        <input
                                            type="password"
                                            className="form-input"
                                            placeholder="••••••••"
                                            value={newPass}
                                            onChange={e => setNewPass(e.target.value)}
                                            required
                                            minLength="6"
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary w-full" disabled={forgotLoading}>
                                        {forgotLoading ? 'Resetting...' : 'Reset Password'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <style>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          overflow: hidden;
          background: var(--bg-primary);
        }
        .login-bg { position: absolute; inset: 0; overflow: hidden; }
        .bg-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.2;
          animation: float 12s infinite ease-in-out alternate;
        }
        .bg-blob-1 { width: 800px; height: 800px; background: radial-gradient(circle, #6366f1 0%, transparent 70%); top: -300px; left: -300px; }
        .bg-blob-2 { width: 600px; height: 600px; background: radial-gradient(circle, #8b5cf6 0%, transparent 70%); bottom: -200px; right: -100px; animation-delay: -3s; }
        .bg-blob-3 { width: 500px; height: 500px; background: radial-gradient(circle, #10b981 0%, transparent 70%); top: 30%; left: 30%; animation-delay: -6s; opacity: 0.1; }
        @keyframes float {
          0% { transform: translate(0, 0) rotate(0deg) scale(1); }
          50% { transform: translate(30px, -50px) rotate(5deg) scale(1.1); }
          100% { transform: translate(-20px, 30px) rotate(-5deg) scale(1); }
        }

        .login-container {
          position: relative;
          z-index: 10;
          display: flex;
          width: 100%;
          max-width: 1000px;
          min-height: 580px;
          margin: 24px;
          border-radius: 24px;
          overflow: hidden;
          box-shadow: 0 40px 100px rgba(0,0,0,0.5);
          border: 1px solid var(--border-color);
        }

        .login-left {
          flex: 1;
          background: linear-gradient(135deg, rgba(45, 27, 105, 0.4) 0%, rgba(13, 21, 38, 0.4) 100%);
          padding: 48px;
          display: flex;
          flex-direction: column;
          gap: 40px;
          border-right: 1px solid rgba(255,255,255,0.06);
          position: relative;
          backdrop-filter: blur(10px);
        }
        .login-logo { display: flex; align-items: center; gap: 16px; }
        .login-brand-content h1 { font-size: 2.5rem; font-weight: 900; color: #fff; line-height: 1.1; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; letter-spacing: -0.03em; }
        .login-brand-content p { color: rgba(255,255,255,0.7); font-size: 1.05rem; line-height: 1.6; margin-bottom: 32px; max-width: 440px; }
        .login-features { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .login-feature-item {
          display: flex; align-items: start; gap: 12px;
          padding: 16px;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 16px;
          transition: all 0.3s ease;
        }
        .login-feature-item:hover { background: rgba(255,255,255,0.06); transform: translateY(-3px); border-color: rgba(255,255,255,0.1); }
        .feature-icon { color: #6366f1; font-size: 1.2rem; margin-top: 2px; }
        .feature-info { display: flex; flex-direction: column; gap: 4px; }

        .login-right {
          width: 420px;
          background: var(--bg-card);
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          --text-primary: #0f172a;
          --text-secondary: #475569;
          --text-muted: #64748b;
          color: var(--text-primary);
        }
        .login-form-card {}
        .login-form-header { margin-bottom: 28px; }
        .login-form-branding {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 20px;
        }
        .form-logo {
          width: 40px;
          height: 40px;
          object-fit: contain;
        }
        .form-logo-icon {
          width: 40px;
          height: 40px;
          background: var(--gradient-primary);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 1.2rem;
        }
        .form-company-name {
          font-size: 1.25rem;
          font-weight: 800;
          color: var(--text-primary);
          letter-spacing: -0.02em;
        }
        .login-form-header h2 { font-size: 1.6rem; font-weight: 800; color: var(--text-primary); }
        .login-form-header p { font-size: 0.875rem; color: var(--text-secondary); margin-top: 6px; }

        .login-demo { margin-top: 24px; }
        .login-demo p { font-size: 0.78rem; color: var(--text-muted); text-align: center; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
        .demo-buttons { display: flex; gap: 8px; flex-wrap: wrap; }
        .demo-btn {
          flex: 1;
          padding: 8px;
          background: rgba(99,102,241,0.08);
          border: 1px solid rgba(99,102,241,0.2);
          border-radius: 8px;
          color: var(--accent-light);
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: var(--transition);
          text-align: center;
          font-family: inherit;
        }
        .demo-btn:hover { background: rgba(99,102,241,0.18); border-color: var(--accent-primary); }

        @media (max-width: 768px) {
          .login-left { display: none; }
          .login-right { width: 100%; }
        }
      `}</style>
        </div>
    );
}
