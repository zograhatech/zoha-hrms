import { useState, useEffect, useCallback } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import {
    FiCalendar, FiCheckCircle, FiXCircle, FiClock,
    FiActivity, FiList
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';

const STATUS_COLOR = { present: 'present', absent: 'absent', late: 'late', 'half-day': 'half-day', holiday: 'holiday' };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Attendance() {
    const { user } = useAuth();
    const today = new Date();
    const [month, setMonth] = useState(today.getMonth() + 1);
    const [year, setYear] = useState(today.getFullYear());
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    const fetchAttendance = useCallback(async () => {
        if (!user?.id) return;
        setLoading(true);
        try {
            const r = await API.get(`/attendance/${user.id}?month=${month}&year=${year}`);
            setData(r.data);
        } catch {
            // Error handled by UI
        } finally {
            setLoading(false);
        }
    }, [user?.id, month, year]);

    useEffect(() => {
        fetchAttendance();
    }, [fetchAttendance]);

    const buildCalendar = () => {
        const d = new Date(year, month - 1, 1);
        const cells = [];
        for (let i = 0; i < d.getDay(); i++) cells.push(null);
        const days = new Date(year, month, 0).getDate();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        for (let d = 1; d <= days; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const rec = data?.attendance?.find(a => a.date?.startsWith(dateStr));
            const isToday = dateStr === todayStr;
            const isPast = dateStr < todayStr;
            // If no record and it's a past day → mark absent
            const status = rec?.status || (isPast && !isToday ? 'absent' : undefined);
            cells.push({ day: d, date: dateStr, status, isToday });
        }
        return cells;
    };

    const cells = data ? buildCalendar() : [];
    const s = data?.summary ? {
        ...data.summary,
        absent: cells.filter(c => c && c.status === 'absent').length,
        present: cells.filter(c => c && c.status === 'present').length,
        late: cells.filter(c => c && c.status === 'late').length
    } : null;
    if (s) s.totalWorkingDays = s.present + s.absent + s.late + (s.halfDay || 0);
    
    const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiCalendar style={{ marginRight: 8, verticalAlign: 'middle' }} /> Attendance</div>
                    <div className="page-subtitle">Your monthly attendance calendar and summary</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <select className="form-select" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
                        {monthNames.slice(1).map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                    </select>
                    <select className="form-select" style={{ width: 100 }} value={year} onChange={e => setYear(+e.target.value)}>
                        {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                </div>
            </div>

            {/* Summary Stats */}
            {s && (
                <div className="grid-3" style={{ marginBottom: 24 }}>
                    {[
                        { label: 'Present', value: s.present, color: '#10b981', icon: <FiCheckCircle /> },
                        { label: 'Absent', value: s.absent, color: '#ef4444', icon: <FiXCircle /> },
                        { label: 'Late', value: s.late, color: '#f59e0b', icon: <FiClock /> }
                    ].map(st => (
                        <div key={st.label} className="card text-center">
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: st.color }}>{st.value}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                {st.icon} {st.label}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Calendar */}
            <div className="card">
                <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <FiCalendar className="text-primary" /> {monthNames[month]} {year} — Attendance Calendar
                </h3>
                {loading ? (
                    <div className="page-loader"><div className="loading-spinner" /></div>
                ) : (
                    <>
                        <div className="att-calendar">
                            {DAYS.map(d => <div key={d} className="att-day-header">{d}</div>)}
                            {cells.map((cell, i) => (
                                cell
                                    ? <div key={i} className={`att-day ${STATUS_COLOR[cell.status] || ''} ${cell.isToday ? 'today' : ''}`} title={cell.status || (cell.isToday ? 'Today' : '')}>
                                        {cell.day}
                                    </div>
                                    : <div key={i} className="att-day empty" />
                            ))}
                        </div>

                        {/* Legend */}
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                            {[['present', '#10b981', 'Present'], ['absent', '#ef4444', 'Absent'], ['late', '#f59e0b', 'Late'], ['half-day', '#3b82f6', 'Half Day'], ['holiday', '#a855f7', 'Holiday']].map(([cls, col, lbl]) => (
                                <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                                    <div style={{ width: 14, height: 14, borderRadius: 4, background: col + '33', border: `1px solid ${col}55` }} />
                                    <span style={{ color: 'var(--text-secondary)' }}>{lbl}</span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {/* Detailed records */}
            {data?.attendance?.length > 0 && (
                <div className="card" style={{ marginTop: 20 }}>
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiList className="text-primary" /> Attendance Log
                    </h3>
                    <table className="data-table">
                        <thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Check Out</th><th>Hours</th></tr></thead>
                        <tbody>
                            {data.attendance.map(a => (
                                <tr key={a._id || a.id}>
                                    <td>{formatDate(a.date)}</td>
                                    <td><span className={`badge badge-${a.status === 'present' ? 'success' : a.status === 'absent' ? 'danger' : a.status === 'late' ? 'warning' : 'info'}`}>{a.status}</span></td>
                                    <td>{a.check_in || '—'}</td>
                                    <td>{a.check_out || '—'}</td>
                                    <td>{a.work_hours || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

