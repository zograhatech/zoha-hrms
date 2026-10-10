import { useState, useEffect } from 'react';
import API from '../../api/axios';
import { useNavigate } from 'react-router-dom';
import {
    FiBookOpen, FiPlay, FiCheckCircle, FiClock,
    FiBook, FiTrendingUp, FiLayers, FiSearch,
    FiMoreVertical, FiShare2, FiStar, FiFilter,
    FiExternalLink
} from 'react-icons/fi';

export default function MyLearning() {
    const navigate = useNavigate();

    const [myCourses, setMyCourses] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('enrolled');
    const [searchTerm, setSearchTerm] = useState('');
    const [msg, setMsg] = useState({ text: '', type: '' });

    const loadData = async () => {
        setLoading(true);
        try {
            const [myRes, catRes] = await Promise.all([
                API.get('/lms/my-learning'),
                API.get('/lms/courses')
            ]);
            setMyCourses(myRes.data.data || []);
            setCatalog(catRes.data.data || []);
        } catch (err) {
            setMsg({ text: 'Failed to sync learning data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleEnroll = async (courseId) => {
        try {
            await API.post(`/lms/enroll/${courseId}`);
            setMsg({ text: 'Successfully enrolled!', type: 'success' });
            loadData();
            setActiveTab('enrolled');
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Enrollment failed', type: 'error' });
        }
    };

    const filteredCatalog = catalog.filter(c => 
        c.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
        c.category?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const stats = {
        inProgress: myCourses.filter(c => c.status === 'In Progress').length,
        completed: myCourses.filter(c => c.status === 'Completed').length,
        totalHours: Math.round(myCourses.reduce((acc, c) => acc + (c.course?.estimatedTime || 0), 0) / 60)
    };

    if (loading && !myCourses.length) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className="my-learning-page">
            <div className="page-header" style={{ marginBottom: 30 }}>
                <div>
                    <h1 className="page-title"><FiBookOpen style={{ marginRight: 8 }} /> My Learning</h1>
                    <p className="page-subtitle">Develop your skills and track your progress</p>
                </div>
                <div style={{ display: 'flex', gap: 20 }}>
                    <div className="stat-pill" style={{ display: 'flex', gap: 15, background: 'var(--bg-secondary)', padding: '10px 20px', borderRadius: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, color: 'var(--accent-light)' }}>{stats.inProgress}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>In Progress</div>
                        </div>
                        <div style={{ width: 1, background: 'var(--border-color)' }}></div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontWeight: 800, color: '#22c55e' }}>{stats.completed}</div>
                            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Completed</div>
                        </div>
                    </div>
                </div>
            </div>

            {msg.text && (
                <div className={`alert alert-${msg.type}`} style={{ marginBottom: 20 }}>
                    {msg.text}
                </div>
            )}

            <div className="learning-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid var(--border-color)' }}>
                <div className="tabs" style={{ display: 'flex', gap: 30 }}>
                    <button className={`tab-btn ${activeTab === 'enrolled' ? 'active' : ''}`} onClick={() => setActiveTab('enrolled')}>
                        My Enrolled Courses ({myCourses.length})
                    </button>
                    <button className={`tab-btn ${activeTab === 'catalog' ? 'active' : ''}`} onClick={() => setActiveTab('catalog')}>
                        Browse Catalog
                    </button>
                </div>
                <div style={{ display: 'flex', gap: 10, paddingBottom: 10 }}>
                    <div style={{ position: 'relative' }}>
                        <FiSearch style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                        <input 
                            className="form-input" 
                            style={{ paddingLeft: 36, width: 240, height: 36, fontSize: '0.85rem' }} 
                            placeholder="Search courses..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            {activeTab === 'enrolled' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
                    {myCourses.map(enroll => (
                        <div key={enroll._id} className="card course-card" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => navigate(`/dashboard/course/${enroll.course._id}`)}>
                            <div style={{ height: 160, background: 'var(--bg-secondary)', position: 'relative' }}>
                                <img src={enroll.course.thumbnail || 'https://via.placeholder.com/400x200'} alt={enroll.course.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.2)' }}>
                                    <div style={{ height: '100%', width: `${enroll.progress}%`, background: 'var(--gradient-primary)', transition: 'width 0.5s ease-out' }}></div>
                                </div>
                                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                    <span className={`badge badge-${enroll.status === 'Completed' ? 'success' : 'primary'}`} style={{ boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                                        {enroll.status}
                                    </span>
                                </div>
                            </div>
                            <div style={{ padding: 20 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-light)' }}>{enroll.course.category?.name}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{enroll.progress}% Done</span>
                                </div>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.05rem', lineHeight: 1.4 }}>{enroll.course.title}</h3>
                                <div style={{ display: 'flex', gap: 15, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiLayers /> {enroll.course.modules?.length} Modules</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><FiTrendingUp /> {enroll.course.level}</span>
                                </div>
                            </div>
                            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    Last active: {new Date(enroll.lastAccessedAt).toLocaleDateString()}
                                </div>
                                <button className="btn btn-sm btn-primary">
                                    {enroll.status === 'Completed' ? 'Review' : 'Resume'} <FiPlay style={{ marginLeft: 5 }} size={12} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {myCourses.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '80px 0' }}>
                            <FiBook size={64} style={{ opacity: 0.1, marginBottom: 20 }} />
                            <h3>Not enrolled in any courses</h3>
                            <button className="btn btn-link" onClick={() => setActiveTab('catalog')}>Browse the library to get started</button>
                        </div>
                    )}
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 24 }}>
                    {filteredCatalog.map(course => {
                        const isEnrolled = myCourses.some(mc => mc.course._id === course._id);
                        return (
                            <div key={course._id} className="card course-card catalogue-item" style={{ padding: 0, overflow: 'hidden' }}>
                                <div style={{ height: 150, background: 'var(--bg-secondary)', position: 'relative' }}>
                                    <img src={course.thumbnail || 'https://via.placeholder.com/400x200'} alt={course.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                        <span className="badge" style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none' }}>{course.level}</span>
                                    </div>
                                </div>
                                <div style={{ padding: 20 }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--accent-light)', fontWeight: 700 }}>{course.category?.name}</span>
                                    <h3 style={{ margin: '4px 0 10px 0', fontSize: '1rem' }}>{course.title}</h3>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', height: 40, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                        {course.description}
                                    </p>
                                    <div style={{ marginTop: 15, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ display: 'flex', gap: 10, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><FiClock /> 4h 20m</span>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><FiCheckCircle /> Cert.</span>
                                        </div>
                                        {isEnrolled ? (
                                            <button className="btn btn-sm btn-outline disabled" disabled>Enrolled</button>
                                        ) : (
                                            <button className="btn btn-sm btn-primary" onClick={() => handleEnroll(course._id)}>Enroll Now</button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <style>{`
                .course-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid var(--border-color); }
                .course-card:hover { transform: translateY(-5px); box-shadow: var(--shadow-xl); border-color: var(--accent-light); }
                .tab-btn { padding: 16px 5px; background: none; border: none; color: var(--text-muted); font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s; }
                .tab-btn.active { color: var(--accent-light); border-bottom-color: var(--accent-light); }
                .badge-primary { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
                .catalogue-item { opacity: 0; animation: fadeIn 0.4s forwards; }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>
    );
}
