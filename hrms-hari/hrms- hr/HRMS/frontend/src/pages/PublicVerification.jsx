import { useState, useEffect } from 'react';
import API from '../api/axios';
import { useBranding } from '../context/BrandingContext';
import { 
    FiShield, FiSearch, FiFileText, FiCheckCircle, FiXCircle, 
    FiArrowRight, FiUser, FiBriefcase, FiCalendar, FiClock, FiActivity, FiLock, FiPrinter,
    FiCreditCard, FiDollarSign, FiAward, FiDownload, FiExternalLink, FiClipboard, FiUserCheck,
    FiHash, FiMail, FiPhone, FiHome, FiAlertCircle
} from 'react-icons/fi';
import { formatDate } from '../utils/dateFormatter';
import { useToast } from '../context/ToastContext';

/**
 * PublicVerification - Redesigned Employment Verification Portal
 */
export default function PublicVerification() {
    const { branding } = useBranding();
    const { showToast } = useToast();
    const [step, setStep] = useState('search'); // 'search', 'request_form', 'submitted', 'view_data'
    const [employeeId, setEmployeeId] = useState('');
    const [searching, setSearching] = useState(false);
    
    // Request form states
    const [form, setForm] = useState({
        requestorName: '',
        requestorEmail: '',
        requestorCompany: ''
    });
    const [submitting, setSubmitting] = useState(false);
    const [requestId, setRequestId] = useState(null);

    // Verified data
    const [verifiedData, setVerifiedData] = useState(null);
    const [checkInterval, setCheckInterval] = useState(null);
    const [activeTab, setActiveTab] = useState('profile');

    const handleSearch = async (e) => {
        if (e) e.preventDefault();
        setSearching(true);
        setTimeout(() => {
            setStep('request_form');
            setSearching(false);
        }, 800);
    };

    const handleRequest = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const { data } = await API.post('/verification/request', {
                employeeId,
                ...form
            });
            setRequestId(data.requestId);
            setStep('submitted');
            
            const interval = setInterval(async () => {
                try {
                    const res = await API.get(`/verification/check/${data.requestId}`);
                    if (res.data.success && res.data.data) {
                        setVerifiedData(res.data.data);
                        setStep('view_data');
                        clearInterval(interval);
                    }
                } catch (err) {
                }
            }, 5000);
            setCheckInterval(interval);

        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to submit request.', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    useEffect(() => {
        return () => {
            if (checkInterval) clearInterval(checkInterval);
        };
    }, [checkInterval]);

    const logoGradient = 'linear-gradient(135deg, #FF512F 0%, #DD2476 50%, #00d2ff 100%)';
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const tabs = [
        { id: 'profile', label: 'Service Profile', icon: <FiUser /> },
        { id: 'payroll', label: 'Payslip History', icon: <FiCreditCard /> },
        { id: 'verify', label: 'Verification Identity', icon: <FiShield /> },
        { id: 'attachments', label: 'Attachments', icon: <FiDownload /> }
    ];

    return (
        <div className="verification-page" style={{ 
            minHeight: '100vh', 
            background: '#f1f5f9', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            padding: '40px 20px'
        }}>
            <div className="verification-container" style={{ 
                maxWidth: 1000, 
                width: '100%', 
                background: '#fff', 
                borderRadius: 24, 
                overflow: 'hidden',
                display: 'flex',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                minHeight: 780
            }}>
                
                {/* Left Side: Branding & Welcome */}
                <div className="verification-left" style={{ 
                    flex: '0 0 42%', 
                    background: logoGradient,
                    padding: 48,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    color: '#fff',
                    textAlign: 'center',
                    position: 'relative'
                }}>
                    <div style={{ position: 'absolute', inset: 0, opacity: 0.1, backgroundImage: 'radial-gradient(#fff 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                    <div className="logo-section" style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ 
                            width: 100, height: 100, background: '#fff', borderRadius: 28, padding: 18, 
                            margin: '0 auto 28px', boxShadow: '0 12px 24px rgba(0,0,0,0.15)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            {branding.company_logo ? (
                                <img src={branding.company_logo} alt="Logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                            ) : (
                                <FiShield size={50} style={{ color: '#DD2476' }} />
                            )}
                        </div>
                        <h2 style={{ fontSize: '1rem', fontWeight: 600, opacity: 0.9, marginBottom: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>OFFICIAL VERIFICATION</h2>
                        <h1 style={{ fontSize: '2.5rem', fontWeight: 900, marginBottom: 20, letterSpacing: '-0.03em' }}>{branding.company_name}</h1>
                        <div style={{ width: 60, height: 4, background: 'rgba(255,255,255,0.3)', margin: '0 auto 24px', borderRadius: 2 }} />
                        <p style={{ fontSize: '0.95rem', opacity: 0.85, lineHeight: 1.6, maxWidth: 320, margin: '0 auto' }}>
                           Secure Document & Identity Verification Service. Official payroll and conduct validation.
                        </p>
                    </div>
                </div>

                <div className="verification-right" style={{ 
                    flex: 1, 
                    padding: '50px 48px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: '90vh',
                    overflowY: 'auto'
                }}>
                    
                    {step === 'search' && (
                        <div className="fade-in">
                            <h2 style={{ fontSize: '2rem', fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>Verify Records</h2>
                            <p style={{ color: '#64748b', marginBottom: 40, fontSize: '1.1rem' }}>Enter the unique Employee ID provided to start verification.</p>
                            <form onSubmit={handleSearch}>
                                <div className="form-group" style={{ marginBottom: 32 }}>
                                    <label style={{ fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10, display: 'block' }}>Search ID</label>
                                    <div style={{ position: 'relative' }}>
                                        <input 
                                            className="form-input" 
                                            placeholder="e.g., EMP-1024" 
                                            style={{ padding: '20px 20px 20px 52px', fontSize: '1.25rem', borderRadius: 18, border: '2.5px solid #f1f5f9', background: '#f8fafc' }}
                                            value={employeeId} 
                                            onChange={e => setEmployeeId(e.target.value)}
                                            required
                                        />
                                        <FiSearch style={{ position: 'absolute', left: 20, top: '50%', transform: 'translateY(-50%)', fontSize: '1.4rem', color: '#cbd5e1' }} />
                                    </div>
                                </div>
                                <button type="submit" disabled={searching} className="btn-verify" style={{ 
                                    width: '100%', padding: '20px', borderRadius: 18, border: 'none',
                                    background: '#DD2476', color: '#fff', fontWeight: 800, fontSize: '1.1rem',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                                    cursor: 'pointer', boxShadow: '0 10px 20px -5px rgba(221, 36, 118, 0.4)'
                                }}>
                                    {searching ? 'Locating Records...' : <>Search Database <FiArrowRight /></>}
                                </button>
                            </form>
                        </div>
                    )}

                    {step === 'request_form' && (
                        <div className="fade-in">
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>Consent Request</h2>
                            <p style={{ color: '#64748b', marginBottom: 32 }}>Records for <b>{employeeId.toUpperCase()}</b> are protected. Identify your organization below.</p>
                            <form onSubmit={handleRequest} style={{ display: 'grid', gap: 20 }}>
                                <div>
                                    <label className="form-label">Authorized Requester</label>
                                    <input className="form-input" style={{ padding: 14, borderRadius: 12, border: '2px solid #f1f5f9' }} placeholder="Full Name" value={form.requestorName} onChange={e => setForm({...form, requestorName: e.target.value})} required />
                                </div>
                                <div>
                                    <label className="form-label">Organization Email</label>
                                    <input type="email" className="form-input" style={{ padding: 14, borderRadius: 12, border: '2px solid #f1f5f9' }} placeholder="official@bank-or-company.com" value={form.requestorEmail} onChange={e => setForm({...form, requestorEmail: e.target.value})} required />
                                </div>
                                <div>
                                    <label className="form-label">Company Name</label>
                                    <input className="form-input" style={{ padding: 14, borderRadius: 12, border: '2px solid #f1f5f9' }} placeholder="Global Tech Corp" value={form.requestorCompany} onChange={e => setForm({...form, requestorCompany: e.target.value})} required />
                                </div>
                                <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                                    <button type="button" onClick={() => setStep('search')} className="btn btn-outline" style={{ flex: 1, borderRadius: 12 }}>Back</button>
                                    <button type="submit" disabled={submitting} className="btn btn-primary" style={{ flex: 2, borderRadius: 12, background: '#DD2476', borderColor: '#DD2476', fontWeight: 800 }}>
                                        {submitting ? 'Authenticating...' : 'Notify Individual'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    )}

                    {step === 'submitted' && (
                        <div className="fade-in text-center" style={{ margin: 'auto' }}>
                            <div className="pulse" style={{ width: 80, height: 80, background: 'rgba(221, 36, 118, 0.1)', color: '#DD2476', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px' }}>
                                <FiClock size={40} />
                            </div>
                            <h2 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#1e293b', marginBottom: 12 }}>Pending Consent</h2>
                            <p style={{ color: '#64748b', lineHeight: 1.6, maxWidth: 350, margin: '0 auto 32px' }}>
                                We have sent a secure approval request to the individual. Once they authorize access, the documents will unlock here immediately.
                            </p>
                            <div style={{ display: 'inline-block', padding: '12px 24px', background: '#f8fafc', borderRadius: 12, border: '1px solid #f1f5f9', fontWeight: 800, color: '#1e293b', letterSpacing: 1 }}>
                                REQ_REF: {requestId || '---'}
                            </div>
                        </div>
                    )}

                    {step === 'view_data' && verifiedData && (
                        <div className="fade-in">
                           <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30, borderBottom: '1.5px solid #f1f5f9', paddingBottom: 20 }}>
                                <div style={{ width: 50, height: 50, background: '#10b98115', color: '#10b981', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <FiCheckCircle size={26} />
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: '#1e293b', margin: 0 }}>Verified Records Center</h2>
                                    <p style={{ color: '#64748b', margin: 0, fontSize: '0.85rem', fontWeight: 500 }}>Authenticated Service Dashboard</p>
                                </div>
                           </div>

                           {/* Tab Navigation */}
                           <div style={{ display: 'flex', gap: 6, background: '#f8fafc', padding: 5, borderRadius: 14, marginBottom: 30, overflowX: 'auto', whiteSpace: 'nowrap' }}>
                               {tabs.map(tab => (
                                   <button 
                                       key={tab.id}
                                       onClick={() => setActiveTab(tab.id)}
                                       style={{ 
                                           border: 'none', background: activeTab === tab.id ? '#fff' : 'transparent',
                                           color: activeTab === tab.id ? '#DD2476' : '#64748b',
                                           padding: '10px 18px', borderRadius: 10, cursor: 'pointer',
                                           display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 800,
                                           boxShadow: activeTab === tab.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                           minWidth: 'fit-content'
                                       }}
                                   >
                                       {tab.icon} {tab.label}
                                   </button>
                               ))}
                           </div>

                           {/* Profile Tab - Redesigned as requested */}
                           {activeTab === 'profile' && (
                                <div className="tab-content fade-in" style={{ animationDuration: '0.3s' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 32 }}>
                                        <div style={{ width: 90, height: 90, background: logoGradient, color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', fontWeight: 900, marginBottom: 16, boxShadow: '0 10px 20px -5px rgba(221, 36, 118, 0.3)' }}>
                                            {verifiedData.name[0]}
                                        </div>
                                        <h2 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1e293b', margin: 0 }}>{verifiedData.name}</h2>
                                        <p style={{ fontSize: '1rem', fontWeight: 600, color: '#6366f1', margin: '4px 0 10px' }}>{verifiedData.designation}</p>
                                        <span className={`badge badge-${verifiedData.status === 'active' ? 'success' : 'danger'}`} style={{ padding: '6px 16px', borderRadius: 8, textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 900 }}>
                                            {verifiedData.status.toUpperCase()} EMPLOYEE
                                        </span>
                                    </div>

                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 900, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <FiBriefcase className="text-primary" /> Service Record
                                    </h4>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                        {[
                                            { label: 'Employee ID', value: verifiedData.employee_id, icon: <FiHash /> },
                                            { label: 'Email Address', value: verifiedData.email, icon: <FiMail /> },
                                            { label: 'Contact Phone', value: verifiedData.phone || 'N/A', icon: <FiPhone /> },
                                            { label: 'Department', value: verifiedData.department || 'N/A', icon: <FiBriefcase /> },
                                            { label: 'Joining Date', value: formatDate(verifiedData.joining_date), icon: <FiCalendar /> },
                                            { label: 'Relieving Date', value: formatDate(verifiedData.exit_date) || 'Still Active', icon: <FiCalendar /> },
                                            { label: 'Personal Email', value: 'N/A', icon: <FiMail /> },
                                            { label: 'Current Address', value: verifiedData.address || 'N/A', icon: <FiHome /> },
                                        ].map((f, i) => (
                                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: i === 6 ? 'none' : '1px solid #f1f5f9' }}>
                                                <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    {f.icon} {f.label}
                                                </span>
                                                <span style={{ fontSize: '0.9rem', color: '#1e293b', fontWeight: 700 }}>{f.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                           )}

                           {/* Payroll Tab */}
                           {activeTab === 'payroll' && (
                                <div className="tab-content fade-in">
                                    <h3 style={{ fontSize: '1rem', fontWeight: 900, color: '#1e293b', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <FiCreditCard style={{ color: '#DD2476' }} /> Verified Salary History
                                    </h3>
                                    <div style={{ border: '1px solid #f1f5f9', borderRadius: 18, overflow: 'hidden', marginBottom: 30 }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead style={{ background: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                                                <tr>
                                                    <th style={{ textAlign: 'left', padding: '16px 20px', color: '#64748b', fontWeight: 800 }}>Disbursement Period</th>
                                                    <th style={{ textAlign: 'right', padding: '16px 20px', color: '#64748b', fontWeight: 800 }}>Net Total</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {verifiedData.payrolls?.map(p => (
                                                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <td style={{ padding: '14px 20px', fontWeight: 800, color: '#1e293b' }}>{monthNames[p.month]} {p.year}</td>
                                                        <td style={{ padding: '14px 20px', textAlign: 'right', fontWeight: 900, color: '#10b981' }}>₹{p.net_salary.toLocaleString()}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                           )}

                           {/* Identity / Verification Tab */}
                           {activeTab === 'verify' && (
                               <div className="tab-content fade-in">
                                   <div style={{ textAlign: 'center', padding: '30px 20px', background: '#f8fafc', borderRadius: 24, border: '1px solid #f1f5f9' }}>
                                       <FiShield size={48} style={{ color: '#DD2476', marginBottom: 16 }} />
                                       <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#1e293b', marginBottom: 8 }}>Verification Shield</h3>
                                       <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: 24 }}>Official record authentication for <b>{verifiedData.company}</b>.</p>
                                       
                                       <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                           <div style={{ padding: 16, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                                               <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Auth Status</div>
                                               <div style={{ fontWeight: 800, color: '#10b981', fontSize: '0.9rem' }}>APPROVED</div>
                                           </div>
                                           <div style={{ padding: 16, background: '#fff', borderRadius: 16, border: '1px solid #f1f5f9' }}>
                                               <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Date Chain</div>
                                               <div style={{ fontWeight: 800, color: '#1e293b', fontSize: '0.9rem' }}>{formatDate(verifiedData.verified_at)}</div>
                                           </div>
                                       </div>
                                   </div>
                               </div>
                           )}

                           {/* Attachments Tab */}
                           {activeTab === 'attachments' && (
                               <div style={{ padding: '0 24px 24px' }}>
                                   <h3 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#1e293b', marginBottom: 24 }}>Official Certificates</h3>
                                   {verifiedData.documents && verifiedData.documents.length > 0 ? (
                                        <div style={{ display: 'grid', gap: 16 }}>
                                            {verifiedData.documents.map(doc => (
                                                <div key={doc._id} style={{ 
                                                    padding: '20px 24px', background: '#f8fafc', borderRadius: 24, border: '1px solid #e2e8f0',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                                                        <div style={{ width: 44, height: 44, background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#DD2476' }}>
                                                            <FiAward />
                                                        </div>
                                                        <div>
                                                            <p style={{ margin: 0, fontWeight: 800, color: '#1e293b', fontSize: '0.95rem' }}>{doc.name}</p>
                                                            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>Official Digital Document</p>
                                                        </div>
                                                    </div>
                                                    <button 
                                                        className="btn btn-primary" 
                                                        style={{ 
                                                            padding: '10px 24px', borderRadius: 14, fontWeight: 900, background: 'linear-gradient(45deg, #DD2476 0%, #FF512F 100%)', 
                                                            borderColor: 'transparent', display: 'flex', alignItems: 'center', gap: 8 
                                                        }}
                                                        onClick={() => {
                                                            window.open(`${API.defaults.baseURL}/resignations/${verifiedData.resignation_id}/documents/${doc._id}`, '_blank');
                                                        }}
                                                    >
                                                        <FiDownload /> View
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                   ) : (
                                       <div style={{ textAlign: 'center', padding: '60px 40px', background: '#f8fafc', borderRadius: 24, border: '2px dashed #e2e8f0' }}>
                                           <FiFileText size={40} style={{ color: '#cbd5e1', marginBottom: 16 }} />
                                           <p style={{ color: '#64748b', fontSize: '0.95rem', fontWeight: 600 }}>No additional certificates are currently attached.</p>
                                       </div>
                                   )}
                               </div>
                           )}

                           <div style={{ marginTop: 40 }}>
                                <button onClick={() => setStep('search')} className="btn btn-primary" style={{ width: '100%', padding: '16px', borderRadius: 14, fontWeight: 900, background: '#DD2476', borderColor: '#DD2476' }}>
                                    New Verify
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 'auto', paddingTop: 40, textAlign: 'center' }}>
                        <p style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>
                            © {new Date().getFullYear()} {branding.company_name} · HR Excellence Secure Verification Center
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
