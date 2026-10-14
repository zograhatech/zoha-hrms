import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import API from '../api/axios';
import { useBranding } from '../context/BrandingContext';
import { FiCheckCircle, FiAlertCircle, FiLogIn, FiBriefcase } from 'react-icons/fi';

export default function VerifyEmail() {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();
    const { branding } = useBranding();

    const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            setMessage('No verification token provided in the URL.');
            return;
        }

        const verify = async () => {
            try {
                const { data } = await API.post('/auth/verify-email', { token });
                if (data.success) {
                    setStatus('success');
                    setMessage(data.message || 'Email verified successfully! You can now log in.');
                } else {
                    setStatus('error');
                    setMessage(data.message || 'Verification failed.');
                }
            } catch (err) {
                setStatus('error');
                setMessage(err.response?.data?.message || err.message || 'Invalid or expired verification link.');
            }
        };

        verify();
    }, [token]);

    return (
        <div className="login-page">
            <div className="login-card-wrapper" style={{ maxWidth: 480, margin: '60px auto' }}>
                <div className="login-form-card" style={{ padding: 40, textAlign: 'center' }}>
                    <div className="login-form-header" style={{ marginBottom: 24 }}>
                        <div className="login-form-branding" style={{ justifyContent: 'center' }}>
                            {branding.company_logo ? (
                                <img src={branding.company_logo} alt="Company Logo" className="form-logo" />
                            ) : (
                                <div className="form-logo-icon"><FiBriefcase /></div>
                            )}
                            <span className="form-company-name">{branding.company_name}</span>
                        </div>
                    </div>

                    {status === 'verifying' && (
                        <div>
                            <div className="loading-spinner" style={{ width: 40, height: 40, margin: '20px auto' }} />
                            <h2>Verifying your email...</h2>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>Please wait while we verify your account.</p>
                        </div>
                    )}

                    {status === 'success' && (
                        <div>
                            <div style={{ color: '#10b981', fontSize: 48, marginBottom: 16 }}>
                                <FiCheckCircle style={{ display: 'inline-block' }} />
                            </div>
                            <h2 style={{ color: '#10b981', marginBottom: 12 }}>Email Verified!</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{message}</p>
                            <Link to="/login" className="btn btn-primary w-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <FiLogIn /> Proceed to Sign In
                            </Link>
                        </div>
                    )}

                    {status === 'error' && (
                        <div>
                            <div style={{ color: '#ef4444', fontSize: 48, marginBottom: 16 }}>
                                <FiAlertCircle style={{ display: 'inline-block' }} />
                            </div>
                            <h2 style={{ color: '#ef4444', marginBottom: 12 }}>Verification Failed</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>{message}</p>
                            <Link to="/login" className="btn btn-primary w-full" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                                <FiLogIn /> Return to Sign In
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

