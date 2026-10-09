import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { 
    FiLogOut, FiCalendar, FiFileText, FiRefreshCw, FiAlertCircle, 
    FiCheckCircle, FiXCircle, FiDownload, FiAward, FiShield, FiExternalLink
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';
import ResignationModal from '../../components/ResignationModal';

export default function ExitManagement() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [resignation, setResignation] = useState(null);
    const [payslips, setPayslips] = useState([]);
    const [leaves, setLeaves] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);

    const fetchData = async () => {
        try {
            const [resRes, payRes, leaveRes] = await Promise.all([
                API.get('/resignations/my'),
                API.get('/payroll/my'),
                API.get('/leaves/my')
            ]);
            setResignation(resRes.data.resignation);
            setPayslips(payRes.data.payrolls || []);
            setLeaves(leaveRes.data.leaves || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleRevoke = async () => {
        const reason = window.prompt('Please provide a reason for revoking your resignation:');
        if (reason === null) return;
        if (!reason.trim()) return showToast('Reason is required', 'warning');

        try {
            await API.put(`/resignations/${resignation._id}/revoke`, { reason });
            showToast('Revoke request submitted for HR approval.', 'success');
            fetchData();
        } catch (error) {
            showToast('Failed to submit revoke request.', 'error');
        }
    };

    const downloadCertificate = () => {
        window.open(`${API.defaults.baseURL}/resignations/${resignation._id}/certificate`, '_blank');
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const showApplyButton = !resignation || ['rejected', 'revoke'].includes(resignation.status);

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiLogOut style={{ marginRight: 8, verticalAlign: 'middle' }} /> Exit Track</div>
                    <div className="page-subtitle">Personalized offboarding and document center</div>
                </div>
                {showApplyButton && (
                    <button className="btn btn-danger" onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiLogOut /> Initiate Resignation
                    </button>
                )}
            </div>

            {!resignation && (
                <div className="card text-center" style={{ padding: '80px 20px', background: 'var(--bg-card)', border: '2px dashed var(--border-color)', borderRadius: 24 }}>
                    <div style={{ fontSize: '3.5rem', marginBottom: 20, color: 'var(--accent-primary)', opacity: 0.2 }}><FiFileText style={{ margin: '0 auto' }} /></div>
                    <h3 style={{ fontWeight: 800, marginBottom: 10 }}>No Active Exit Record</h3>
                    <p style={{ color: 'var(--text-secondary)', maxWidth: 500, margin: '0 auto 24px', lineHeight: 1.6 }}>
                        Your exit process hasn't started yet. If you are planning to transition, you can start the official documentation here.
                    </p>
                    <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ padding: '12px 40px', borderRadius: 12, fontWeight: 700 }}>
                        Apply for Resignation
                    </button>
                </div>
            )}

            {resignation && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 24 }}>
                    
                    {/* Status Card */}
                    <div className="card" style={{ borderLeft: '5px solid var(--accent-primary)', padding: 32 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                                    <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.4rem' }}>Resignation Status</h3>
                                    <span className={`badge badge-${
                                        resignation.status === 'approved' ? 'success' : 
                                        resignation.status === 'pending' ? 'warning' : 
                                        resignation.status === 'rejected' ? 'danger' : 'info'
                                    }`} style={{ padding: '6px 12px', borderRadius: 8 }}>
                                        {resignation.status.toUpperCase()}
                                    </span>
                                </div>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <FiCalendar size={14} /> Submitted {formatDate(resignation.createdAt)}
                                </p>
                            </div>
                            {['pending', 'approved'].includes(resignation.status) && (
                                <button className="btn btn-outline" onClick={handleRevoke} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#ef4444', borderColor: '#ef4444' }}>
                                    <FiRefreshCw /> Revoke Request
                                </button>
                            )}
                        </div>

                        {/* Relieving Certificate Card - PREMIUM DISPLAY */}
                        {resignation.relieving_certificate && resignation.status === 'approved' && (
                            <div style={{ 
                                marginTop: 24, 
                                padding: '24px', 
                                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                                borderRadius: 16, 
                                color: '#fff',
                                boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                    <div style={{ width: 50, height: 50, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <FiAward size={28} />
                                    </div>
                                    <div>
                                        <h4 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem' }}>Relieving Certificate Issued</h4>
                                        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.9 }}>Your official conduct & service letter is ready.</p>
                                    </div>
                                </div>
                                <button 
                                    onClick={downloadCertificate}
                                    style={{ 
                                        background: '#fff', color: '#059669', border: 'none', 
                                        padding: '10px 20px', borderRadius: 12, fontWeight: 800,
                                        display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer'
                                    }}
                                >
                                    <FiDownload /> Get Document
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginTop: 30 }}>
                            <div style={{ padding: 20, background: 'var(--bg-hover)', borderRadius: 16 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Exit Date</div>
                                <div style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ef4444' }}>
                                    {formatDate(resignation.last_working_day)}
                                </div>
                            </div>
                            <div style={{ padding: 20, background: 'var(--bg-hover)', borderRadius: 16 }}>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>Settlement Info</div>
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)' }}>
                                    {resignation.status === 'approved' ? 'In Progress' : 'Pending Approval'}
                                </div>
                            </div>
                        </div>

                        {resignation.hr_comments && (
                            <div style={{ marginTop: 24, padding: 20, background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                                <div style={{ fontWeight: 800, fontSize: '0.75rem', marginBottom: 6, textTransform: 'uppercase', color: 'var(--text-muted)' }}>HR Feedback:</div>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>"{resignation.hr_comments}"</p>
                            </div>
                        )}
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {/* Reason Card */}
                        <div className="card">
                            <h3 style={{ marginBottom: 16, fontWeight: 800 }}>Primary Reason</h3>
                            <div style={{ padding: 20, background: 'var(--bg-hover)', borderRadius: 16, fontSize: '0.95rem', lineHeight: 1.6 }}>
                                {resignation.reason}
                            </div>
                        </div>

                        {/* Document History / Payslips */}
                        <div className="card">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                                <h3 style={{ margin: 0, fontWeight: 800, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <FiShield className="text-primary" /> Verified History
                                </h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>DISBURSED LOGS</div>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {payslips.length > 0 ? payslips.slice(0, 4).map(p => (
                                    <div key={p._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', background: 'var(--bg-hover)', borderRadius: 16, border: '1px solid var(--border-color)' }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>{p.month} {p.year}</div>
                                            <div style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>₹{p.net_salary.toLocaleString()} · Credited</div>
                                        </div>
                                        <button className="btn btn-sm btn-outline" onClick={() => window.location.href = `/dashboard/payroll`} style={{ borderRadius: 8 }}>
                                            View
                                        </button>
                                    </div>
                                )) : (
                                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', padding: '20px' }}>No payslips found.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <ResignationModal 
                    isOpen={showModal} 
                    onClose={(refresh) => {
                        setShowModal(false);
                        if (refresh) fetchData();
                    }}
                    employee={user}
                />
            )}
        </div>
    );
}
