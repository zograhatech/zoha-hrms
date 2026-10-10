import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import {
    FiUser, FiFileText, FiCalendar, FiBriefcase, FiHash, FiMail, FiPhone, FiHome, FiCheckCircle, FiShield, FiClock, FiPrinter, FiX, FiActivity, FiUmbrella, FiRotateCcw, FiShieldOff, FiUserCheck, FiDownload, FiAward
} from 'react-icons/fi';

import { formatDate } from '../../utils/dateFormatter';
import { useToast } from '../../context/ToastContext';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function InactiveDashboard() {
    const { user } = useAuth();
    const { branding } = useBranding();
    const { showToast } = useToast();
    const [activeTab, setActiveTab] = useState('profile');
    const [profile, setProfile] = useState(null);
    const [leaves, setLeaves] = useState([]);
    const [payrolls, setPayrolls] = useState([]);
    const [verificationRequests, setVerificationRequests] = useState([]);
    const [resignation, setResignation] = useState(null);
    const [loading, setLoading] = useState(true);

    
    // Payslip viewing states
    const [viewingPayslip, setViewingPayslip] = useState(null);
    const [payslipData, setPayslipData] = useState(null);
    const [payslipLoading, setPayslipLoading] = useState(false);

    useEffect(() => {
        if (!user?.id) return;
        setLoading(true);
        Promise.all([
            API.get(`/employees/${user.id}`).catch(() => ({ data: { employee: null } })),
            API.get(`/leaves/${user.id}`).catch(() => ({ data: { leaves: [] } })),
            API.get(`/payroll/${user.id}`).catch(() => ({ data: { payroll: [] } })),
            API.get('/verification/mine').catch(() => ({ data: { requests: [] } })),
            API.get('/resignations/my').catch(() => ({ data: { resignation: null } }))
        ]).then(([empRes, leaveRes, payRes, verifyRes, resignRes]) => {
            setProfile(empRes.data.employee);
            setLeaves(leaveRes.data.leaves || []);
            setPayrolls(Array.isArray(payRes.data.payroll) ? payRes.data.payroll : [payRes.data.payroll].filter(Boolean));
            setVerificationRequests(verifyRes.data.requests || []);
            setResignation(resignRes.data.resignation);
            setLoading(false);
        }).catch(err => {

            console.error('Error fetching inactive dashboard data:', err);
            setLoading(false);
        });
    }, [user?.id]);

    const fetchPayslipDetails = async (month, year) => {
        setPayslipLoading(true);
        try {
            const { data } = await API.get(`/payroll/${user.id}?month=${month}&year=${year}`);
            setPayslipData(data);
        } catch (err) {
            showToast('Failed to load payslip details.', 'error');
        } finally {
            setPayslipLoading(false);
        }
    };

    const handleViewPayslip = (pr) => {
        setViewingPayslip(pr);
        fetchPayslipDetails(pr.month, pr.year);
    };

    const downloadDocument = async (docId, docName = 'document') => {
        if (!resignation) return;
        try {
            const res = await API.get(`/resignations/${resignation._id}/documents/${docId}`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = docName;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        } catch {
            alert('Failed to download document.');
        }
    };

    const fmt = (v) => v ? `₹${parseFloat(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '₹0.00';

    if (loading) return (
        <div className="page-loader">
            <div className="loading-spinner" />
            <span>Preparing your records...</span>
        </div>
    );

    const tabs = [
        { id: 'profile', label: 'My Profile', icon: <FiUser /> },
        { id: 'leaves', label: 'Leave History', icon: <FiCalendar /> },
        { id: 'payroll', label: 'Payslip History', icon: <FiFileText /> },
        { id: 'verify', label: 'Verification Requests', icon: <FiUserCheck />, badge: verificationRequests.filter(r => r.status === 'pending').length },
        { id: 'attachments', label: 'Attachments', icon: <FiDownload /> }
    ];

    const handleVerificationResponse = async (id, status) => {
        try {
            await API.put(`/verification/${id}/respond`, { status });
            showToast(`Verification ${status} successfully.`, 'success');
            // Refresh requests
            const { data } = await API.get('/verification/mine');
            setVerificationRequests(data.requests || []);
        } catch (err) {
            showToast('Failed to process response.', 'error');
        }
    };


    return (
        <div className="inactive-dashboard">
            {/* Header Banner */}
            <div className="card" style={{ 
                marginBottom: 24, 
                background: 'var(--gradient-primary)', 
                color: '#fff',
                border: 'none',
                position: 'relative',
                overflow: 'hidden'
            }}>
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <h1 style={{ fontSize: '1.8rem', fontWeight: 900, marginBottom: 8 }}>
                        Welcome back, {user?.name?.split(' ')[0]}!
                    </h1>
                    <p style={{ opacity: 0.9, fontSize: '0.95rem', maxWidth: 600 }}>
                        Your account is currently inactive since you have transitioned out of the organization. 
                        You can still access your profile records, leave history, and download past payslips for your reference.
                    </p>
                </div>
                {/* Decorative background icon */}
                <FiShield style={{ 
                    position: 'absolute', 
                    right: -20, 
                    bottom: -20, 
                    fontSize: '10rem', 
                    opacity: 0.1,
                    transform: 'rotate(-15deg)'
                }} />
            </div>

            {/* Tab Navigation */}
            <div style={{ 
                display: 'flex', 
                gap: 2, 
                background: 'var(--border-color)', 
                padding: 4, 
                borderRadius: 12, 
                marginBottom: 24,
                width: 'fit-content'
            }}>
                {tabs.map(tab => (
                    <button 
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`btn ${activeTab === tab.id ? 'btn-primary' : ''}`}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 8, 
                            border: 'none',
                            padding: '10px 20px',
                            background: activeTab === tab.id ? undefined : 'transparent',
                            color: activeTab === tab.id ? undefined : 'var(--text-secondary)'
                        }}
                    >
                        {tab.icon} {tab.label}
                        {tab.badge > 0 && <span style={{ marginLeft: 8, background: 'var(--accent-red)', color: '#fff', fontSize: '0.7rem', padding: '2px 6px', borderRadius: 10 }}>{tab.badge}</span>}
                    </button>

                ))}
            </div>

            {/* Profile Tab */}
            {activeTab === 'profile' && profile && (
                <div className="grid-2">
                    <div className="card text-center" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '40px 20px' }}>
                        <div style={{
                            width: 140, height: 140, borderRadius: '50%',
                            background: 'var(--gradient-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '3.5rem', fontWeight: 900, color: '#fff',
                            boxShadow: '0 8px 30px rgba(99,102,241,0.3)',
                            overflow: 'hidden'
                        }}>
                            {profile.profile_image ? (
                                <img 
                                    src={profile.profile_image.startsWith('http') ? profile.profile_image : `${import.meta.env.VITE_API_BASE_URL || ''}${profile.profile_image}`} 
                                    alt={profile.name} 
                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                />
                            ) : (
                                profile.name?.[0] || '?'
                            )}
                        </div>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{profile.name}</h2>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', marginTop: 4 }}>{profile.designation}</p>
                            <span className="badge badge-danger" style={{ marginTop: 12, fontSize: '0.8rem', padding: '6px 16px' }}>
                                INACTIVE EMPLOYEE
                            </span>
                        </div>
                    </div>

                    <div className="card">
                        <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiBriefcase className="text-primary" /> Service Record
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {[
                                { label: 'Employee ID', value: profile.id, icon: <FiHash /> },
                                { label: 'Email Address', value: profile.email, icon: <FiMail /> },
                                { label: 'Contact Phone', value: profile.personal_phone || profile.phone || 'N/A', icon: <FiPhone /> },
                                { label: 'Department', value: profile.department_name || 'N/A', icon: <FiBriefcase /> },
                                { label: 'Joining Date', value: formatDate(profile.date_of_joining), icon: <FiCalendar /> },
                                { label: 'Personal Email', value: profile.personal_email || 'N/A', icon: <FiMail /> },
                                { label: 'Current Address', value: profile.address || 'N/A', icon: <FiHome /> },
                            ].map((f, i) => (
                                <div key={i} style={{ 
                                    display: 'flex', 
                                    justifyContent: 'space-between', 
                                    padding: '12px 0', 
                                    borderBottom: i === 6 ? 'none' : '1px solid var(--border-color)' 
                                }}>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {f.icon} {f.label}
                                    </span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{f.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Leaves Tab */}
            {activeTab === 'leaves' && (
                <div className="card">
                    <div className="flex-between" style={{ marginBottom: 20 }}>
                        <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiCalendar className="text-primary" /> Past Leave Records
                        </h3>
                    </div>
                    {leaves.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Leave Type</th>
                                        <th>Duration</th>
                                        <th>Total Days</th>
                                        <th>Status</th>
                                        <th>Applied On</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {leaves.map(l => (
                                        <tr key={l._id}>
                                            <td style={{ textTransform: 'capitalize', fontWeight: 600 }}>{l.leave_type} Leave</td>
                                            <td>{formatDate(l.start_date)} - {formatDate(l.end_date)}</td>
                                            <td>{l.total_days}</td>
                                            <td><span className={`badge badge-${l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}`}>{l.status}</span></td>
                                            <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(l.createdAt)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                            <FiCalendar size={50} style={{ marginBottom: 12 }} />
                            <p>No leave history records found.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Payroll Tab */}
            {activeTab === 'payroll' && (
                <div className="card">
                    <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiFileText className="text-primary" /> Historical Payslips
                    </h3>
                    {payrolls.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Month & Year</th>
                                        <th>Net Salary</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrolls.map(pr => (
                                        <tr key={pr._id}>
                                            <td style={{ fontWeight: 700 }}>{MONTHS[pr.month - 1]} {pr.year}</td>
                                            <td style={{ fontWeight: 800, color: 'var(--accent-green)' }}>{fmt(pr.actual_payable || pr.net_salary)}</td>
                                            <td><span className={`badge badge-${pr.status === 'paid' ? 'success' : 'warning'}`}>{pr.status}</span></td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button 
                                                    className="btn btn-sm btn-outline" 
                                                    onClick={() => handleViewPayslip(pr)}
                                                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                                                >
                                                    <FiFileText size={14} /> View Payslip
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                            <FiFileText size={50} style={{ marginBottom: 12 }} />
                            <p>No payroll records found.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Verification Tab */}
            {activeTab === 'verify' && (
                <div className="card">
                    <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiUserCheck className="text-primary" /> Employment Verification Requests
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 20 }}>
                        Other companies may request verification of your service history. Your data is only shared with these companies after you provide explicit consent.
                    </p>
                    {verificationRequests.length > 0 ? (
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Requestor</th>
                                        <th>Company</th>
                                        <th>Date</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: 'right' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {verificationRequests.map(r => (
                                        <tr key={r._id}>
                                            <td style={{ fontWeight: 600 }}>{r.requestor_name}</td>
                                            <td style={{ color: 'var(--text-secondary)' }}>{r.requestor_company}</td>
                                            <td style={{ fontSize: '0.8rem' }}>{formatDate(r.createdAt)}</td>
                                            <td>
                                                <span className={`badge badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}`}>
                                                    {r.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                {r.status === 'pending' ? (
                                                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                                        <button 
                                                            className="btn btn-sm btn-outline-danger" 
                                                            onClick={() => handleVerificationResponse(r._id, 'rejected')}
                                                            title="Reject Verification"
                                                        >
                                                            Reject
                                                        </button>
                                                        <button 
                                                            className="btn btn-sm btn-primary" 
                                                            onClick={() => handleVerificationResponse(r._id, 'approved')}
                                                        >
                                                            Approve
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                        {r.status === 'approved' ? 'Data Shared' : 'Request Declined'}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                            <FiUserCheck size={50} style={{ marginBottom: 12 }} />
                            <p>No verification requests found.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Attachments Tab */}
            {activeTab === 'attachments' && (
                <div className="card">
                    <h3 style={{ marginBottom: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiDownload className="text-primary" /> Official Attachments
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 24 }}>
                        Download your official documents and certificates issued by the organization.
                    </p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                        {resignation?.documents && resignation.documents.length > 0 ? (
                            resignation.documents.map(doc => (
                                <div key={doc._id} style={{ 
                                    padding: 24, 
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', 
                                    borderRadius: 16, 
                                    color: '#fff',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.2)'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, overflow: 'hidden' }}>
                                        <div style={{ width: 44, height: 44, background: 'rgba(255,255,255,0.2)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <FiAward size={24} />
                                        </div>
                                        <div style={{ overflow: 'hidden' }}>
                                            <h4 style={{ margin: 0, fontWeight: 800, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{doc.name}</h4>
                                            <p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.9 }}>Issued via HRMS System</p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => downloadDocument(doc._id)}
                                        style={{ background: '#fff', color: '#4338ca', border: 'none', padding: '8px 16px', borderRadius: 10, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                                    >
                                        Download
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5, border: '2px dashed var(--border-color)', borderRadius: 16, gridColumn: '1 / -1' }}>
                                <FiDownload size={50} style={{ marginBottom: 12 }} />
                                <p>No official certificates have been issued to your account yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Payslip Modal (Re-used from Payroll.jsx) */}

            {viewingPayslip && (
                <div className="modal-overlay" onClick={() => setViewingPayslip(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '950px', width: '95%', padding: '0' }}>
                        <div className="modal-header" style={{ padding: '20px 24px', position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 10, borderBottom: '1px solid var(--border-color)' }}>
                            <h3 className="modal-title">Payslip: {MONTHS[viewingPayslip.month-1]} {viewingPayslip.year}</h3>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className="btn btn-outline btn-sm" onClick={() => window.print()}>
                                    <FiPrinter /> Print
                                </button>
                                <button className="modal-close" onClick={() => setViewingPayslip(null)}><FiX /></button>
                            </div>
                        </div>
                        <div className="modal-body" style={{ background: '#f8fafc', padding: '30px 20px' }}>
                            {payslipLoading ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}><div className="loading-spinner" style={{ margin: '0 auto' }} /></div>
                            ) : payslipData ? (
                                <div id="payslip" className="zoho-payslip" style={{ boxShadow: 'none' }}>
                                    <div className="payslip-header-flex">
                                        <div className="company-branding">
                                            {branding.company_logo ? (
                                                <img src={branding.company_logo} alt="Logo" className="zoho-logo" />
                                            ) : (
                                                <div className="zoho-logo-placeholder"><FiBriefcase /></div>
                                            )}
                                            <div className="company-details">
                                                <h1 className="zoho-company-name">{branding.company_name}</h1>
                                                <p className="zoho-company-address">{branding.company_address}</p>
                                            </div>
                                        </div>
                                        <div className="payslip-title-box">
                                            <span className="payslip-subtitle">Historical Payslip</span>
                                            <h2 className="payslip-month-year">{MONTHS[viewingPayslip.month-1]} {viewingPayslip.year}</h2>
                                        </div>
                                    </div>

                                    {/* Simple Summary */}
                                    <div className="payslip-summary-grid">
                                        <div className="employee-info">
                                            <h3 className="section-header">EMPLOYEE SUMMARY</h3>
                                            <div className="info-row"><span>Employee Name</span> <span>: <b>{payslipData.employee?.name}</b></span></div>
                                            <div className="info-row"><span>Employee ID</span> <span>: {user?.id}</span></div>
                                            <div className="info-row"><span>Designation</span> <span>: {payslipData.employee?.designation}</span></div>
                                            <div className="info-row"><span>Pay Period</span> <span>: {MONTHS[viewingPayslip.month-1]} {viewingPayslip.year}</span></div>
                                        </div>
                                        <div className="net-pay-highlight">
                                            <div className="net-pay-card">
                                                <div className="net-pay-amount">{fmt(payslipData.payroll?.actual_payable)}</div>
                                                <div className="net-pay-label">Net Pay Transferred</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Financial Details Table */}
                                    <table className="zoho-table" style={{ marginTop: 24 }}>
                                        <thead>
                                            <tr>
                                                <th>DESCRIPTION</th>
                                                <th style={{ textAlign: 'right' }}>EARNINGS</th>
                                                <th style={{ textAlign: 'right' }}>DEDUCTIONS</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr>
                                                <td>Basic & Allowances</td>
                                                <td style={{ textAlign: 'right' }}>{fmt(payslipData.payroll?.basic + payslipData.payroll?.da + payslipData.payroll?.oa)}</td>
                                                <td></td>
                                            </tr>
                                            {payslipData.payroll?.leave_wages > 0 && (
                                                <tr>
                                                    <td>Leave Wages</td>
                                                    <td style={{ textAlign: 'right' }}>{fmt(payslipData.payroll?.leave_wages)}</td>
                                                    <td></td>
                                                </tr>
                                            )}
                                            {payslipData.payroll?.provident_fund > 0 && (
                                                <tr>
                                                    <td>Provident Fund (PF)</td>
                                                    <td></td>
                                                    <td style={{ textAlign: 'right' }}>{fmt(payslipData.payroll?.provident_fund)}</td>
                                                </tr>
                                            )}
                                            {payslipData.payroll?.esi_deduction > 0 && (
                                                <tr>
                                                    <td>E.S.I</td>
                                                    <td></td>
                                                    <td style={{ textAlign: 'right' }}>{fmt(payslipData.payroll?.esi_deduction)}</td>
                                                </tr>
                                            )}
                                            {(payslipData.payroll?.pt || 0) + (payslipData.payroll?.lwf || 0) + (payslipData.payroll?.tds || 0) > 0 && (
                                                <tr>
                                                    <td>Taxes (PT/LWF/TDS)</td>
                                                    <td></td>
                                                    <td style={{ textAlign: 'right' }}>{fmt((payslipData.payroll?.pt || 0) + (payslipData.payroll?.lwf || 0) + (payslipData.payroll?.tds || 0))}</td>
                                                </tr>
                                            )}
                                            {payslipData.payroll?.leave_deduction > 0 && (
                                                <tr>
                                                    <td>Leave Deductions</td>
                                                    <td></td>
                                                    <td style={{ textAlign: 'right' }}>{fmt(payslipData.payroll?.leave_deduction)}</td>
                                                </tr>
                                            )}
                                            <tr className="zoho-total-row">
                                                <td><b>Total</b></td>
                                                <td style={{ textAlign: 'right' }}><b>{fmt((payslipData.payroll?.basic || 0) + (payslipData.payroll?.da || 0) + (payslipData.payroll?.oa || 0) + (payslipData.payroll?.leave_wages || 0))}</b></td>
                                                <td style={{ textAlign: 'right' }}><b>{fmt((payslipData.payroll?.provident_fund || 0) + (payslipData.payroll?.esi_deduction || 0) + (payslipData.payroll?.pt || 0) + (payslipData.payroll?.lwf || 0) + (payslipData.payroll?.tds || 0) + (payslipData.payroll?.leave_deduction || 0))}</b></td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div className="zoho-footer-summary">
                                        <div className="net-payable-row">
                                            <span><b>FINAL NET PAYABLE</b></span>
                                            <span className="final-net-pay">{fmt(payslipData.payroll?.actual_payable)}</span>
                                        </div>
                                    </div>

                                    <div className="payslip-disclaimer">
                                        -- This is a computer-generated historical record provided by {branding.company_name} --
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
