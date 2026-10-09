import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../../api/axios';
import { useToast } from '../../context/ToastContext';
import { FiPlus, FiUserPlus, FiX, FiCheckCircle, FiTrash2, FiEdit2, FiArrowLeft, FiMoreVertical, FiUserCheck, FiPhone, FiFileText, FiAward, FiMinus, FiClock, FiAlignLeft, FiAlertCircle } from 'react-icons/fi';

const CANDIDATE_STAGES = [
    { id: 'Applied', label: 'Applied', icon: <FiMinus />,     style: { bg: '#ffffff', border: '#e1f0fa', headerBg: '#f8fbff', text: '#334155' } },
    { id: 'Screening', label: 'Phone screening', icon: <FiMinus />, style: { bg: '#eef8ff', border: '#bce0fd', headerBg: '#cbe6fb', text: '#334155' } },
    { id: 'Interviewed', label: 'On-site interview', icon: <FiMinus />, style: { bg: '#ffffff', border: '#38bdf8', headerBg: '#4abbf0', text: '#0c4a6e' } },
    { id: 'Offered', label: 'Offer', icon: <FiMinus />,       style: { bg: '#ffffff', border: '#0284c7', headerBg: '#1e88b8', text: '#ffffff' } },
    { id: 'Hired', label: 'Hired', icon: <FiCheckCircle />,   style: { bg: '#ffffff', border: '#10b981', headerBg: '#10b981', text: '#ffffff' } },
    { id: 'Rejected', label: 'Rejected', icon: <FiX />,       style: { bg: '#ffffff', border: '#ef4444', headerBg: '#ef4444', text: '#ffffff' } }
];

// Helper to get random soft colors for tags based on a string
const getTagColor = (str) => {
    const colors = [
        { bg: '#e8d2ff', text: '#6b21a8' }, // purple
        { bg: '#fef08a', text: '#854d0e' }, // yellow
        { bg: '#fecaca', text: '#991b1b' }, // red
        { bg: '#bbf7d0', text: '#166534' }, // green
        { bg: '#bfdbfe', text: '#1e40af' }, // blue
        { bg: '#fbcfe8', text: '#9d174d' }  // pink
    ];
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
};

export default function RecruitmentManagement() {
    const navigate = useNavigate();
    const { showToast } = useToast();
    const [jobs, setJobs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // UI states
    const [selectedJob, setSelectedJob] = useState(null);
    const [isJobModalOpen, setIsJobModalOpen] = useState(false);
    const [confirmDeleteId, setConfirmDeleteId] = useState(null);
    const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
    const [viewingCandidate, setViewingCandidate] = useState(null);
    
    // Form states
    const [jobFormData, setJobFormData] = useState({ job_title: '', department_id: '', positions: 1, status: 'Open', description: '' });
    const [editingJobId, setEditingJobId] = useState(null);
    
    const [candidateFormData, setCandidateFormData] = useState({ name: '', email: '', phone: '', status: 'Applied', notes: '' });

    const fetchJobs = async () => {
        try {
            const { data } = await API.get('/recruitment');
            if (data.success) {
                setJobs(data.jobs);
                // Safe callback strategy prevents capturing stale 'selectedJob' closure state
                setSelectedJob(prev => {
                    if (!prev) return null;
                    return data.jobs.find(j => j._id === prev._id) || null;
                });
            }
        } catch (err) {
            showToast('Failed to load job postings', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { 
        fetchJobs(); 
        
        // Auto-close dropdown details menus when clicking outside
        const handleClickOutside = (e) => {
            document.querySelectorAll('details[open]').forEach(details => {
                if (!details.contains(e.target)) details.removeAttribute('open');
            });
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    // Job Posting Methods
    const handleJobSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingJobId) {
                await API.put(`/recruitment/${editingJobId}`, jobFormData);
                showToast('Job updated', 'success');
            } else {
                await API.post('/recruitment', jobFormData);
                showToast('Job created', 'success');
            }
            setIsJobModalOpen(false);
            fetchJobs();
        } catch (err) { showToast('Action failed', 'error'); }
    };

    const handleJobDelete = (id) => {
        setConfirmDeleteId(id);
    };

    const finalizeJobDelete = async () => {
        try {
            await API.delete(`/recruitment/${confirmDeleteId}`);
            showToast('Job posting deleted', 'success');
            setConfirmDeleteId(null);
            fetchJobs();
        } catch (err) { showToast('Delete failed', 'error'); }
    };

    const handleJobEdit = (j) => {
        setJobFormData(j);
        setEditingJobId(j._id);
        setIsJobModalOpen(true);
    };

    // Candidate Methods
    const handleCandidateSubmit = async (e) => {
        e.preventDefault();
        try {
            const data = new FormData();
            Object.keys(candidateFormData).forEach(key => data.append(key, candidateFormData[key]));
            if (candidateFormData.resume) data.append('resume', candidateFormData.resume);

            const res = await API.post(`/recruitment/${selectedJob._id}/candidates`, data, { 
                headers: { 'Content-Type': 'multipart/form-data' } 
            });
            if (res.data.success) {
                showToast('Candidate added successfully', 'success');
                setIsCandidateModalOpen(false);
                fetchJobs(); 
            }
        } catch (err) { showToast('Action failed', 'error'); }
    };

    const handleCandidateStatusChange = async (candidateId, newStatus) => {
        // Instant Optimistic UI Update
        setSelectedJob(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                candidates: prev.candidates.map(c => c._id === candidateId ? { ...c, status: newStatus } : c)
            };
        });
        
        try {
            const { data } = await API.put(`/recruitment/${selectedJob._id}/candidates/${candidateId}`, { status: newStatus });
            if (data.success) {
                showToast(`Moved to ${newStatus}`, 'success');
                fetchJobs(); // Background sync
            }
        } catch (err) { 
            showToast('Failed to save status, reverting.', 'error'); 
            fetchJobs(); // Revert changes
        }
    };

    const downloadFile = async (url, filename) => {
        try {
            const response = await API.get(url, { responseType: 'blob' });
            const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'download';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed:', error);
            showToast('Download failed', 'error');
        }
    };

    // Renderers
    if (loading) return <div className="p-6">Loading Recruitment Workflow...</div>;

    // View: Kanban Pipeline of Candidates
    if (selectedJob) {
        return (
            <div className="p-6 fade-in flex-col" style={{ gap: '20px', height: '100%' }}>
                <div className="card flex-row justify-between" style={{ padding: '20px', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                        <button className="btn btn-icon" onClick={() => setSelectedJob(null)}><FiArrowLeft /></button>
                        <div>
                            <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Pipeline: {selectedJob.job_title}</h2>
                            <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>End-to-end candidate lifecycle for this position.</p>
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={() => { 
                        setCandidateFormData({ name: '', email: '', phone: '', status: 'Applied', notes: '' }); 
                        setIsCandidateModalOpen(true); 
                    }}>
                        <FiUserPlus /> Add Candidate
                    </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'row', gap: '15px', overflowX: 'auto', flex: 1, paddingBottom: '15px', alignItems: 'flex-start', flexWrap: 'nowrap' }}>
                    {CANDIDATE_STAGES.map((stage) => {
                        const columnCandidates = (selectedJob.candidates || []).filter(c => c.status === stage.id);
                        return (
                            <div key={stage.id} style={{ 
                                flex: '0 0 300px', 
                                background: stage.style.bg, 
                                border: `3px solid ${stage.style.border}`, 
                                borderRadius: '4px',
                                display: 'flex',
                                flexDirection: 'column',
                                minHeight: '400px'
                            }}>
                                {/* Column Header */}
                                <div style={{ 
                                    background: stage.style.headerBg, 
                                    color: stage.style.text, 
                                    padding: '12px 15px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    borderBottom: `1px solid ${stage.style.border}`
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ display: 'flex', alignItems: 'center' }}>{stage.icon}</span>
                                        <span style={{ fontWeight: 500, fontSize: '0.95rem' }}>{stage.label}</span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span style={{ 
                                            background: '#ffffff', 
                                            color: '#64748b', 
                                            padding: '2px 8px', 
                                            borderRadius: '12px', 
                                            fontSize: '0.75rem', 
                                            fontWeight: 600,
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}>
                                            {columnCandidates.length}
                                        </span>
                                        <button style={{ background: 'none', border: 'none', color: stage.style.text, padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                            <FiMoreVertical />
                                        </button>
                                    </div>
                                </div>

                                {/* Cards Container */}
                                <div className="flex-col" style={{ gap: '10px', padding: '10px', minHeight: '300px' }}>
                                    {columnCandidates.map((c, index) => {
                                        const jobTag = getTagColor(selectedJob.job_title);
                                        const depTag = getTagColor(selectedJob.department_id || 'HR');
                                        return (
                                        <div key={c._id} className="card hover-grow" style={{ 
                                            padding: '12px', 
                                            background: '#ffffff', 
                                            border: `1px solid ${stage.style.border}`, 
                                            borderRadius: '4px',
                                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                                            position: 'relative',
                                            overflow: 'visible'
                                        }}>
                                            <div className="flex-row justify-between" style={{ marginBottom: '10px', alignItems:'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }} onClick={() => setViewingCandidate(c)}>
                                                    <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 500, color: '#475569' }}>{c.name}</h4>
                                                    <span style={{ color: '#cbd5e1', paddingLeft: '5px' }}>▶</span>
                                                </div>
                                                <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>#{String(index + 1).padStart(2, '0')}</span>
                                            </div>

                                            {/* Tags Row */}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                <span style={{ 
                                                    background: jobTag.bg, color: jobTag.text, 
                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 500,
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px'
                                                }}>
                                                    {selectedJob.job_title}
                                                </span>
                                                <span style={{ 
                                                    background: depTag.bg, color: depTag.text, 
                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 500
                                                }}>
                                                    {selectedJob.department_id || 'HR'}
                                                </span>
                                            </div>

                                            {/* Footer Row */}
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <div style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '4px', 
                                                    background: '#cd5c5c', color: 'white', 
                                                    padding: '2px 8px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 500
                                                }}>
                                                    <FiClock size={10} />
                                                    {new Date(c.applied_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                                                </div>

                                                {c.status !== 'Hired' && c.status !== 'Rejected' && (
                                                    <details style={{ position: 'relative' }}>
                                                        <summary style={{ background: 'none', border: 'none', color: '#cbd5e1', cursor: 'pointer', display: 'flex', padding: '5px', borderRadius: '4px', listStyle: 'none' }} onMouseOver={e=>e.currentTarget.style.background='#f1f5f9'} onMouseOut={e=>e.currentTarget.style.background='none'}>
                                                            <span style={{ display: 'none' }}>&nbsp;</span><FiAlignLeft size={14} />
                                                        </summary>
                                                        <ul style={{ 
                                                            position: 'absolute', right: 0, top: '100%', marginTop: '5px',
                                                            background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', 
                                                            padding: '4px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)', 
                                                            zIndex: 50, listStyle: 'none', minWidth: '160px', margin: 0
                                                        }}>
                                                            <li style={{ padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748b', borderBottom: '1px solid #f1f5f9', marginBottom: '2px', whiteSpace: 'nowrap' }}>Move to...</li>
                                                            {CANDIDATE_STAGES.map((s, sIndex) => {
                                                                const currIndex = CANDIDATE_STAGES.findIndex(x => x.id === stage.id);
                                                                if (sIndex <= currIndex) return null;
                                                                return (
                                                                    <li key={s.id} style={{ padding: 0, margin: 0 }}>
                                                                        <button style={{ 
                                                                            display: 'block', width: '100%', textAlign: 'left',
                                                                            background: 'none', border: 'none', padding: '6px 12px', 
                                                                            fontSize: '0.85rem', color: '#334155', cursor: 'pointer', borderRadius: '4px' 
                                                                        }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#f1f5f9'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                                        onClick={(e) => { e.target.closest('details').removeAttribute('open'); handleCandidateStatusChange(c._id, s.id); }}>
                                                                            {s.label}
                                                                        </button>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    </details>
                                                )}
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {viewingCandidate && (
                    <div className="modal-overlay" onClick={() => setViewingCandidate(null)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                            <div className="modal-header">
                                <h3 className="modal-title">Candidate Profile</h3>
                                <button className="modal-close" onClick={() => setViewingCandidate(null)}><FiX /></button>
                            </div>
                            <div className="modal-body" style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '25px', borderBottom: '1px solid #e2e8f0', paddingBottom: '15px' }}>
                                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: '#f8fafc', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.5rem', fontWeight: 'bold' }}>
                                        {viewingCandidate.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <h2 style={{ margin: 0, fontSize: '1.4rem', color: '#0f172a' }}>{viewingCandidate.name}</h2>
                                        <span className="badge" style={{ marginTop: '5px', background: '#f1f5f9', color: '#475569', fontWeight: 600 }}>Status: {viewingCandidate.status}</span>
                                    </div>
                                </div>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Highest Qualification</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155', fontWeight: 500 }}>{viewingCandidate.qualification || 'Not Specified'}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Experience</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155', textTransform: 'capitalize' }}>
                                            {viewingCandidate.experience_type || 'N/A'} 
                                            {viewingCandidate.experience_type === 'experienced' && viewingCandidate.experience_years ? ` (${viewingCandidate.experience_years} Years)` : ''}
                                        </p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Current Stage</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <p style={{ margin: '5px 0 0 0', color: '#334155' }}><FiUserCheck size={14} /> {viewingCandidate.status}</p>
                                            {viewingCandidate.resume_url && <span style={{ background: '#ecfdf5', color: '#10b981', padding: '2px 6px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, marginTop: '5px' }}>RESUME ATTACHED</span>}
                                        </div>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Email Address</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155' }}><FiFileText size={14} style={{ marginRight: '5px' }}/> {viewingCandidate.email}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Phone Number</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155' }}><FiPhone size={14} style={{ marginRight: '5px' }}/> {viewingCandidate.phone || 'N/A'}</p>
                                    </div>
                                    <div style={{ gridColumn: 'span 2' }}>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Residential Address</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155' }}>{viewingCandidate.address || 'N/A'}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>Applied Date</p>
                                        <p style={{ margin: '5px 0 0 0', color: '#334155' }}><FiClock size={14} style={{ marginRight: '5px' }}/> {new Date(viewingCandidate.applied_date).toLocaleString()}</p>
                                    </div>
                                </div>

                                {viewingCandidate.resume_url && (
                                    <div style={{ marginBottom: '20px', padding: '16px', background: 'var(--bg-primary)', border: '2px solid var(--accent-purple)', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexDirection: 'row', boxShadow: '0 4px 12px rgba(139, 92, 246, 0.1)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                            <div style={{ background: 'var(--accent-purple)', color: 'white', padding: '10px', borderRadius: '8px', display: 'flex', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                                                <FiFileText size={20} />
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Official Resume</p>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Click to view document file</p>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <a 
                                                href={viewingCandidate.resume_url} 
                                                target="_blank" 
                                                rel="noopener noreferrer" 
                                                className="btn btn-outline btn-sm"
                                            >
                                                View
                                            </a>
                                            <button 
                                                onClick={() => downloadFile(`/recruitment/download/${selectedJob._id}/${viewingCandidate._id}`, `Resume_${viewingCandidate.name.replace(/\s+/g, '_')}.${viewingCandidate.resume_url.split('.').pop()}`)}
                                                className="btn btn-primary btn-sm"
                                                style={{ background: 'var(--gradient-primary)', border: 'none' }}
                                            >
                                                Download
                                            </button>
                                        </div>
                                    </div>
                                )}
                                
                                <div style={{ background: '#f8fafc', padding: '15px', borderRadius: '8px' }}>
                                    <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748b', fontWeight: 600, marginBottom: '8px' }}>Application Notes / Background</p>
                                    <p style={{ margin: 0, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: '1.5', minHeight: '80px' }}>
                                        {viewingCandidate.notes || 'No extensive notes or links provided.'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {isCandidateModalOpen && (
                    <div className="modal-overlay" onClick={() => setIsCandidateModalOpen(false)}>
                        <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                            <div className="modal-header">
                                <h3 className="modal-title">Add Candidate to Pipeline</h3>
                                <button className="modal-close" onClick={() => setIsCandidateModalOpen(false)}><FiX /></button>
                            </div>
                            <form onSubmit={handleCandidateSubmit}>
                                <div className="modal-body">
                                    <div className="form-group">
                                        <label className="form-label">Full Name</label>
                                        <input required type="text" className="form-input" value={candidateFormData.name} onChange={e => setCandidateFormData({ ...candidateFormData, name: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Email</label>
                                        <input required type="email" className="form-input" value={candidateFormData.email} onChange={e => setCandidateFormData({ ...candidateFormData, email: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Phone</label>
                                        <input type="text" className="form-input" value={candidateFormData.phone} onChange={e => setCandidateFormData({ ...candidateFormData, phone: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Qualification</label>
                                        <input type="text" className="form-input" value={candidateFormData.qualification || ''} onChange={e => setCandidateFormData({ ...candidateFormData, qualification: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Experience</label>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            <select className="form-select" style={{ flex: 1 }} value={candidateFormData.experience_type || 'fresher'} onChange={e => setCandidateFormData({ ...candidateFormData, experience_type: e.target.value })}>
                                                <option value="fresher">Fresher</option>
                                                <option value="experienced">Experienced</option>
                                            </select>
                                            {candidateFormData.experience_type === 'experienced' && (
                                                <input type="number" placeholder="Years" className="form-input" style={{ width: '80px' }} value={candidateFormData.experience_years || ''} onChange={e => setCandidateFormData({ ...candidateFormData, experience_years: e.target.value })} />
                                            )}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Address</label>
                                        <textarea className="form-input" rows="1" value={candidateFormData.address || ''} onChange={e => setCandidateFormData({ ...candidateFormData, address: e.target.value })}></textarea>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Notes (Links, Background, etc.)</label>
                                        <textarea className="form-input" rows="2" value={candidateFormData.notes} onChange={e => setCandidateFormData({ ...candidateFormData, notes: e.target.value })}></textarea>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Attach Resume</label>
                                        <input type="file" className="form-input" onChange={e => setCandidateFormData({ ...candidateFormData, resume: e.target.files[0] })} />
                                    </div>
                                </div>
                                <div className="modal-footer">
                                    <button type="button" className="btn btn-outline" onClick={() => setIsCandidateModalOpen(false)}>Cancel</button>
                                    <button type="submit" className="btn btn-primary">Add Candidate</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // View: List of Requisitions
    return (
        <div className="p-6 fade-in flex-col" style={{ gap: '20px', height: '100%' }}>
            <div className="card flex-row justify-between" style={{ padding: '20px', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}><FiUserPlus style={{ verticalAlign: 'middle', marginRight: '8px' }}/> Recruitment Requisitions</h2>
                    <p style={{ color: 'var(--text-muted)', margin: '5px 0 0 0' }}>Manage job openings and evaluate applicant pipelines.</p>
                </div>
                <div className="flex-row items-center" style={{ gap: '12px', flexWrap: 'wrap' }}>
                    <button className="btn btn-outline hover-grow" style={{ borderColor: 'var(--accent-purple)', color: 'var(--accent-purple)' }} onClick={() => navigate('/dashboard/onboarding')}>
                        <FiUserCheck /> Onboarding Pipeline
                    </button>
                    <button className="btn btn-primary hover-grow" onClick={() => { 
                        setEditingJobId(null); 
                        setJobFormData({ job_title: '', department_id: '', positions: 1, status: 'Open', description: '' }); 
                        setIsJobModalOpen(true); 
                    }}>
                        <FiPlus /> New Requisition
                    </button>
                </div>
            </div>

            <div className="grid-3" style={{ gap: '20px' }}>
                {jobs.map(j => (
                    <div key={j._id} className="card hover-grow" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
                        <div className="flex-row justify-between" style={{ marginBottom: '10px', gap: '10px', alignItems: 'flex-start' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', wordBreak: 'break-word' }}>{j.job_title}</h3>
                            <span className={`badge ${j.status === 'Open' ? 'badge-success' : 'badge-danger'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{j.status}</span>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Department: {j.department_id || 'HR'}</p>
                        <p style={{ fontSize: '0.9rem', marginBottom: '5px' }}>Positions: {j.positions}</p>
                        <p style={{ fontSize: '0.9rem', marginBottom: '15px' }}>Candidates in Pipeline: <span style={{ fontWeight: 'bold' }}>{j.candidates?.length || 0}</span></p>
                        
                        <div style={{ flex: 1 }}></div>

                        <div className="flex-row" style={{ gap: '10px', marginTop: '15px', paddingTop: '15px', borderTop: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                            <button className="btn btn-outline btn-sm" onClick={() => {
                                navigator.clipboard.writeText(`${window.location.origin}/apply/${j._id}`);
                                showToast('Public apply link copied to clipboard!', 'success');
                            }}>Copy Apply Link</button>
                            <button className="btn btn-primary btn-sm" onClick={() => setSelectedJob(j)}>View Pipeline</button>
                            <button className="btn btn-outline btn-sm" onClick={() => handleJobEdit(j)}><FiEdit2 /></button>
                            <button className="btn btn-outline btn-sm" style={{ color: 'var(--accent-red)' }} onClick={() => handleJobDelete(j._id)}><FiTrash2 /></button>
                        </div>
                    </div>
                ))}
                {jobs.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', padding: '40px', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: '10px' }}>
                        No ongoing recruitment requisitions. Create a job opening to start.
                    </div>
                )}
            </div>

            {isJobModalOpen && (
                <div className="modal-overlay" onClick={() => setIsJobModalOpen(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingJobId ? 'Edit Job Posting' : 'Create Job Posting'}</h3>
                            <button className="modal-close" onClick={() => setIsJobModalOpen(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleJobSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Job Title</label>
                                    <input required type="text" className="form-input" value={jobFormData.job_title} onChange={e => setJobFormData({ ...jobFormData, job_title: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Department</label>
                                    <input required type="text" className="form-input" value={jobFormData.department_id} onChange={e => setJobFormData({ ...jobFormData, department_id: e.target.value })} placeholder="e.g. Engineering" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Number of Positions</label>
                                    <input required type="number" min="1" className="form-input" value={jobFormData.positions} onChange={e => setJobFormData({ ...jobFormData, positions: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Status</label>
                                    <select className="form-select" value={jobFormData.status} onChange={e => setJobFormData({ ...jobFormData, status: e.target.value })}>
                                        <option value="Open">Open</option>
                                        <option value="Closed">Closed</option>
                                        <option value="On Hold">On Hold</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Job Description / Requirements</label>
                                    <textarea className="form-input" rows="3" value={jobFormData.description} onChange={e => setJobFormData({ ...jobFormData, description: e.target.value })}></textarea>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setIsJobModalOpen(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary">{editingJobId ? 'Save' : 'Post Job'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {confirmDeleteId && (
                <div className="modal-overlay" onClick={() => setConfirmDeleteId(null)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400, textAlign: 'center' }}>
                        <div className="modal-body" style={{ padding: '30px' }}>
                            <div style={{ background: '#fef2f2', color: '#dc2626', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
                                <FiAlertCircle size={30} />
                            </div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '10px' }}>Delete Job Posting?</h3>
                            <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: '1.5', margin: 0 }}>
                                This action cannot be undone. All candidates and their application history for this position will be permanently deleted.
                            </p>
                        </div>
                        <div className="modal-footer" style={{ borderTop: 'none', display: 'flex', gap: '10px', justifyContent: 'center', paddingBottom: '30px' }}>
                            <button className="btn btn-outline" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                            <button className="btn btn-primary" style={{ background: '#ef4444', border: 'none' }} onClick={finalizeJobDelete}>Confirm Delete</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
