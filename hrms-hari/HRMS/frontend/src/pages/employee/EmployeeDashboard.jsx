import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import AttendanceWidget from '../../components/AttendanceWidget';
import BirthdayCard from '../../components/BirthdayCard';
import MonthCalendar from '../../components/MonthCalendar';
import {
    FiSun, FiCreditCard, FiCalendar, FiMessageSquare,
    FiCheckCircle, FiXCircle, FiPieChart, FiClock,
    FiArrowRight, FiGift, FiStar, FiVideo, FiZap
} from 'react-icons/fi';
import { formatDate } from '../../utils/dateFormatter';
import WorkspaceOverview from '../../components/WorkspaceOverview';

const StatCard = ({ icon, label, value, color, sub }) => (
    <div className="stat-card">
        <div className="stat-icon" style={{ background: color + '22', color: color, fontSize: '1.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {icon}
        </div>
        <div className="stat-info">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
            {sub && <div className="stat-change">{sub}</div>}
        </div>
    </div>
);

export default function EmployeeDashboard() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [leave, setLeave] = useState(null);
    const [attendance, setAttendance] = useState(null);
    const [payroll, setPayroll] = useState(null);
    const [tickets, setTickets] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [zoomMeetings, setZoomMeetings] = useState([]);
    const [companyEvents, setCompanyEvents] = useState([]);
    const [globalPolicies, setGlobalPolicies] = useState({});
    const [resignation, setResignation] = useState(null);

    useEffect(() => {
        if (!user?.id) return;
        
        // Fetch unified dashboard data
        API.get('/employees/dashboard-overview').then(r => {
            if (r.data.success) {
                const { dashboard } = r.data;
                setLeave(dashboard.leave);
                setAttendance(dashboard.attendance);
                setTickets(dashboard.tickets);
                setUpcomingEvents(dashboard.upcomingEvents);
                setCompanyEvents(dashboard.companyEvents);
                setGlobalPolicies(dashboard.globalPolicies || {});
            }
        }).catch(() => { });

        // Remaining standalone calls
        API.get('/zoom/meetings').then(r => {
            if (r.data.success) {
                const now = new Date();
                const upcoming = (r.data.meetings || []).filter(m => new Date(m.start_time) >= now);
                setZoomMeetings(upcoming);
            }
        }).catch(() => { });

        API.get('/resignations/my').then(r => setResignation(r.data.resignation || null)).catch(() => { });

        // Optional: Keep specific payroll fetch if needed for previous month logic
        const prevMonthDate = new Date();
        prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
        const pm = prevMonthDate.getMonth() + 1;
        const py = prevMonthDate.getFullYear();
        API.get(`/payroll/${user.id}?month=${pm}&year=${py}`).then(r => {
            if (r.data.payroll) setPayroll({ ...r.data, isPrevious: true });
        }).catch(() => { });
    }, [user]);

    const bal = leave?.balance;
    const att = attendance?.summary;

    const quickActions = [
        { icon: <FiSun />, label: 'Apply Leave', color: '#10b981', action: () => navigate('/dashboard/leave') },
        { icon: <FiCreditCard />, label: 'View Payslip', color: '#6366f1', action: () => navigate('/dashboard/payroll') },
        { icon: <FiCalendar />, label: 'Attendance', color: '#3b82f6', action: () => navigate('/dashboard/attendance') },
        { icon: <FiMessageSquare />, label: 'Raise Ticket', color: '#f59e0b', action: () => navigate('/dashboard/tickets') },
    ];

    const calendarEvents = [];
    if (leave?.leaves) {
        leave.leaves.forEach(l => {
            if (l.start_date) {
                calendarEvents.push({
                    date: l.start_date,
                    title: `My ${l.leave_type} Leave`,
                    type: 'leave',
                    color: l.status === 'approved' ? '#10b981' : l.status === 'rejected' ? '#ef4444' : '#f59e0b'
                });
            }
        });
    }
    upcomingEvents.forEach(e => {
        e.events.forEach(ev => {
            if (ev.date) {
                calendarEvents.push({
                    date: ev.date,
                    title: ev.type === 'birthday' ? `${e.name}'s B-Day` : `${e.name}'s ${ev.years}Yr Anniv`,
                    type: ev.type,
                    color: ev.type === 'birthday' ? '#ec4899' : '#8b5cf6'
                });
            }
        });
    });
    
    zoomMeetings.forEach(m => {
        if (m.start_time) {
            calendarEvents.push({
                date: m.start_time,
                title: `${m.topic}`,
                type: 'zoom',
                color: '#2D8CFF' // Zoom Blue
            });
        }
    });

    companyEvents.forEach(e => {
        calendarEvents.push({
            date: e.date,
            title: e.title,
            type: e.type,
            color: e.color,
            description: e.description,
            startTime: e.startTime,
            endTime: e.endTime
        });
    });

    if (resignation && (resignation.status === 'approved' || resignation.status === 'pending')) {
        calendarEvents.push({
            date: resignation.last_working_day,
            title: `My Last Working Day`,
            type: 'resignation',
            color: '#ef4444'
        });
    }

    return (
        <div>
            {/* Welcome banner */}
            <div className="card" style={{ marginBottom: 24, borderColor: 'rgba(99,102,241,0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
                    <div>
                        <h1 style={{ fontSize: '1.6rem', fontWeight: 900, marginBottom: 6 }}>
                            Welcome back, {user?.name?.split(' ')[0]}!
                        </h1>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            {user?.designation} · {user?.department_name} · ID: {user?.id}
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {quickActions.map(a => (
                            <button key={a.label} onClick={a.action} className="btn btn-outline" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: a.color, display: 'flex' }}>{a.icon}</span> {a.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Attendance Widget */}
            <AttendanceWidget />
            <div style={{ marginBottom: 24 }} />



            <WorkspaceOverview />




            {/* Monthly Calendar */}
            <MonthCalendar events={calendarEvents} />

            {/* Leave Balance & Recent Leaves */}
            <div className="grid-2" style={{ marginBottom: 24 }}>
                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiPieChart className="text-primary" /> Leave Balance
                    </h3>
                    {bal ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[
                                { label: 'Casual Leave (Monthly)', used: (globalPolicies.casual_leave || 0) - (bal?.casual_leave || 0), total: globalPolicies.casual_leave || 0, color: '#6366f1' },
                                { label: 'Sick Leave (Monthly)', used: (globalPolicies.sick_leave || 0) - (bal?.sick_leave || 0), total: globalPolicies.sick_leave || 0, color: '#f59e0b' },
                            ].map(lb => (
                                <div key={lb.label}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                                        <span style={{ color: 'var(--text-secondary)' }}>{lb.label}</span>
                                        <span style={{ fontWeight: 700 }}>{lb.total - lb.used} / {lb.total} monthly left</span>
                                    </div>
                                    <div style={{ height: 6, background: 'var(--border-color)', borderRadius: 3, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${(lb.used / lb.total) * 100}%`, background: lb.color, borderRadius: 3, transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
                    <button className="btn btn-primary btn-sm" style={{ marginTop: 16, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => navigate('/dashboard/leave')}>
                        Apply Leave <FiArrowRight />
                    </button>
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiClock className="text-primary" /> Recent Activities
                    </h3>
                    {leave?.leaves?.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {leave.leaves.slice(0, 4).map(l => (
                                <div key={l._id || l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                    <div>
                                        <div style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'capitalize' }}>{l.leave_type} Leave</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(l.start_date)} · {l.total_days} day{l.total_days > 1 ? 's' : ''}</div>
                                    </div>
                                    <span className={`badge badge-${l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'warning'}`}>
                                        {l.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    ) : <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No leave history found.</p>}
                </div>

                <div className="card">
                    <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <FiStar className="text-primary" /> Upcoming Work Anniversaries
                    </h3>
                    {(() => {
                        const today = new Date();
                        const tMonth = today.getUTCMonth();
                        const tDate = today.getUTCDate();

                        const workAnnivs = upcomingEvents
                            .map(e => {
                                const validEvents = e.events.filter(ev => {
                                    if (ev.type === 'birthday') return false;
                                    const d = new Date(ev.date);
                                    if (d.getUTCMonth() > tMonth) return true;
                                    if (d.getUTCMonth() === tMonth && d.getUTCDate() >= tDate) return true;
                                    return false;
                                });
                                return { ...e, events: validEvents };
                            })
                            .filter(e => e.events.length > 0);

                        if (workAnnivs.length === 0) {
                            return <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No work anniversaries this month.</p>;
                        }

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {workAnnivs.slice(0, 4).map(e => (
                                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(0,0,0,0.03)', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                                        <div>
                                            <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{e.name}</div>
                                            <div style={{ display: 'flex', gap: 8 }}>
                                                {e.events.map((ev, idx) => (
                                                    <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <FiStar style={{ color: '#f59e0b' }} />
                                                        {formatDate(ev.date)}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)' }}>
                                            {e.events.map(ev => `${ev.years} Year Anniv`).join(' & ')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                <BirthdayCard events={upcomingEvents} />
            </div>

            {/* Tickets */}
            {tickets.length > 0 && (
                <div className="card">
                    <div className="flex-between" style={{ marginBottom: 16 }}>
                        <h3 style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiMessageSquare className="text-primary" /> My Support Tickets
                        </h3>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate('/dashboard/tickets')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            View all <FiArrowRight />
                        </button>
                    </div>
                    <table className="data-table">
                        <thead><tr><th>Ticket #</th><th>Subject</th><th>Priority</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>
                            {tickets.slice(0, 3).map(t => (
                                <tr key={t._id || t.id}>
                                    <td style={{ fontWeight: 700, color: 'var(--accent-light)', fontSize: '0.8rem' }}>{t.ticket_number}</td>
                                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subject}</td>
                                     <td><span className={`badge badge-${t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'info'}`}>{t.priority}</span></td>
                                    <td><span className={`badge badge-${t.status === 'resolved' ? 'success' : t.status === 'open' ? 'warning' : 'info'}`}>{t.status}</span></td>
                                    <td style={{ fontSize: '0.8rem' }}>{formatDate(t.createdAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

