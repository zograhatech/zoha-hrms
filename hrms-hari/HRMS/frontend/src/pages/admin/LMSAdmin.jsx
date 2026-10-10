import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import API from '../../api/axios';
import {
    FiBookOpen, FiPlus, FiX, FiLoader,
    FiCheckCircle, FiEdit2, FiTrash2, FiLayers,
    FiBarChart2, FiVideo, FiFileText, FiHelpCircle,
    FiGrid, FiList, FiEye, FiSettings, FiChevronRight, FiChevronDown, FiUpload, FiLink, FiLayout,
    FiUsers, FiAward, FiActivity
} from 'react-icons/fi';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from 'recharts';

export default function LMSAdmin() {
    const { user } = useAuth();
    const permissions = user?.permissions || [];
    const canManage = user?.role === 'hr_manager' || user?.role === 'admin' || permissions.includes('manage_lms');

    const [activeTab, setActiveTab] = useState('courses');
    const [courses, setCourses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Course Form
    const [showCourseForm, setShowCourseForm] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [courseForm, setCourseForm] = useState({
        title: '',
        description: '',
        category: '',
        level: 'Beginner',
        thumbnail: '',
        published: false,
        modules: []
    });

    // Category Form
    const [showCatForm, setShowCatForm] = useState(false);
    const [catForm, setCatForm] = useState({ name: '', description: '', icon: 'FiBookOpen' });

    const [submitting, setSubmitting] = useState(false);
    const [msg, setMsg] = useState({ text: '', type: '' });

    const loadData = async () => {
        setLoading(true);
        try {
            const [courseRes, catRes] = await Promise.all([
                API.get('/lms/admin/courses'),
                API.get('/lms/categories')
            ]);
            setCourses(courseRes.data.data || []);
            setCategories(catRes.data.data || []);
        } catch (err) {
            setMsg({ text: 'Failed to load LMS data', type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSaveCourse = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingCourse) {
                await API.put(`/lms/admin/courses/${editingCourse._id}`, courseForm);
                setMsg({ text: 'Course updated successfully', type: 'success' });
            } else {
                await API.post('/lms/admin/courses', courseForm);
                setMsg({ text: 'Course created successfully', type: 'success' });
            }
            setShowCourseForm(false);
            loadData();
        } catch (err) {
            setMsg({ text: err.response?.data?.message || 'Error saving course', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteCourse = async (id) => {
        if (!window.confirm('Delete this course? All employee progress will be lost.')) return;
        try {
            await API.delete(`/lms/admin/courses/${id}`);
            setMsg({ text: 'Course deleted', type: 'success' });
            loadData();
        } catch (err) {
            setMsg({ text: 'Failed to delete course', type: 'error' });
        }
    };

    const handleSaveCategory = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await API.post('/lms/categories', catForm);
            setMsg({ text: 'Category created', type: 'success' });
            setShowCatForm(false);
            setCatForm({ name: '', description: '', icon: 'FiBookOpen' });
            loadData();
        } catch (err) {
            setMsg({ text: 'Error saving category', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    const addModule = () => {
        setCourseForm({
            ...courseForm,
            modules: [...courseForm.modules, { title: 'New Module', lessons: [] }]
        });
    };

    const addLesson = (mIdx) => {
        const newModules = [...courseForm.modules];
        newModules[mIdx].lessons.push({ 
            title: 'New Lesson', 
            type: 'video', 
            content: '', 
            videoUrl: '', 
            videoType: 'link',
            questions: [] 
        });
        setCourseForm({ ...courseForm, modules: newModules });
    };

    const handleVideoUpload = async (mIdx, lIdx, file) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('video', file);
        
        // Show local loading state if needed, but for now we'll just disable the submit or use a toast
        setSubmitting(true);
        try {
            const res = await API.post('/lms/admin/upload-video', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            const newModules = [...courseForm.modules];
            newModules[mIdx].lessons[lIdx].videoUrl = res.data.data.url;
            setCourseForm({ ...courseForm, modules: newModules });
            setMsg({ text: 'Video uploaded successfully!', type: 'success' });
        } catch (err) {
            setMsg({ text: 'Failed to upload video.', type: 'error' });
        } finally {
            setSubmitting(false);
        }
    };

    if (loading && !courses.length) return <div className="page-loader"><div className="loading-spinner" /></div>;

    return (
        <div className="lms-admin">
            <div className="page-header">
                <div>
                    <h1 className="page-title"><FiBookOpen style={{ marginRight: 8 }} /> LMS Management</h1>
                    <p className="page-subtitle">Create and manage internal learning resources</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button className="btn btn-outline" onClick={() => setShowCatForm(true)}>
                        <FiLayers /> New Category
                    </button>
                    <button className="btn btn-primary" onClick={() => {
                        setEditingCourse(null);
                        setCourseForm({ title: '', description: '', category: '', level: 'Beginner', thumbnail: '', published: false, modules: [] });
                        setShowCourseForm(true);
                    }}>
                        <FiPlus /> Create Course
                    </button>
                </div>
            </div>

            {msg.text && (
                <div className={`alert alert-${msg.type}`} style={{ marginBottom: 20 }}>
                    {msg.text}
                </div>
            )}

            <div className="tabs" style={{ marginBottom: 24, borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 30 }}>
                <button className={`tab-btn ${activeTab === 'courses' ? 'active' : ''}`} onClick={() => setActiveTab('courses')}>
                    <FiGrid /> Courses ({courses.length})
                </button>
                <button className={`tab-btn ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>
                    <FiLayers /> Categories ({categories.length})
                </button>
                <button className={`tab-btn ${activeTab === 'analytics' ? 'active' : ''}`} onClick={() => setActiveTab('analytics')}>
                    <FiBarChart2 /> Analytics
                </button>
            </div>

            {activeTab === 'courses' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                    {courses.map(course => (
                        <div key={course._id} className="card lms-card" style={{ padding: 0, overflow: 'hidden' }}>
                            <div style={{ height: 160, background: 'var(--bg-secondary)', position: 'relative' }}>
                                {course.thumbnail ? (
                                    <img src={course.thumbnail} alt={course.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div className="flex-center" style={{ height: '100%', color: 'var(--text-muted)' }}>
                                        <FiBookOpen size={48} opacity={0.3} />
                                    </div>
                                )}
                                <div style={{ position: 'absolute', top: 12, right: 12 }}>
                                    <span className={`badge badge-${course.published ? 'success' : 'warning'}`}>
                                        {course.published ? 'Published' : 'Draft'}
                                    </span>
                                </div>
                                <div style={{ position: 'absolute', bottom: 12, left: 12 }}>
                                    <span className="badge" style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none' }}>
                                        {course.category?.name || 'General'}
                                    </span>
                                </div>
                            </div>
                            <div style={{ padding: 20 }}>
                                <div style={{ fontSize: '0.8rem', color: 'var(--accent-light)', fontWeight: 700, marginBottom: 4 }}>{course.id}</div>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>{course.title}</h3>
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', height: 40, marginBottom: 16 }}>
                                    {course.description}
                                </p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    <span>{course.modules?.length || 0} Modules</span>
                                    <span>{course.totalEnrollments || 0} Learners</span>
                                </div>
                            </div>
                            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: 10 }}>
                                <button className="btn btn-sm btn-outline" style={{ flex: 1 }} onClick={() => {
                                    setEditingCourse(course);
                                    setCourseForm({
                                        title: course.title,
                                        description: course.description,
                                        category: course.category?._id || '',
                                        level: course.level,
                                        thumbnail: course.thumbnail || '',
                                        published: course.published,
                                        modules: course.modules || []
                                    });
                                    setShowCourseForm(true);
                                }}>
                                    <FiEdit2 size={14} /> Edit
                                </button>
                                <button className="btn btn-sm btn-icon text-error" onClick={() => handleDeleteCourse(course._id)}>
                                    <FiTrash2 size={14} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {courses.length === 0 && (
                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px 0' }}>
                            <FiBookOpen size={64} style={{ opacity: 0.1, marginBottom: 20 }} />
                            <h3>No courses created yet</h3>
                            <p className="text-muted">Start by adding your first educational resource</p>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'categories' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                    {categories.map(cat => (
                        <div key={cat._id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--gradient-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <FiLayers />
                            </div>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 700 }}>{cat.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{cat.description || 'No description'}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {activeTab === 'analytics' && (
                <div className="analytics-content">
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 30 }}>
                         <div className="card analytics-stat-card">
                             <div className="stat-icon" style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--accent-light)' }}>
                                 <FiBookOpen />
                             </div>
                             <div className="stat-info">
                                 <div className="stat-value">{courses.length}</div>
                                 <div className="stat-label">Total Courses</div>
                             </div>
                         </div>
                         <div className="card analytics-stat-card">
                             <div className="stat-icon" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                                 <FiUsers />
                             </div>
                             <div className="stat-info">
                                 <div className="stat-value">{courses.reduce((sum, c) => sum + (c.totalEnrollments || 0), 0)}</div>
                                 <div className="stat-label">Total Learners</div>
                             </div>
                         </div>
                         <div className="card analytics-stat-card">
                             <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}>
                                 <FiActivity />
                             </div>
                             <div className="stat-info">
                                 <div className="stat-value">{courses.filter(c => c.published).length}</div>
                                 <div className="stat-label">Published Courses</div>
                             </div>
                         </div>
                         <div className="card analytics-stat-card">
                             <div className="stat-icon" style={{ background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
                                 <FiAward />
                             </div>
                             <div className="stat-info">
                                 <div className="stat-value">{courses.reduce((sum, c) => sum + (c.modules?.length || 0), 0)}</div>
                                 <div className="stat-label">Learning Modules</div>
                             </div>
                         </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 20 }}>
                         <div className="card" style={{ padding: 24 }}>
                             <h4 style={{ marginBottom: 20 }}>Enrollment by Course</h4>
                             <div style={{ height: 350 }}>
                                 <ResponsiveContainer width="100%" height="100%">
                                     <BarChart data={courses.slice(0, 10)}>
                                         <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                         <XAxis dataKey="title" fontSize={11} tick={{ fill: 'var(--text-secondary)' }} hide={courses.length > 5} />
                                         <YAxis fontSize={11} tick={{ fill: 'var(--text-secondary)' }} />
                                         <Tooltip 
                                            contentStyle={{ borderRadius: 10, border: 'none', boxShadow: 'var(--shadow-lg)' }}
                                         />
                                         <Bar dataKey="totalEnrollments" fill="var(--accent-light)" radius={[6, 6, 0, 0]} barSize={40} />
                                     </BarChart>
                                 </ResponsiveContainer>
                             </div>
                         </div>

                         <div className="card" style={{ padding: 24 }}>
                             <h4 style={{ marginBottom: 20 }}>Category Distribution</h4>
                             <div style={{ height: 350 }}>
                                 <ResponsiveContainer width="100%" height="100%">
                                     <PieChart>
                                         <Pie
                                             data={categories.map(cat => ({
                                                 name: cat.name,
                                                 value: courses.filter(c => c.category?._id === cat._id).length
                                             }))}
                                             innerRadius={60}
                                             outerRadius={100}
                                             paddingAngle={5}
                                             dataKey="value"
                                         >
                                             {categories.map((entry, index) => (
                                                 <Cell key={`cell-${index}`} fill={[
                                                     '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'
                                                 ][index % 6]} />
                                             ))}
                                         </Pie>
                                         <Tooltip />
                                         <Legend />
                                     </PieChart>
                                 </ResponsiveContainer>
                             </div>
                         </div>
                    </div>
                </div>
            )}

            {/* Course Builder Modal */}
            {showCourseForm && (
                <div className="modal-overlay" onClick={() => setShowCourseForm(false)}>
                    <div className="modal" style={{ maxWidth: 800, width: '90%' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{editingCourse ? 'Edit Course' : 'Create Course'}</h3>
                            <button className="modal-close" onClick={() => setShowCourseForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSaveCourse}>
                            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                    <div className="form-group">
                                        <label className="form-label">Course Title</label>
                                        <input className="form-input" value={courseForm.title} onChange={e => setCourseForm({ ...courseForm, title: e.target.value })} required />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Category</label>
                                        <select className="form-select" value={courseForm.category} onChange={e => setCourseForm({ ...courseForm, category: e.target.value })} required>
                                            <option value="">Select Category</option>
                                            {categories.map(cat => <option key={cat._id} value={cat._id}>{cat.name}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" rows={3} value={courseForm.description} onChange={e => setCourseForm({ ...courseForm, description: e.target.value })} required />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                                    <div className="form-group">
                                        <label className="form-label">Thumbnail URL</label>
                                        <input className="form-input" placeholder="https://..." value={courseForm.thumbnail} onChange={e => setCourseForm({ ...courseForm, thumbnail: e.target.value })} />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Level</label>
                                        <select className="form-select" value={courseForm.level} onChange={e => setCourseForm({ ...courseForm, level: e.target.value })}>
                                            <option value="Beginner">Beginner</option>
                                            <option value="Intermediate">Intermediate</option>
                                            <option value="Advanced">Advanced</option>
                                        </select>
                                    </div>
                                </div>

                                <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <input type="checkbox" checked={courseForm.published} onChange={e => setCourseForm({ ...courseForm, published: e.target.checked })} />
                                    <label>Publish this course immediately</label>
                                </div>

                                <hr style={{ margin: '20px 0', borderColor: 'var(--border-color)' }} />
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                    <h4 style={{ margin: 0 }}>Course Content</h4>
                                    <button type="button" className="btn btn-sm btn-outline" onClick={addModule}>
                                        <FiPlus /> Add Module
                                    </button>
                                </div>

                                {courseForm.modules.map((mod, mIdx) => (
                                    <div key={mIdx} className="card" style={{ marginBottom: 16, background: 'var(--bg-secondary)' }}>
                                        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                                            <input 
                                                className="form-input" 
                                                style={{ fontWeight: 700 }} 
                                                value={mod.title} 
                                                onChange={e => {
                                                    const newMods = [...courseForm.modules];
                                                    newMods[mIdx].title = e.target.value;
                                                    setCourseForm({ ...courseForm, modules: newMods });
                                                }} 
                                            />
                                            <button type="button" className="btn btn-sm btn-icon text-error" onClick={() => {
                                                const newMods = [...courseForm.modules];
                                                newMods.splice(mIdx, 1);
                                                setCourseForm({ ...courseForm, modules: newMods });
                                            }}><FiTrash2 size={14} /></button>
                                        </div>
                                        
                                        <div style={{ paddingLeft: 20 }}>
                                            {mod.lessons.map((lesson, lIdx) => (
                                                    <div key={lIdx} style={{ marginBottom: 12, border: '1px solid var(--border-color)', borderRadius: 12, background: 'var(--bg-primary)', overflow: 'hidden' }}>
                                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.02)' }}>
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 800 }}>{lIdx + 1}</span>
                                                            <select 
                                                                className="form-select" 
                                                                style={{ width: 110, padding: '4px 8px', margin: 0 }}
                                                                value={lesson.type}
                                                                onChange={e => {
                                                                    const newMods = [...courseForm.modules];
                                                                    newMods[mIdx].lessons[lIdx].type = e.target.value;
                                                                    setCourseForm({ ...courseForm, modules: newMods });
                                                                }}
                                                            >
                                                                <option value="video">Video</option>
                                                                <option value="reading">Reading</option>
                                                                <option value="quiz">Quiz</option>
                                                            </select>
                                                            <input 
                                                                className="form-input" 
                                                                style={{ flex: 1, padding: '4px 8px', margin: 0, fontWeight: 600 }} 
                                                                placeholder="Lesson Title"
                                                                value={lesson.title}
                                                                onChange={e => {
                                                                    const newMods = [...courseForm.modules];
                                                                    newMods[mIdx].lessons[lIdx].title = e.target.value;
                                                                    setCourseForm({ ...courseForm, modules: newMods });
                                                                }}
                                                            />
                                                            <button type="button" className="btn btn-sm btn-icon text-error" onClick={() => {
                                                                const newMods = [...courseForm.modules];
                                                                newMods[mIdx].lessons.splice(lIdx, 1);
                                                                setCourseForm({ ...courseForm, modules: newMods });
                                                            }}><FiX size={14} /></button>
                                                        </div>
                                                        
                                                        <div style={{ padding: '12px 14px' }}>
                                                            {lesson.type === 'video' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`vd-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.videoType !== 'upload'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].videoType = 'link';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiLink size={14} /> Video Link
                                                                        </label>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`vd-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.videoType === 'upload'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].videoType = 'upload';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiUpload size={14} /> Upload Video
                                                                        </label>
                                                                    </div>
                                                                    
                                                                    {lesson.videoType === 'upload' ? (
                                                                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                                                                            <input 
                                                                                type="file" 
                                                                                accept="video/*" 
                                                                                onChange={(e) => handleVideoUpload(mIdx, lIdx, e.target.files[0])} 
                                                                                style={{ fontSize: '0.8rem' }}
                                                                            />
                                                                            {lesson.videoUrl && <span className="text-success" style={{ fontSize: '0.75rem' }}><FiCheckCircle /> Uploaded</span>}
                                                                        </div>
                                                                    ) : (
                                                                        <input 
                                                                            className="form-input" 
                                                                            placeholder="YouTube / Vimeo / Cloud URL" 
                                                                            value={lesson.videoUrl || ''} 
                                                                            onChange={e => {
                                                                                const n = [...courseForm.modules];
                                                                                n[mIdx].lessons[lIdx].videoUrl = e.target.value;
                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                            }} 
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                            {lesson.type === 'reading' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                    <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`rd-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.readingType !== 'link'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].readingType = 'text';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiFileText size={14} /> Text Content
                                                                        </label>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`rd-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.readingType === 'link'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].readingType = 'link';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiLink size={14} /> Document Link
                                                                        </label>
                                                                    </div>
                                                                    
                                                                    {lesson.readingType === 'link' ? (
                                                                        <input 
                                                                            className="form-input" 
                                                                            placeholder="External Article / PDF / Doc URL" 
                                                                            value={lesson.docUrl || ''} 
                                                                            onChange={e => {
                                                                                const n = [...courseForm.modules];
                                                                                n[mIdx].lessons[lIdx].docUrl = e.target.value;
                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                            }} 
                                                                        />
                                                                    ) : (
                                                                        <textarea 
                                                                            className="form-textarea" 
                                                                            rows={3} 
                                                                            placeholder="Lesson Content (Markdown Supported)" 
                                                                            value={lesson.content || ''}
                                                                            onChange={e => {
                                                                                const n = [...courseForm.modules];
                                                                                n[mIdx].lessons[lIdx].content = e.target.value;
                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                            }}
                                                                        />
                                                                    )}
                                                                </div>
                                                            )}
                                                            {lesson.type === 'quiz' && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                                                     <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`qz-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.quizType !== 'link'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].quizType = 'internal';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiLayout size={14} /> Internal Quiz
                                                                        </label>
                                                                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.85rem' }}>
                                                                            <input 
                                                                                type="radio" 
                                                                                name={`qz-type-${mIdx}-${lIdx}`} 
                                                                                checked={lesson.quizType === 'link'} 
                                                                                onChange={() => {
                                                                                    const n = [...courseForm.modules];
                                                                                    n[mIdx].lessons[lIdx].quizType = 'link';
                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                }} 
                                                                            />
                                                                            <FiLink size={14} /> External Link
                                                                        </label>
                                                                    </div>

                                                                    {lesson.quizType === 'link' ? (
                                                                        <input 
                                                                            className="form-input" 
                                                                            placeholder="External Quiz URL (Google Forms, etc.)" 
                                                                            value={lesson.quizLink || ''} 
                                                                            onChange={e => {
                                                                                const n = [...courseForm.modules];
                                                                                n[mIdx].lessons[lIdx].quizLink = e.target.value;
                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                            }} 
                                                                        />
                                                                    ) : (
                                                                        <div style={{ padding: 12, background: 'rgba(0,0,0,0.02)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
                                                                            <h5 style={{ margin: '0 0 12px', fontSize: '0.85rem' }}>Internal Quiz Questions</h5>
                                                                            {(lesson.questions || []).map((q, qIdx) => (
                                                                                <div key={qIdx} style={{ marginBottom: 16, padding: '12px', background: 'var(--bg-primary)', borderRadius: 10, boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>
                                                                                    <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                                                                                        <span style={{ fontWeight: 800, fontSize: '0.8rem', opacity: 0.5 }}>Q{qIdx+1}</span>
                                                                                        <input 
                                                                                            className="form-input" 
                                                                                            style={{ height: 32, fontSize: '0.85rem' }}
                                                                                            placeholder="Enter question text..." 
                                                                                            value={q.text} 
                                                                                            onChange={e => {
                                                                                                const n = [...courseForm.modules];
                                                                                                n[mIdx].lessons[lIdx].questions[qIdx].text = e.target.value;
                                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                                            }}
                                                                                        />
                                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                                                                                            <span style={{ fontSize: '0.7rem', fontWeight: 700, whiteSpace: 'nowrap' }}>Pts</span>
                                                                                            <input 
                                                                                                type="number"
                                                                                                className="form-input" 
                                                                                                style={{ width: 45, height: 26, fontSize: '0.8rem', padding: 2, textAlign: 'center', margin: 0, border: 'none', background: 'transparent' }}
                                                                                                value={q.points || 1} 
                                                                                                onChange={e => {
                                                                                                    const n = [...courseForm.modules];
                                                                                                    n[mIdx].lessons[lIdx].questions[qIdx].points = parseInt(e.target.value) || 1;
                                                                                                    setCourseForm({ ...courseForm, modules: n });
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                        <button type="button" className="btn btn-sm btn-icon text-error" onClick={() => {
                                                                                            const n = [...courseForm.modules];
                                                                                            n[mIdx].lessons[lIdx].questions.splice(qIdx, 1);
                                                                                            setCourseForm({ ...courseForm, modules: n });
                                                                                        }}><FiTrash2 size={12} /></button>
                                                                                    </div>
                                                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, paddingLeft: 25 }}>
                                                                                        {(q.options || []).map((opt, oIdx) => (
                                                                                            <div key={oIdx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                                                <input 
                                                                                                    type="radio" 
                                                                                                    checked={q.correctOption === oIdx} 
                                                                                                    onChange={() => {
                                                                                                        const n = [...courseForm.modules];
                                                                                                        n[mIdx].lessons[lIdx].questions[qIdx].correctOption = oIdx;
                                                                                                        setCourseForm({ ...courseForm, modules: n });
                                                                                                    }}
                                                                                                />
                                                                                                <input 
                                                                                                    className="form-input" 
                                                                                                    style={{ height: 28, fontSize: '0.8rem', margin: 0 }}
                                                                                                    placeholder={`Option ${oIdx+1}`} 
                                                                                                    value={opt}
                                                                                                    onChange={e => {
                                                                                                        const n = [...courseForm.modules];
                                                                                                        n[mIdx].lessons[lIdx].questions[qIdx].options[oIdx] = e.target.value;
                                                                                                        setCourseForm({ ...courseForm, modules: n });
                                                                                                    }}
                                                                                                />
                                                                                            </div>
                                                                                        ))}
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            <button type="button" className="btn btn-sm btn-outline" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => {
                                                                                const n = [...courseForm.modules];
                                                                                if (!n[mIdx].lessons[lIdx].questions) n[mIdx].lessons[lIdx].questions = [];
                                                                                n[mIdx].lessons[lIdx].questions.push({ text: '', options: ['', '', '', ''], correctOption: 0, points: 1 });
                                                                                setCourseForm({ ...courseForm, modules: n });
                                                                            }}>+ Add Question</button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                            ))}
                                            <button type="button" className="btn btn-sm btn-link" onClick={() => addLesson(mIdx)} style={{ fontSize: '0.8rem' }}>
                                                + Add Lesson
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowCourseForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>
                                    {submitting ? <FiLoader className="spin" /> : <FiCheckCircle />} {editingCourse ? 'Update Course' : 'Create Course'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Category Modal */}
            {showCatForm && (
                <div className="modal-overlay" onClick={() => setShowCatForm(false)}>
                    <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">New Category</h3>
                            <button className="modal-close" onClick={() => setShowCatForm(false)}><FiX /></button>
                        </div>
                        <form onSubmit={handleSaveCategory}>
                            <div className="modal-body">
                                <div className="form-group">
                                    <label className="form-label">Category Name</label>
                                    <input className="form-input" value={catForm.name} onChange={e => setCatForm({ ...catForm, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea className="form-textarea" value={catForm.description} onChange={e => setCatForm({ ...catForm, description: e.target.value })} />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-outline" onClick={() => setShowCatForm(false)}>Cancel</button>
                                <button type="submit" className="btn btn-primary" disabled={submitting}>Save Category</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .lms-card {
                    transition: all 0.3s ease;
                }
                .lms-card:hover {
                    transform: translateY(-5px);
                    box-shadow: var(--shadow-xl) !important;
                }
                .tab-btn {
                    padding: 12px 10px;
                    background: none;
                    border: none;
                    color: var(--text-muted);
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    border-bottom: 2px solid transparent;
                    transition: all 0.2s;
                }
                .tab-btn.active {
                    color: var(--accent-light);
                    border-bottom-color: var(--accent-light);
                }
                .badge {
                    padding: 4px 8px;
                    border-radius: 6px;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                }
                .badge-success { background: rgba(34, 197, 94, 0.1); color: #22c55e; }
                .badge-warning { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }

                .analytics-stat-card {
                    display: flex;
                    align-items: center;
                    gap: 16px;
                    padding: 20px !important;
                }
                .stat-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 1.2rem;
                }
                .stat-value {
                    font-size: 1.5rem;
                    font-weight: 800;
                    line-height: 1;
                    margin-bottom: 4px;
                }
                .stat-label {
                    font-size: 0.8rem;
                    color: var(--text-muted);
                    font-weight: 500;
                }
            `}</style>
        </div>
    );
}
