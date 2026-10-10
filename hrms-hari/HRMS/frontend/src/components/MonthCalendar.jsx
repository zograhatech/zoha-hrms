import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
    FiChevronLeft, FiChevronRight, FiCalendar, FiX, FiClock, 
    FiVideo, FiUsers, FiCheckCircle, FiAlertCircle, FiPlus, 
    FiEdit3, FiBell, FiZap
} from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import API from '../api/axios';
import { formatDate } from '../utils/dateFormatter';

// Extracted DayPopover component to prevent re-renders losing focus in textarea
const DayPopover = ({ 
    selectedDate, events, noteText, setNoteText, handleSaveNote, 
    savingNote, popoverRef, setShowPopover, handlePopoverPrev, 
    handlePopoverNext, handleScheduleMeeting, handleAddEvent, 
    handleActionSoon, canManageEvents, canManageZoom, 
    canManageTasks, canManageReminders 
}) => {
    if (!selectedDate) return null;

    const dayEvents = events.filter(e => {
        if (!e.date) return false;
        const eDate = new Date(e.date);
        return eDate.getDate() === selectedDate.getDate() && 
               eDate.getMonth() === selectedDate.getMonth() && 
               eDate.getFullYear() === selectedDate.getFullYear();
    });

    const meetings = dayEvents.filter(e => e.type === 'zoom' || e.type === 'meeting');
    const hrActivities = dayEvents.filter(e => ['leave', 'birthday', 'anniversary', 'holiday', 'workshop', 'deadline'].includes(e.type));
    
    const mockTasks = selectedDate.getDate() % 2 === 0 ? [
        { title: 'Approve Leave Requests', priority: 'High', status: 'pending' },
        { title: 'Update Payroll Data', priority: 'Medium', status: 'completed' }
    ] : [];
    
    const mockReminders = selectedDate.getDate() % 3 === 0 ? [
        { title: 'Submit Monthly Report', time: '5:00 PM' }
    ] : [];

    return createPortal(
        <div className="popover-overlay">
            <div className="popover-content" ref={popoverRef}>
                <div className="popover-header">
                    <div className="popover-date-info">
                        <div className="popover-day-num">{selectedDate.getDate()}</div>
                        <div className="popover-day-details">
                            <h4>{formatDate(selectedDate)}</h4>
                            <span>{selectedDate.toLocaleDateString('en-IN', { weekday: 'long' })}</span>
                        </div>
                    </div>
                    <div className="popover-header-actions">
                        <button className="btn btn-sm btn-outline popover-nav-btn" onClick={handlePopoverPrev}><FiChevronLeft size={20} /></button>
                        <button className="btn btn-sm btn-outline popover-nav-btn" onClick={handlePopoverNext}><FiChevronRight size={20} /></button>
                        <button className="btn btn-sm btn-outline popover-close-btn" onClick={() => setShowPopover(false)}><FiX size={20} /></button>
                    </div>
                </div>

                <div className="popover-body">

                    <div className="popover-section">
                        <div className="popover-section-title"><FiVideo size={14} color="#3b82f6" /> Meetings & Events</div>
                        {meetings.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No meetings scheduled.</p> : 
                            meetings.map((m, i) => (
                                <div key={i} className="popover-item cat-meeting">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{m.title}</span>
                                        <span className="popover-badge bg-meeting">{m.type === 'zoom' ? 'Zoom' : 'Meeting'}</span>
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 15, flexWrap: 'wrap' }}>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiClock size={12} /> {m.startTime || '10:00 AM'} – {m.endTime || '11:00 AM'}</span>
                                        {m.type === 'zoom' && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiUsers size={12} /> Participants: HR Team</span>}
                                    </div>
                                    {m.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{m.description}</p>}
                                    {m.type === 'zoom' && (
                                        <button className="btn btn-primary btn-sm" 
                                            onClick={handleScheduleMeeting}
                                            style={{ marginTop: 6, fontSize: '0.7rem', padding: '4px 10px', width: 'fit-content' }}>
                                            Join Zoom Meeting
                                        </button>
                                    )}
                                </div>
                            ))
                        }
                    </div>

                    <div className="popover-section">
                        <div className="popover-section-title"><FiZap size={14} color="#f59e0b" /> HRMS & Company Activities</div>
                        {hrActivities.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No activities.</p> : 
                            hrActivities.map((hr, i) => (
                                <div key={i} className="popover-item cat-hr">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{hr.title}</span>
                                        <span className={`popover-badge`} style={{ background: `${hr.color || '#f59e0b'}22`, color: hr.color || '#f59e0b' }}>{hr.type}</span>
                                    </div>
                                    {hr.startTime && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                        <FiClock size={12} /> {hr.startTime} – {hr.endTime}
                                    </div>}
                                    {hr.description && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>{hr.description}</p>}
                                    {hr.type === 'leave' && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Status: <span className="text-success" style={{ fontWeight: 600 }}>Approved</span></div>}
                                </div>
                            ))
                        }
                    </div>

                    <div className="popover-section">
                        <div className="popover-section-title"><FiCheckCircle size={14} color="#10b981" /> Tasks & To-Do</div>
                        {mockTasks.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No tasks for today.</p> : 
                            mockTasks.map((t, i) => (
                                <div key={i} className="popover-item cat-task">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <input type="checkbox" checked={t.status === 'completed'} readOnly />
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem', textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</span>
                                        </div>
                                        <span className={`popover-badge bg-task`} style={{ fontSize: '0.6rem' }}>{t.priority}</span>
                                    </div>
                                </div>
                            ))
                        }
                    </div>

                    <div className="popover-section">
                        <div className="popover-section-title"><FiBell size={14} color="#8b5cf6" /> Reminders</div>
                        {mockReminders.length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No reminders.</p> : 
                            mockReminders.map((r, i) => (
                                <div key={i} className="popover-item cat-reminder" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <FiBell size={14} color="#8b5cf6" />
                                        <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{r.title}</span>
                                    </div>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{r.time}</span>
                                </div>
                            ))
                        }
                    </div>

                    <div className="popover-section">
                        <div className="popover-section-title"><FiEdit3 size={14} color="var(--accent-indigo)" /> Personal Notes</div>
                        <textarea 
                            className="notes-editor" 
                            placeholder="Add a personal note for this day..."
                            value={noteText}
                            onChange={(e) => setNoteText(e.target.value)}
                        ></textarea>
                        <button 
                            className="btn btn-primary btn-sm" 
                            onClick={handleSaveNote}
                            disabled={savingNote}
                            style={{ width: 'fit-content', alignSelf: 'flex-end', padding: '6px 16px' }}
                        >
                            {savingNote ? 'Saving...' : 'Save Note'}
                        </button>
                    </div>
                </div>

                <div className="popover-footer">
                    {canManageEvents && <button className="btn btn-outline btn-sm" onClick={handleAddEvent}><FiPlus /> Add Event</button>}
                    {canManageTasks && <button className="btn btn-outline btn-sm" onClick={() => handleActionSoon('Tasks')}><FiCheckCircle /> Add Task</button>}
                    {canManageReminders && <button className="btn btn-outline btn-sm" onClick={() => handleActionSoon('Reminders')}><FiBell /> Add Reminder</button>}
                    {canManageZoom && <button className="btn btn-primary btn-sm" onClick={handleScheduleMeeting}><FiCalendar /> Schedule Meeting</button>}
                </div>
            </div>
        </div>,
        document.body
    );
};

const MonthCalendar = ({ events = [] }) => {
    const today = new Date();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { showToast } = useToast();
    const permissions = user?.permissions || [];
    const isHRM = user?.role === 'hr_manager';

    const canManageEvents = isHRM || user?.role === 'admin' || permissions.includes('manage_events');
    const canManageZoom = isHRM || user?.role === 'admin' || permissions.includes('manage_zoom');
    const canManageTasks = isHRM || user?.role === 'admin' || permissions.includes('manage_tasks');
    const canManageReminders = isHRM || user?.role === 'admin' || permissions.includes('manage_reminders');
    const [currentDate, setCurrentDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
    const [selectedDate, setSelectedDate] = useState(null);
    const [showPopover, setShowPopover] = useState(false);
    const [notes, setNotes] = useState([]);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const popoverRef = useRef(null);

    // Fetch notes for the current user
    const fetchNotes = async () => {
        try {
            const { data } = await API.get('/notes');
            setNotes(data.notes || []);
        } catch (error) {
            console.error('Failed to load notes:', error.response?.data?.message || error.message);
        }
    };

    useEffect(() => {
        fetchNotes();
    }, []);

    // Close popover on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                setShowPopover(false);
            }
        };
        if (showPopover) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPopover]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    };

    const handleToday = () => {
        setCurrentDate(new Date(today.getFullYear(), today.getMonth(), 1));
    };

    const handleDayClick = (day) => {
        if (!day) return;
        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
        setSelectedDate(targetDate);
        
        // Find existing note for this day
        const existingNote = notes.find(n => {
            const nDate = new Date(n.date);
            return nDate.getDate() === targetDate.getDate() && 
                   nDate.getMonth() === targetDate.getMonth() && 
                   nDate.getFullYear() === targetDate.getFullYear();
        });
        setNoteText(existingNote ? existingNote.content : '');
        setShowPopover(true);
    };

    const handlePopoverPrev = () => {
        const newDate = new Date(selectedDate);
        newDate.setDate(selectedDate.getDate() - 1);
        setSelectedDate(newDate);
    };

    const handlePopoverNext = () => {
        const newDate = new Date(selectedDate);
        newDate.setDate(selectedDate.getDate() + 1);
        setSelectedDate(newDate);
    };

    const handleActionSoon = (type) => {
        showToast(`${type} module is coming soon!`, 'info');
    };

    const handleScheduleMeeting = () => {
        setShowPopover(false);
        navigate('/dashboard/zoom');
    };

    const handleAddEvent = () => {
        setShowPopover(false);
        navigate('/dashboard/events');
    };

    const handleSaveNote = async () => {
        if (!selectedDate || !noteText.trim()) return;
        setSavingNote(true);
        try {
            await API.post('/notes', {
                date: selectedDate.toISOString(),
                content: noteText
            });
            showToast('Note saved successfully!', 'success');
            fetchNotes();
        } catch (error) {
            showToast('Failed to save note', 'error');
        } finally {
            setSavingNote(false);
        }
    };

    // Calendar logic
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();

    const days = [];
    for (let i = 0; i < firstDayOfMonth; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    return (
        <div className="card moncat-container" style={{ marginBottom: 24, padding: '24px', position: 'relative' }}>
            {/* Header */}
            <div className="moncat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <h3 className="moncat-title" style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, fontSize: '1.2rem' }}>
                    <FiCalendar className="text-primary" /> 
                    {monthNames[month]} {year}
                </h3>
                <div style={{ display: 'flex', gap: 8 }} className="moncat-controls">
                    <button onClick={handleToday} className="btn btn-sm btn-outline" style={{ padding: '6px 12px', fontSize: '0.8rem' }}>Today</button>
                    <button onClick={handlePrevMonth} className="btn btn-sm btn-outline" style={{ padding: '6px' }}><FiChevronLeft size={16} /></button>
                    <button onClick={handleNextMonth} className="btn btn-sm btn-outline" style={{ padding: '6px' }}><FiChevronRight size={16} /></button>
                </div>
            </div>

            {/* Calendar Grid Wrapper for horizontal scroll on tiny screens */}
            <div className="moncat-grid-wrapper" style={{ width: '100%' }}>
                {/* Day Labels */}
                <div className="moncat-day-labels" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8, marginBottom: 12 }}>
                    {dayNames.map(day => (
                        <div key={day} style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-muted)', fontSize: '0.85rem', padding: '8px 0' }}>{day}</div>
                    ))}
                </div>

                {/* Days Grid */}
                <div className="moncat-days-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px 8px' }}>
                    {days.map((day, index) => {
                        const dIsToday = day === today.getDate() && month === today.getMonth() && year === today.getFullYear();
                        const isWeekend = index % 7 === 0 || index % 7 === 6;
                        const dayEvents = day ? events.filter(e => {
                            if (!e.date) return false;
                            const eDate = new Date(e.date);
                            return eDate.getDate() === day && eDate.getMonth() === month && eDate.getFullYear() === year;
                        }) : [];

                        const dayNote = day ? notes.find(n => {
                            const nDate = new Date(n.date);
                            return nDate.getDate() === day && nDate.getMonth() === month && nDate.getFullYear() === year;
                        }) : null;

                        return (
                            <div key={index} 
                                onClick={() => handleDayClick(day)}
                                style={{
                                    minHeight: '80px', padding: '8px', borderRadius: '8px',
                                    border: day ? '1px solid var(--border-color)' : 'none',
                                    background: dIsToday ? 'var(--gradient-primary)' : (day && isWeekend ? 'rgba(0,0,0,0.015)' : 'rgba(0,0,0,0.03)'),
                                    color: dIsToday ? '#fff' : (isWeekend ? 'var(--text-secondary)' : 'var(--text-primary)'),
                                    display: 'flex', flexDirection: 'column',
                                    boxShadow: dIsToday ? '0 4px 12px rgba(99, 102, 241, 0.3)' : 'none',
                                    opacity: day ? 1 : 0, pointerEvents: day ? 'auto' : 'none',
                                    transition: 'all 0.2s', cursor: day ? 'pointer' : 'default',
                                    position: 'relative'
                                }}
                                className={`moncat-day ${day && !dIsToday ? "calendar-day-hover" : ""} ${dayEvents.length > 0 ? "has-events" : ""}`}
                            >
                                {day && (
                                    <>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: 6 }}>
                                            {dayNote && <FiEdit3 size={12} style={{ opacity: dIsToday ? 1 : 0.6 }} title="Has personal note" />}
                                            <div style={{ fontWeight: dIsToday ? 800 : 600, fontSize: '1rem', marginLeft: 'auto' }}>{day}</div>
                                        </div>
                                        <div className="moncat-events-container" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                                            {dayEvents.slice(0, 2).map((e, idx) => (
                                                <div key={idx} className="moncat-event-dot" style={{ 
                                                    fontSize: '0.65rem', padding: '2px 4px', borderRadius: '4px', 
                                                    background: e.color || 'var(--accent-primary)', color: '#fff',
                                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600
                                                }} title={e.title}>{e.title}</div>
                                            ))}
                                            {dayEvents.length > 2 && <div className="moncat-more-label" style={{ fontSize: '0.65rem', color: dIsToday ? 'rgba(255,255,255,0.8)' : 'var(--text-muted)', textAlign: 'center', fontWeight: 600 }}>+{dayEvents.length - 2} more</div>}
                                        </div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Popover Render */}
            {showPopover && (
                <DayPopover 
                    selectedDate={selectedDate}
                    events={events}
                    noteText={noteText}
                    setNoteText={setNoteText}
                    handleSaveNote={handleSaveNote}
                    savingNote={savingNote}
                    popoverRef={popoverRef}
                    setShowPopover={setShowPopover}
                    handlePopoverPrev={handlePopoverPrev}
                    handlePopoverNext={handlePopoverNext}
                    handleScheduleMeeting={handleScheduleMeeting}
                    handleAddEvent={handleAddEvent}
                    handleActionSoon={handleActionSoon}
                    canManageEvents={canManageEvents}
                    canManageZoom={canManageZoom}
                    canManageTasks={canManageTasks}
                    canManageReminders={canManageReminders}
                />
            )}
            
            <style dangerouslySetInnerHTML={{__html: `
                .calendar-day-hover:hover {
                    border-color: var(--accent-primary) !important;
                    background: rgba(99, 102, 241, 0.03) !important;
                    transform: translateY(-2px);
                }

                @media (max-width: 768px) {
                    .moncat-container { padding: 12px !important; }
                    .moncat-header { flex-direction: column; align-items: flex-start !important; gap: 12px; margin-bottom: 16px !important; }
                    .moncat-title { font-size: 1rem !important; }
                    .moncat-day { min-height: 50px !important; padding: 4px !important; }
                    .moncat-day div[style*="font-size: 1rem"] { font-size: 0.8rem !important; }
                    .moncat-event-dot { display: none !important; }
                    .moncat-day.has-events::after {
                        content: ''; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%);
                        width: 4px; height: 4px; border-radius: 50%; background: var(--accent-primary);
                    }
                    .moncat-more-label { display: none !important; }
                }

                @media (max-width: 480px) {
                    .moncat-day-labels div { font-size: 0.65rem !important; }
                    .moncat-day { min-height: 40px !important; }
                }
            `}} />
        </div>
    );
};

export default MonthCalendar;
