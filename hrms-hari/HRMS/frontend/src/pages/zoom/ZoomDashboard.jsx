import React, { useState, useEffect } from 'react';
import { FiVideo, FiPlus, FiCalendar, FiClock, FiUsers, FiLink, FiTrash2, FiPlayCircle, FiSquare, FiX } from 'react-icons/fi';
import API from '../../api/axios'; // Assuming your axios instance
import { useAuth } from '../../context/AuthContext'; // Assuming AuthContext
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';
import DateInput from '../../components/DateInput';
import './Zoom.css';

export default function ZoomDashboard() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [meetings, setMeetings] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('upcoming');
    
    // Create Meeting Form State
    const [showCreateForm, setShowCreateForm] = useState(false);
    const [formData, setFormData] = useState({
        topic: '',
        department: 'General',
        start_time: new Date().toISOString().slice(0, 16),
        duration: 30,
        type: 'general',
        participantIds: [],
        message: ''
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actionLoading, setActionLoading] = useState(null); // stores meeting_id being processed
    
    // Permission Check: 'zoom' allows viewing, 'zoom_create' allows creating.
    const canManageZoom = isManagerRole(user) || user?.permissions?.includes('zoom');
    const canCreateZoom = canManageZoom || user?.permissions?.includes('zoom_create');

    useEffect(() => {
        fetchMeetings();
        fetchEmployees();
    }, []);

    const fetchMeetings = async () => {
        try {
            setLoading(true);
            const res = await API.get('/zoom/meetings');
            if (res.data.success) {
                setMeetings(res.data.meetings);
            }
        } catch (error) {
            console.error('Error fetching meetings:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchEmployees = async () => {
        try {
            const res = await API.get('/employees');
            if (res.data.success) {
                setEmployees(res.data.employees);
            }
        } catch (error) {
            console.error('Error fetching employees:', error);
        }
    };

    const handleCreateMeeting = async (e) => {
        e.preventDefault();
        try {
            setIsSubmitting(true);
            const res = await API.post('/zoom/meetings', formData);
            if (res.data.success) {
                setShowCreateForm(false);
                setFormData({
                    topic: '',
                    department: 'General',
                    start_time: new Date().toISOString().slice(0, 16),
                    duration: 30,
                    type: 'general',
                    participantIds: [],
                    message: ''
                });
                showToast('Meeting scheduled successfully!');
                fetchMeetings();
            }
        } catch (error) {
            console.error('Error creating meeting:', error);
            showToast(error.response?.data?.message || 'Failed to create meeting', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleInstantMeeting = async () => {
        // User wants "Host Instant" to be "New Meeting" form. 
        // We'll just trigger the creation form modal.
        setShowCreateForm(true);
    };

    const handleDeleteMeeting = async (id) => {
        if (!window.confirm('Are you sure you want to cancel this meeting?')) return;
        try {
            setActionLoading(id);
            await API.delete(`/zoom/meetings/${id}`);
            showToast('Meeting cancelled successfully');
            fetchMeetings();
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to delete meeting', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const handleEndMeeting = async (id) => {
        if (!window.confirm('Are you sure you want to end this live meeting for everyone?')) return;
        try {
            setActionLoading(id);
            const res = await API.patch(`/zoom/meetings/${id}/end`);
            if (res.data.success) {
                showToast('Meeting ended successfully');
                fetchMeetings();
            }
        } catch (error) {
            showToast(error.response?.data?.message || 'Failed to end meeting', 'error');
        } finally {
            setActionLoading(null);
        }
    };

    const filterMeetings = () => {
        const now = new Date();
        return meetings.filter(m => {
            const isPast = new Date(m.start_time) < now && m.status !== 'started' && m.status !== 'scheduled';
            return activeTab === 'upcoming' ? !isPast : isPast;
        });
    };

    if (loading) {
        return (
            <div className="zoom-container">
                <div className="zoom-spinner zoom-spinner-lg"></div>
            </div>
        );
    }

    return (
        <div className="zoom-container zoom-space-y">
            
            {/* Header */}
            <div className="zoom-glass-card zoom-flex-between">
                <div className="zoom-flex-row zoom-gap-4">
                    <div className="zoom-icon-wrapper zoom-icon-wrapper-sm">
                        <FiVideo size={28} />
                    </div>
                    <div>
                        <h1 className="zoom-title zoom-gradient-text">Zoom Meetings</h1>
                        <p className="zoom-subtitle" style={{margin:0}}>Manage interviews, training, and team meetings seamlessly.</p>
                    </div>
                </div>
                {canCreateZoom && (
                    <div className="zoom-flex-row zoom-gap-4" style={{marginTop: '16px'}}>
                        <button onClick={handleInstantMeeting} className="zoom-btn zoom-btn-danger zoom-pulse-red">
                            <FiPlus size={18} />
                            <span>New Meeting</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Dashboard Tabs */}
            <div style={{ borderRadius: '24px', overflow: 'hidden', boxShadow: '0 10px 40px rgba(31,38,135,0.05)', border: '1px solid var(--border-color)' }}>
                <div className="zoom-tabs">
                    <button 
                        className={`zoom-tab ${activeTab === 'upcoming' ? 'active' : ''}`}
                        onClick={() => setActiveTab('upcoming')}
                    >
                        Upcoming Meetings
                    </button>
                    <button 
                        className={`zoom-tab ${activeTab === 'past' ? 'active' : ''}`}
                        onClick={() => setActiveTab('past')}
                    >
                        Past Meetings
                    </button>
                </div>

                <div className="zoom-grid">
                    {filterMeetings().length === 0 ? (
                        <div className="zoom-flex-col" style={{alignItems:'center', justifyContent:'center', padding:'60px 0', width:'100%', gridColumn: '1 / -1'}}>
                            <FiVideo size={48} style={{color: 'var(--text-muted)', marginBottom:'16px'}} />
                            <p style={{color: 'var(--text-secondary)'}}>No {activeTab} meetings found.</p>
                        </div>
                    ) : (
                        filterMeetings().map(meeting => (
                            <div key={meeting._id} className="zoom-meeting-card">
                                <div className="zoom-flex-between" style={{marginBottom: '16px'}}>
                                    <div className={`zoom-badge ${
                                        meeting.status === 'started' ? 'zoom-badge-green' :
                                        meeting.status === 'cancelled' ? 'zoom-badge-red' :
                                        meeting.type === 'interview' ? 'zoom-badge-purple' :
                                        'zoom-badge-blue'
                                    }`}>
                                        {meeting.status} • {meeting.type}
                                    </div>
                                    {(canManageZoom || user.id === meeting.host_id) && activeTab === 'upcoming' && (
                                        <button onClick={() => handleDeleteMeeting(meeting.meeting_id)} style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer'}}>
                                            <FiTrash2 />
                                        </button>
                                    )}
                                </div>
                                <h3 className="zoom-meeting-title" title={meeting.topic}>{meeting.topic}</h3>
                                <div className="zoom-meeting-details">
                                    <div className="zoom-detail-row">
                                        <FiCalendar />
                                        <span>{formatDate(meeting.start_time)}</span>
                                    </div>
                                    <div className="zoom-detail-row">
                                        <FiClock />
                                        <span>{new Date(meeting.start_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} ({meeting.duration} min)</span>
                                    </div>
                                    <div className="zoom-detail-row">
                                        <FiUsers />
                                        <span>Dept: {meeting.department}</span>
                                    </div>
                                    {meeting.message && (
                                        <div className="zoom-detail-row" style={{fontStyle: 'italic', marginTop: '4px', borderLeft: '2px solid var(--zoom-blue)', paddingLeft: '8px'}}>
                                            "{meeting.message}"
                                        </div>
                                    )}
                                </div>
                                
                                <div className="zoom-card-footer">
                                    {activeTab === 'upcoming' && (
                                        <div className="zoom-flex-col zoom-gap-2" style={{width: '100%'}}>
                                            <a 
                                                href={(user.id === meeting.host_id && meeting.start_url) ? meeting.start_url : (meeting.join_url || '#')} 
                                                target="_blank" 
                                                rel="noreferrer"
                                                className={`zoom-btn zoom-btn-full ${
                                                    meeting.status === 'started' || new Date(meeting.start_time) < new Date(new Date().getTime() + 10 * 60000) 
                                                        ? 'zoom-btn-primary'
                                                        : 'zoom-btn-secondary'
                                                }`}
                                                onClick={(e) => {
                                                    if(!meeting.join_url && !meeting.start_url) {
                                                        e.preventDefault();
                                                        showToast("Meeting link not available yet.", "info");
                                                    }
                                                }}
                                            >
                                                <FiLink />
                                                <span>{user.id === meeting.host_id ? 'Start Meeting' : 'Join Meeting'}</span>
                                            </a>
                                            
                                            {(canManageZoom || user.id === meeting.host_id) && (meeting.status === 'started' || meeting.status === 'scheduled') && (
                                                <button 
                                                    disabled={actionLoading === meeting.meeting_id}
                                                    onClick={() => handleEndMeeting(meeting.meeting_id)}
                                                    className="zoom-btn zoom-btn-full zoom-btn-danger-outline"
                                                >
                                                    {actionLoading === meeting.meeting_id ? <span className="zoom-spinner zoom-spinner-sm"></span> : <><FiSquare /> <span>End meeting</span></>}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Create Meeting Modal */}
            {showCreateForm && (
                <div className="zoom-modal-overlay">
                    <div className="zoom-modal">
                        <div className="zoom-modal-header">
                            <h2 className="zoom-modal-title">Create New Meeting</h2>
                            <button className="zoom-close-btn" onClick={() => setShowCreateForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleCreateMeeting} className="zoom-modal-body">
                            <div className="zoom-form-group">
                                <label className="zoom-label">Meeting Topic</label>
                                <input required type="text" className="zoom-input" value={formData.topic} onChange={e => setFormData({...formData, topic: e.target.value})} placeholder="E.g., Engineering Team Sync" />
                            </div>
                            <div className="zoom-flex-row zoom-gap-4 zoom-form-group">
                                <div style={{flex: 1}}>
                                    <label className="zoom-label">Type</label>
                                    <select className="zoom-select" value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                                        <option value="general">General</option>
                                        <option value="interview">Interview</option>
                                        <option value="team">Team Meeting</option>
                                        <option value="training">Training Session</option>
                                        <option value="hr_consultation">HR Consultation</option>
                                    </select>
                                </div>
                                <div style={{flex: 1}}>
                                    <label className="zoom-label">Duration (Mins)</label>
                                    <input required type="number" min="1" className="zoom-input" value={formData.duration || ''} 
                                        onChange={e => {
                                            const val = parseInt(e.target.value);
                                            setFormData({...formData, duration: isNaN(val) ? 0 : val});
                                        }} 
                                    />
                                </div>
                            </div>
                            <div className="zoom-flex-row zoom-gap-4 zoom-form-group">
                                <div style={{flex: 1}}>
                                    <label className="zoom-label">Date</label>
                                    <DateInput label="Date" required value={formData.start_time?.includes('T') ? formData.start_time.split('T')[0] : ''} 
                                        onChange={e => {
                                            const time = formData.start_time?.includes('T') ? formData.start_time.split('T')[1] : '10:00';
                                            setFormData({...formData, start_time: `${e.target.value}T${time}`});
                                        }} 
                                    />
                                </div>
                                <div style={{flex: 1}}>
                                    <label className="zoom-label">Time</label>
                                    <input required type="time" className="zoom-input" value={formData.start_time?.includes('T') ? formData.start_time.split('T')[1] : ''} 
                                        onChange={e => {
                                            const date = formData.start_time?.includes('T') ? formData.start_time.split('T')[0] : new Date().toISOString().split('T')[0];
                                            setFormData({...formData, start_time: `${date}T${e.target.value}`});
                                        }} 
                                    />
                                </div>
                            </div>

                            <div className="zoom-form-group">
                                <label className="zoom-label">Message / Instructions</label>
                                <textarea className="zoom-input" style={{height: '80px', resize: 'none'}} value={formData.message} 
                                    onChange={e => setFormData({...formData, message: e.target.value})} placeholder="E.g., Please prepare the Q3 report for discussion." />
                            </div>

                            <div className="zoom-form-group">
                                <label className="zoom-label">Add Participants (Selected: {formData.participantIds.length})</label>
                                <div className="zoom-participant-selector" style={{ 
                                    maxHeight: '150px', 
                                    overflowY: 'auto', 
                                    border: '1px solid var(--border-color)', 
                                    borderRadius: '12px',
                                    padding: '10px'
                                }}>
                                    {employees.map(emp => (
                                        <label key={emp._id} style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            padding: '6px 10px', 
                                            cursor: 'pointer',
                                            borderRadius: '8px',
                                            transition: 'background 0.2s',
                                            marginBottom: '2px'
                                        }} className="zoom-hover-light">
                                            <input 
                                                type="checkbox" 
                                                style={{ marginRight: '10px' }}
                                                checked={formData.participantIds.includes(emp._id)}
                                                onChange={(e) => {
                                                    const ids = e.target.checked 
                                                        ? [...formData.participantIds, emp._id]
                                                        : formData.participantIds.filter(id => id !== emp._id);
                                                    setFormData({...formData, participantIds: ids});
                                                }}
                                            />
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontWeight: 500, fontSize: '14px' }}>{emp.name}</span>
                                                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{emp.id} • {emp.designation}</span>
                                            </div>
                                        </label>
                                    ))}
                                    {employees.length === 0 && <p style={{ textAlign: 'center', fontSize: '14px', color: 'var(--text-muted)' }}>Loading employees...</p>}
                                </div>
                            </div>
                            
                            <div className="zoom-flex-row zoom-gap-4 mt-4" style={{borderTop: '1px solid var(--border-color)', paddingTop:'20px'}}>
                                <button type="button" onClick={() => setShowCreateForm(false)} className="zoom-btn zoom-btn-secondary" style={{flex: 1}}>Cancel</button>
                                <button type="submit" disabled={isSubmitting} className="zoom-btn zoom-btn-primary" style={{flex: 1}}>
                                    {isSubmitting ? <span className="zoom-spinner"></span> : 'Create Meeting'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
