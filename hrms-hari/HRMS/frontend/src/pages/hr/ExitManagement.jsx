import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { 
    FiLogOut, FiCheckCircle, FiXCircle, FiCalendar, FiUser, FiMoreVertical, 
    FiMail, FiPhone, FiRotateCcw, FiShield, FiMessageCircle, FiPaperclip, FiEye, FiDownload, FiTrash2, FiClock, FiChevronRight, FiFileText
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';
import { useToast } from '../../context/ToastContext';

export default function ExitManagement() {
    const [resignations, setResignations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedRequest, setSelectedRequest] = useState(null);
    const [hrComment, setHrComment] = useState('');
    const [attachments, setAttachments] = useState([]);
    const [processingId, setProcessingId] = useState(null);

    const { showToast } = useToast();

    useEffect(() => {
        fetchResignations();
    }, []);

    const fetchResignations = async () => {
        try {
            const { data } = await API.get('/resignations');
            setResignations(data.resignations);
            setLoading(false);
        } catch (error) {
            showToast('Failed to fetch resignation requests.', 'error');
            setLoading(false);
        }
    };

    const handleUpdate = async (id, status) => {
        setProcessingId(id);
        const formData = new FormData();
        if (status) formData.append('status', status);
        formData.append('hr_comments', hrComment);
        
        // Multiple Files
        attachments.forEach(file => {
            formData.append('documents', file);
        });

        try {
            const { data } = await API.put(`/resignations/${id}/status`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            showToast(status ? `Request ${status} successfully!` : 'Documents updated!', 'success');
            
            // Re-fetch to sync
            fetchResignations();
            
            // Keep modal open but update the selected request data for real-time delete/view
            if (data.resignation) {
                // Find and update in list too
                setSelectedRequest(prev => ({ ...prev, documents: data.resignation.documents }));
            } else {
                setSelectedRequest(null);
            }
            
            setAttachments([]);
        } catch (error) {
            showToast(error.response?.data?.message || 'Action failed.', 'error');
        } finally {
            setProcessingId(null);
        }
    };

    const deleteDoc = async (resignationId, docId) => {
        if (!confirm('Are you sure you want to delete this document?')) return;
        try {
            await API.delete(`/resignations/${resignationId}/documents/${docId}`);
            showToast('Document deleted.', 'success');
            
            // Update local state
            setSelectedRequest(prev => ({
                ...prev,
                documents: prev.documents.filter(d => d._id !== docId)
            }));
            
            setResignations(prev => prev.map(r => 
                r._id === resignationId 
                ? { ...r, documents: r.documents.filter(d => d._id !== docId) }
                : r
            ));
        } catch (error) {
            showToast('Failed to delete document.', 'error');
        }
    };

    const viewDoc = async (resignationId, docId) => {
        try {
            const res = await API.get(`/resignations/${resignationId}/documents/${docId}`, { responseType: 'blob' });
            const blob = new Blob([res.data], { type: res.headers['content-type'] || 'application/pdf' });
            const url = window.URL.createObjectURL(blob);
            window.open(url, '_blank');
        } catch {
            showToast('Failed to view document.', 'error');
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pending': return <span className="badge badge-warning">Pending Approval</span>;
            case 'approved': return <span className="badge badge-success">Approved</span>;
            case 'rejected': return <span className="badge badge-danger">Rejected</span>;
            case 'revoke': return <span className="badge badge-outline">Revoked</span>;
            case 'revoke_requested': return <span className="badge" style={{ background: '#8b5cf6', color: '#fff' }}>Revocation Requested</span>;
            default: return <span className="badge">{status}</span>;
        }
    };

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiLogOut style={{ marginRight: 8, verticalAlign: 'middle' }} /> Exit Management</div>
                    <div className="page-subtitle">Manage employee resignations and notice periods</div>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                <table className="data-table">
                        <thead>
                            <tr>
                                <th>Exit ID</th>
                                <th>Employee</th>
                                <th>Submission Date</th>
                                <th>Last Working Day</th>
                                <th>Status</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {resignations.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="text-center" style={{ padding: '40px 0', color: 'var(--text-muted)' }}>No resignation requests found.</td>
                                </tr>
                            ) : resignations.map(r => (
                                <tr key={r._id}>
                                    <td style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.85rem' }}>{r.employee?.id || 'N/A'}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className="avatar-sm">{r.employee?.name?.[0]}</div>
                                            <div>
                                                <div style={{ fontWeight: 600 }}>{r.employee?.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.employee?.designation}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td>{formatDate(r.createdAt)}</td>
                                    <td>
                                        <div style={{ fontWeight: 600 }}>{formatDate(r.last_working_day)}</div>
                                        {(() => {
                                            const lastDay = new Date(r.last_working_day);
                                            const today = new Date();
                                            today.setHours(0,0,0,0);
                                            const diffDays = Math.ceil((lastDay - today) / (1000 * 60 * 60 * 24));
                                            if (r.status === 'approved' || r.status === 'pending') {
                                                return <div style={{ fontSize: '0.7rem', color: diffDays <= 7 ? '#ef4444' : '#10b981', fontWeight: 600 }}>
                                                    {diffDays > 0 ? `${diffDays} days left` : diffDays === 0 ? 'Last day' : 'Ended'}
                                                </div>;
                                            }
                                            return null;
                                        })()}
                                    </td>
                                    <td>{getStatusBadge(r.status)}</td>
                                    <td>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button 
                                                className="btn btn-sm btn-outline" 
                                                onClick={() => { 
                                                    setSelectedRequest(r); 
                                                    setHrComment(r.hr_comments || ''); 
                                                    setAttachments([]);
                                                }}
                                            >
                                                <FiChevronRight />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                </table>
            </div>

            {selectedRequest && (
                <div className="modal-overlay" onClick={() => setSelectedRequest(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 650 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Request Review: {selectedRequest.employee?.name}</h3>
                            <button className="modal-close" onClick={() => setSelectedRequest(null)}><FiXCircle /></button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
                            <div className="grid-2" style={{ marginBottom: 20 }}>
                                <div>
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiCalendar /> Notice Start</label>
                                    <p style={{ fontWeight: 600 }}>{formatDate(selectedRequest.notice_start_date)}</p>
                                </div>
                                <div>
                                    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiCalendar /> Last Working Day</label>
                                    <p style={{ fontWeight: 600 }}>{formatDate(selectedRequest.last_working_day)}</p>
                                </div>
                            </div>

                            <div style={{ marginBottom: 20 }}>
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><FiFileText /> Reason for Leaving</label>
                                <div style={{ padding: 12, background: 'var(--bg-hover)', borderRadius: 12, fontSize: '0.9rem', border: '1px solid var(--border-color)' }}>
                                    {selectedRequest.reason}
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><FiMessageCircle /> HR Feedback / Comments</label>
                                <textarea className="form-textarea" rows="2" placeholder="Settlement details, resignation code, etc." value={hrComment} onChange={e => setHrComment(e.target.value)} style={{ borderRadius: 12 }} />
                            </div>

                            <div className="form-group">
                                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 700 }}><FiPaperclip /> Official Exit Documents (Multi-upload)</label>
                                <div style={{ 
                                    position: 'relative', background: 'var(--bg-hover)', border: '2px dashed var(--border-color)', 
                                    borderRadius: 12, padding: '24px 16px', textAlign: 'center', transition: 'all 0.2s'
                                }}>
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept=".pdf,.jpg,.jpeg,.png"
                                        onChange={e => setAttachments(Array.from(e.target.files))}
                                        style={{ cursor: 'pointer', position: 'absolute', inset: 0, opacity: 0 }}
                                    />
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        {attachments.length > 0 ? (
                                            <span style={{ color: 'var(--accent-primary)', fontWeight: 800 }}>{attachments.length} files selected for upload</span>
                                        ) : (
                                            <>Click or Drop to attach Relieving Letter, Exp. Certificate, etc.</>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* List of Already Uploaded Documents */}
                            {(selectedRequest.documents && selectedRequest.documents.length > 0) && (
                                <div style={{ marginTop: 24 }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Stored Documents ({selectedRequest.documents.length})
                                    </h4>
                                    <div style={{ display: 'grid', gap: 10 }}>
                                        {selectedRequest.documents.map(doc => (
                                            <div key={doc._id} style={{ 
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
                                                padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12 
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, overflow: 'hidden' }}>
                                                    <FiCheckCircle style={{ color: '#10b981', flexShrink: 0 }} />
                                                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 700, color: '#166534' }}>{doc.name}</div>
                                                </div>
                                                <div style={{ display: 'flex', gap: 8 }}>
                                                    <button onClick={() => viewDoc(selectedRequest._id, doc._id)} className="btn btn-sm btn-success" style={{ padding: '6px 12px' }}><FiEye /></button>
                                                    <button onClick={() => deleteDoc(selectedRequest._id, doc._id)} className="btn btn-sm btn-outline-danger" style={{ padding: '6px 12px' }}><FiTrash2 /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: selectedRequest.status === 'pending' ? '1fr 1fr' : '1fr', gap: 12, marginTop: 32 }}>
                                {selectedRequest.status === 'pending' && (
                                    <button className="btn btn-outline-danger" onClick={() => handleUpdate(selectedRequest._id, 'rejected')} disabled={processingId}>Reject</button>
                                )}
                                <button className="btn btn-primary" onClick={() => handleUpdate(selectedRequest._id, selectedRequest.status === 'pending' ? 'approved' : null)} disabled={processingId}>
                                    {processingId ? 'Processing...' : selectedRequest.status === 'pending' ? 'Approve & Save' : 'Update Comments/Files'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
