import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import API from '../../api/axios';
import {
    FiCalendar, FiPlus, FiX, FiLoader,
    FiCheckCircle, FiEdit2, FiTrash2, FiClock, FiTag, FiType
} from 'react-icons/fi';

import CustomDatePicker from '../../components/CustomDatePicker';
import { formatDate } from '../../utils/dateFormatter';
import { isManagerRole } from '../../utils/roleHelper';

export default function Events() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const permissions = user?.permissions || [];
    const isHRM = isManagerRole(user) || permissions.includes('manage_events');

    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [editingEvent, setEditingEvent] = useState(null);
    
    const [form, setForm] = useState({
        title: '',
        description: '',
        date: '',
        startTime: '10:00',
        endTime: '11:00',
        type: 'meeting',
        color: '#3b82f6'
    });

    const loadEvents = async () => {
        try {
            const res = await API.get('/events');
            setEvents(res.data.events || []);
        } catch (error) {
            showToast('Failed to load events', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadEvents();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingEvent) {
                await API.put(`/events/${editingEvent._id}`, form);
                showToast('Event updated successfully', 'success');
            } else {
                await API.post('/events', form);
                showToast('Event created successfully', 'success');
            }
            setShowForm(false);
            setEditingEvent(null);
            resetForm();
            loadEvents();
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to save event', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const resetForm = () => {
        setForm({
            title: '',
            description: '',
            date: '',
            startTime: '10:00',
            endTime: '11:00',
            type: 'meeting',
            color: '#3b82f6'
        });
    };

    const handleEdit = (event) => {
        setEditingEvent(event);
        setForm({
            title: event.title,
            description: event.description || '',
            date: event.date.split('T')[0],
            startTime: event.startTime,
            endTime: event.endTime,
            type: event.type,
            color: event.color
        });
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this event?')) return;
        try {
            await API.delete(`/events/${id}`);
            showToast('Event deleted', 'success');
            loadEvents();
        } catch (err) {
            showToast('Delete failed', 'error');
        }
    };

    const getTypeColor = (type) => {
        switch (type) {
            case 'holiday': return '#f59e0b';
            case 'meeting': return '#3b82f6';
            case 'workshop': return '#10b981';
            case 'deadline': return '#ef4444';
            default: return '#8b5cf6';
        }
    };

    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiCalendar style={{ marginRight: 8, verticalAlign: 'middle' }} /> Company Events</div>
                    <div className="page-subtitle">{events.length} scheduled events</div>
                </div>
                {isHRM && (
                    <button className="btn btn-primary" onClick={() => { setEditingEvent(null); resetForm(); setShowForm(true); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <FiPlus /> New Event
                    </button>
                )}
            </div>

            {showForm && (
                <div className="modal-overlay" onClick={() => setShowForm(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <FiCalendar /> {editingEvent ? 'Edit Event' : 'Schedule Event'}
                            </h3>
                            <button className="modal-close" onClick={() => setShowForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Event Title</label>
                                    <input className="form-input" placeholder="e.g. Quarterly Review" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <CustomDatePicker 
                                        label="Date"
                                        selectedDate={form.date} 
                                        onChange={date => setForm({ ...form, date })} 
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                                    <div className="form-group">
                                        <label className="form-label">Start Time</label>
                                        <input type="time" className="form-input" value={form.startTime} onChange={e => setForm({ ...form, startTime: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">End Time</label>
                                        <input type="time" className="form-input" value={form.endTime} onChange={e => setForm({ ...form, endTime: e.target.value })} required />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Event Type</label>
                                    <select className="form-select" value={form.type} onChange={e => {
                                        const type = e.target.value;
                                        setForm({ ...form, type, color: getTypeColor(type) });
                                    }}>
                                        <option value="meeting">Meeting</option>
                                        <option value="holiday">Holiday</option>
                                        <option value="workshop">Workshop</option>
                                        <option value="deadline">Deadline</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" placeholder="More details..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? <FiLoader className="spin" /> : editingEvent ? 'Update Event' : 'Create Event'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                {events.length === 0 ? (
                    <div className="card" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px' }}>
                        <FiCalendar size={40} color="var(--text-muted)" style={{ marginBottom: 15 }} />
                        <p style={{ color: 'var(--text-muted)' }}>No events scheduled yet.</p>
                    </div>
                ) : (
                    events.map(ev => (
                        <div key={ev._id} className="card" style={{ borderLeft: `5px solid ${ev.color || '#3b82f6'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{ev.title}</div>
                                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, marginTop: 4 }}>
                                        <span className="popover-badge" style={{ background: `${ev.color}20`, color: ev.color }}>{ev.type}</span>
                                    </div>
                                </div>
                                {isHRM && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-icon btn-sm" onClick={() => handleEdit(ev)}><FiEdit2 size={14} /></button>
                                        <button className="btn btn-icon btn-sm text-error" onClick={() => handleDelete(ev._id)}><FiTrash2 size={14} /></button>
                                    </div>
                                )}
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 15 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <FiCalendar size={14} /> {formatDate(ev.date)}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <FiClock size={14} /> {ev.startTime} – {ev.endTime}
                                </div>
                            </div>

                            {ev.description && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 12, lineHeight: 1.5 }}>
                                    {ev.description}
                                </p>
                            )}

                            <div style={{ marginTop: 15, paddingTop: 12, borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                                <span>Organized by</span>
                                <span style={{ fontWeight: 600 }}>{ev.createdBy?.name || 'System'}</span>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
