import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useBranding } from '../../context/BrandingContext';
import { useNavigate } from 'react-router-dom';

import API from '../../api/axios';
import AttendanceWidget from '../../components/AttendanceWidget';
import {
    FiUsers, FiUserPlus, FiClock, FiMessageSquare,
    FiPieChart, FiBriefcase, FiCheckCircle, FiGift, FiStar,
    FiVideo, FiLogOut, FiZap
} from 'react-icons/fi';
import BirthdayCard from '../../components/BirthdayCard';
import MonthCalendar from '../../components/MonthCalendar';
import { formatDate } from '../../utils/dateFormatter';
import WorkspaceOverview from '../../components/WorkspaceOverview';

const StatCard = ({ icon, label, value, color }) => (
    <div className="stat-card">
        <div className="stat-icon" style={{ background: color + '15', color: color }}>
            {icon}
        </div>
        <div className="stat-info">
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
        </div>
    </div>
);


export default function HRDashboard() {
    const { user } = useAuth();
    const { branding } = useBranding();
    const navigate = useNavigate();
    const permissions = user?.permissions || [];
    const isHRM = user?.role === 'hr_manager';

    const hasAnalytics = isHRM || user?.role === 'admin' || permissions.includes('view_analytics');
    const hasLeaves = isHRM || user?.role === 'admin' || permissions.includes('manage_leaves');
    const hasTickets = isHRM || user?.role === 'admin' || permissions.includes('manage_tickets');

    const [stats, setStats] = useState(null);

    const [pending, setPending] = useState([]);
    const [tickets, setTickets] = useState([]);
    const [upcomingEvents, setUpcomingEvents] = useState([]);
    const [zoomMeetings, setZoomMeetings] = useState([]);
    const [companyEvents, setCompanyEvents] = useState([]);
    const [resignations, setResignations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const calls = [];
        if (hasAnalytics) calls.push(API.get('/employees/stats'));
        else calls.push(Promise.resolve({ data: { stats: null } }));

        if (hasLeaves) calls.push(API.get('/leaves/pending'));
        else calls.push(Promise.resolve({ data: { leaves: [] } }));

        if (hasTickets) calls.push(API.get('/tickets/all?status=open'));
        else calls.push(Promise.resolve({ data: { tickets: [] } }));

        calls.push(API.get('/employees/upcoming-events'));
        calls.push(API.get('/zoom/meetings'));
        calls.push(API.get('/events'));
        calls.push(API.get('/resignations'));

        Promise.all(calls).then((responses) => {
            const [s, l, t, u, z, e, r] = responses;
            setStats(s.data.stats);
            setPending(l.data.leaves || []);
            setTickets(t.data.tickets || []);
            setUpcomingEvents(u.data.events || []);
            setCompanyEvents(e.data.events || []);
            setResignations(r.data.resignations || []);
            
            if (z && z.data && z.data.success) {
                const now = new Date();
                const upcoming = (z.data.meetings || []).filter(m => new Date(m.start_time) >= now);
                setZoomMeetings(upcoming);
            }
            
            setLoading(false);
        }).catch(() => setLoading(false));
    }, [hasAnalytics, hasLeaves, hasTickets]);


    if (loading) return <div className="page-loader"><div className="loading-spinner" /></div>;

    const calendarEvents = [];
    pending.forEach(l => {
        if (l.start_date) {
            calendarEvents.push({
                date: l.start_date,
                title: `${l.employee_name} (${l.leave_type})`,
                type: 'leave',
                color: '#f59e0b'
            });
        }
    });
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

    resignations.forEach(r => {
        if (r.status === 'approved' || r.status === 'pending') {
            calendarEvents.push({
                date: r.last_working_day,
                title: `${r.employee?.name} (Last Day)`,
                type: 'resignation',
                color: '#ef4444' // Red for resignation
            });
        }
    });

    return (
        <div>
            <div className="page-header">
                <div>
                    <div className="page-title"><FiPieChart style={{ marginRight: 8, verticalAlign: 'middle' }} /> HR Dashboard</div>
                    <div className="page-subtitle">Overview of your team's HR activities</div>
                </div>
            </div>

            <AttendanceWidget />
            <div style={{ marginBottom: 24 }} />

            <WorkspaceOverview />


            {/* Monthly Calendar */}
            <MonthCalendar events={calendarEvents} />

            {/* By Department */}
            {stats?.byDepartment?.length > 0 && (
                <div className="grid-2" style={{ marginBottom: 24 }}>

                    <div className="card">
                        <h3 style={{ marginBottom: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
                            <FiClock className="text-primary" /> Pending Leave Requests
                        </h3>
                        {pending.length === 0 ? (
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FiCheckCircle className="text-success" /> No pending leave requests!
                            </p>
                        ) : pending.slice(0, 5).map(l => (
                            <div key={l._id || l.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{l.employee_name}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
                                            {l.leave_type} leave · {l.total_days} day(s)
                                        </div>
                                    </div>
                                    <span className="badge badge-warning">pending</span>
                                </div>
                            </div>
                        ))}
                    </div>

                    <BirthdayCard events={upcomingEvents} />

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
                </div>
            )}
        </div>
    );
}

