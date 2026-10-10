import { useState, useEffect } from 'react';
import API from '../api/axios';
import { FiLogIn, FiLogOut, FiCheckCircle, FiClock } from 'react-icons/fi';
import { useToast } from '../context/ToastContext';
import { formatDate } from '../utils/dateFormatter';

export default function AttendanceWidget() {
    const { showToast } = useToast();
    const [status, setStatus] = useState(null); // { check_in: str, check_out: str } or null
    const [loading, setLoading] = useState(true);
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);

        API.get('/attendance/status')
            .then(r => setStatus(r.data))
            .catch(() => { }) // likely 404 if no record, which is fine
            .finally(() => setLoading(false));

        return () => clearInterval(timer);
    }, []);

    const handleClockIn = async () => {
        try {
            const { data } = await API.post('/attendance/clock-in');
            setStatus(prev => ({ ...prev, attendance: data.attendance }));
            showToast('Checked in successfully!', 'success');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to clock in', 'error');
        }
    };

    const handleClockOut = async () => {
        try {
            const { data } = await API.post('/attendance/clock-out');
            setStatus(prev => ({ ...prev, attendance: data.attendance }));
            showToast('Checked out successfully!', 'success');
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to clock out', 'error');
        }
    };
    const formatTime = (time) => {
        if (!time) return '';
        const date = new Date(time);
        if (isNaN(date.getTime())) return time;
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    if (loading) return <div className="card">Loading...</div>;

    const attRec = status?.attendance;
    const isClockedIn = attRec?.check_in && !attRec?.check_out;
    const isHoliday = status?.isHoliday;
    const isOnLeave = status?.isOnLeave;

    return (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 180 }}>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{formatDate(time)}</div>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, margin: '10px 0', display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-primary)' }}>
                <FiClock size={32} color="var(--accent-primary)" /> {time.toLocaleTimeString('en-US', { hour12: true })}
            </div>

            {isHoliday ? (
                <div style={{ textAlign: 'center', color: 'var(--accent-indigo)' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                         Holiday: {status.holidayName}
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 4 }}>Enjoy your day off!</div>
                </div>
            ) : isOnLeave ? (
                <div style={{ textAlign: 'center', color: 'var(--accent-indigo)' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                         You are on Approved Leave
                    </div>
                </div>
            ) : isClockedIn ? (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.9rem', marginBottom: 12, fontWeight: 600 }}>Clocked in at: {formatTime(attRec.check_in)}</div>
                    <button onClick={handleClockOut} className="btn btn-outline" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)', fontWeight: 700, padding: '10px 24px', borderRadius: 30, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiLogOut /> Clock Out
                    </button>
                    {(status.limit > 1) && (
                         <div style={{ fontSize: '0.75rem', marginTop: 10, color: 'var(--text-muted)' }}>
                            Session {status.dailyCount} of {status.limit}
                         </div>
                    )}
                </div>
            ) : (status.dailyCount < (status.limit || 1)) ? (
                <div style={{ textAlign: 'center' }}>
                    {attRec?.check_out && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                             Last session: {formatTime(attRec.check_in)} - {formatTime(attRec.check_out)}
                         </div>
                    )}
                    <button onClick={handleClockIn} className="btn" style={{ background: 'var(--accent-primary)', color: 'white', fontWeight: 700, padding: '10px 24px', borderRadius: 30, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <FiLogIn /> Clock In {status.dailyCount > 0 ? '(New Session)' : ''}
                    </button>
                    <div style={{ fontSize: '0.75rem', marginTop: 10, color: 'var(--text-muted)' }}>
                        {status.dailyCount} of {status.limit} sessions used
                    </div>
                </div>
            ) : (
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                        <FiCheckCircle /> You are done for today!
                    </div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8, marginTop: 4 }}>
                        {formatTime(attRec?.check_in)} - {formatTime(attRec?.check_out)} ({attRec?.work_hours} hrs)
                    </div>
                     <div style={{ fontSize: '0.75rem', marginTop: 10, color: 'var(--text-muted)' }}>
                        All {status.limit} sessions completed
                    </div>
                </div>
            )}
        </div>
    );
}

